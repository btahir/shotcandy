/**
 * Style overrides for batch items: a sparse tree of the scene's style fields
 * (everything but the per-image keys) that differ from the shared style.
 *
 * - Leaves replace; plain objects merge. Objects that must stay whole (a
 *   background fill, a canvas size, a motion, any `{ kind }` union, arrays)
 *   are leaves too, so an override never mixes two variants.
 * - `null` means "absent" (no stack, no motion…): in the style part of a scene
 *   a missing optional layer and a null one mean the same thing.
 * - Overrides are always kept minimal: `diffStyle(shared, effective)`. A value
 *   set back to the shared one stops being an override.
 *
 * Differences are reported per inspector group (Background, Layout, Frame,
 * Size, Motion); the style preset id is bookkeeping and never counts alone.
 */
import type { Scene } from "../scene/types";

/** Scene keys that belong to each image, never to the shared style. */
export const ITEM_KEYS = ["content", "annotations", "caption"] as const;
const SKIP = new Set<string>(["version", ...ITEM_KEYS]);

/** Paths (dot-joined) whose values are replaced whole. */
const ATOMIC = new Set([
  "canvas.size",
  "background.fill",
  "background.span",
  "background.texture",
  "background.vignette",
  "card.stack",
  "card.reflection",
  "animation",
]);

export type StyleOverrides = { [key: string]: unknown };

export type OverrideGroup = "background" | "layout" | "frame" | "size" | "motion";
export const OVERRIDE_GROUPS: readonly OverrideGroup[] = [
  "background",
  "layout",
  "frame",
  "size",
  "motion",
];
export const GROUP_LABELS: Record<OverrideGroup, string> = {
  background: "Background",
  layout: "Layout",
  frame: "Frame",
  size: "Size",
  motion: "Motion",
};

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const none = (v: unknown) => v === undefined || v === null;

function atomic(path: string[], v: unknown): boolean {
  return ATOMIC.has(path.join(".")) || !isPlain(v) || "kind" in v;
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (none(a) && none(b)) return true;
  if (typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffNode(path: string[], base: unknown, target: unknown): unknown {
  if (same(base, target)) return undefined;
  if (none(target)) return null;
  if (none(base) || atomic(path, base) || atomic(path, target)) return target;
  const b = base as Plain;
  const t = target as Plain;
  const out: Plain = {};
  let any = false;
  for (const k of new Set([...Object.keys(b), ...Object.keys(t)])) {
    const d = diffNode([...path, k], b[k], t[k]);
    if (d !== undefined) {
      out[k] = d;
      any = true;
    }
  }
  return any ? out : undefined;
}

/** The style part of a scene's meta: only the preset id is style. */
const metaStyle = (s: Scene) => ({ stylePresetId: s.meta.stylePresetId });

/**
 * Style fields where `target` differs from `base` (sparse), or undefined when
 * the looks are the same. A difference in the preset id alone doesn't count.
 */
export function diffStyle(base: Scene, target: Scene): StyleOverrides | undefined {
  const out: StyleOverrides = {};
  let groups = false;
  const b = base as unknown as Plain;
  const t = target as unknown as Plain;
  for (const k of new Set([...Object.keys(b), ...Object.keys(t)])) {
    if (SKIP.has(k)) continue;
    const d =
      k === "meta" ? diffNode([k], metaStyle(base), metaStyle(target)) : diffNode([k], b[k], t[k]);
    if (d === undefined) continue;
    out[k] = d;
    if (k !== "meta") groups = true;
  }
  return groups ? out : undefined;
}

function applyNode(path: string[], base: unknown, ov: unknown): unknown {
  if (ov === null) return undefined;
  if (!isPlain(ov) || none(base) || atomic(path, base) || atomic(path, ov)) return ov;
  const out: Plain = { ...(base as Plain) };
  for (const [k, v] of Object.entries(ov)) {
    if (v === undefined) continue;
    const next = applyNode([...path, k], out[k], v);
    if (next === undefined) delete out[k];
    else out[k] = next;
  }
  return out;
}

/** The scene with style overrides applied (per-image keys are left alone). */
export function applyStyle(base: Scene, ov: StyleOverrides | undefined): Scene {
  if (!ov) return base;
  const out: Plain = { ...(base as unknown as Plain) };
  for (const [k, v] of Object.entries(ov)) {
    if (SKIP.has(k) || v === undefined) continue;
    if (k === "meta") {
      const id = isPlain(v) ? v.stylePresetId : undefined;
      const meta = { ...base.meta };
      if (id === null) delete meta.stylePresetId;
      else if (typeof id === "string") meta.stylePresetId = id;
      out.meta = meta;
      continue;
    }
    const next = applyNode([k], out[k], v);
    if (next === undefined) delete out[k];
    else out[k] = next;
  }
  return out as unknown as Scene;
}

/** Keep only overrides that still differ from `shared` (after it changed). */
export function pruneOverrides(
  shared: Scene,
  ov: StyleOverrides | undefined,
): StyleOverrides | undefined {
  if (!ov) return undefined;
  return diffStyle(shared, applyStyle(shared, ov));
}

/** The inspector group a style path belongs to (null: bookkeeping only). */
export function pathGroup(path: readonly string[]): OverrideGroup | null {
  const [a, b] = path;
  if (a === "meta") return null;
  if (a === "background") return "background";
  if (a === "animation") return "motion";
  if (a === "canvas") return b === "size" ? "size" : "layout";
  if (a === "card") return b === "frame" ? "frame" : "layout";
  return "layout";
}

function walk(node: unknown, path: string[], fn: (path: string[]) => void) {
  if (isPlain(node) && !atomic(path, node) && path.length) {
    for (const [k, v] of Object.entries(node)) walk(v, [...path, k], fn);
  } else if (path.length) fn(path);
}

/** Groups an item's overrides touch, in inspector order. */
export function overrideGroups(ov: StyleOverrides | undefined): OverrideGroup[] {
  if (!ov) return [];
  const found = new Set<OverrideGroup>();
  for (const [k, v] of Object.entries(ov))
    walk(v, [k], (p) => {
      const g = pathGroup(p);
      if (g) found.add(g);
    });
  return OVERRIDE_GROUPS.filter((g) => found.has(g));
}

function filterNode(node: unknown, path: string[], drop: (p: string[]) => boolean): unknown {
  if (isPlain(node) && !atomic(path, node) && path.length) {
    const out: Plain = {};
    let any = false;
    for (const [k, v] of Object.entries(node)) {
      const f = filterNode(v, [...path, k], drop);
      if (f !== undefined) {
        out[k] = f;
        any = true;
      }
    }
    return any ? out : undefined;
  }
  return drop(path) ? undefined : node;
}

/** Overrides without the given groups (all of them when omitted). */
export function dropGroups(
  ov: StyleOverrides | undefined,
  groups?: readonly OverrideGroup[],
): StyleOverrides | undefined {
  if (!ov || !groups) return undefined;
  const set = new Set(groups);
  const out: StyleOverrides = {};
  let real = false;
  for (const [k, v] of Object.entries(ov)) {
    const f = filterNode(v, [k], (p) => {
      const g = pathGroup(p);
      return g !== null && set.has(g);
    });
    if (f === undefined) continue;
    out[k] = f;
    if (k !== "meta") real = true;
  }
  return real ? out : undefined;
}

/** Overrides without any path that `changed` sets (an edit under "All" wins on the image you see). */
export function withoutPaths(
  ov: StyleOverrides | undefined,
  changed: StyleOverrides,
): StyleOverrides | undefined {
  if (!ov) return undefined;
  const strip = (node: Plain, ch: Plain, path: string[]): Plain | undefined => {
    const out: Plain = { ...node };
    for (const [k, c] of Object.entries(ch)) {
      if (!(k in out)) continue;
      const p = [...path, k];
      const cur = out[k];
      if (isPlain(c) && !atomic(p, c) && isPlain(cur) && !atomic(p, cur)) {
        const inner = strip(cur, c, p);
        if (inner) out[k] = inner;
        else delete out[k];
      } else delete out[k];
    }
    return Object.keys(out).length ? out : undefined;
  };
  const res = strip(ov, changed, []);
  if (!res) return undefined;
  return Object.keys(res).some((k) => k !== "meta") ? res : undefined;
}
