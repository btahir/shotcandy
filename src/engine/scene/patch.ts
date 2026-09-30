/**
 * Immutable scene updates. Every helper returns a new object and shares
 * untouched branches, so UI stores can compare by reference and history can
 * keep snapshots cheaply.
 */
import type { Annotation, Scene, StylePatch } from "./types";

type Plain = Record<string, unknown>;

const isPlain = (v: unknown): v is Plain =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Deep-merge `patch` into `base`. Plain objects merge recursively; arrays and
 * primitives replace. A discriminated union value (object with `kind`) whose
 * kind changes replaces wholesale so stale fields from the old variant vanish.
 */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlain(base) || !isPlain(patch)) return (patch === undefined ? base : patch) as T;
  if ("kind" in patch && "kind" in base && patch.kind !== base.kind) return patch as T;
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isPlain(v) && isPlain(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

/** Optional style layers a patch clears with `null` (the key is then removed). */
function dropCleared<T extends object>(obj: T, keys: readonly string[]): T {
  if (!keys.some((k) => (obj as Record<string, unknown>)[k] === null)) return obj;
  const out = { ...obj } as Record<string, unknown>;
  for (const k of keys) if (out[k] === null) delete out[k];
  return out as T;
}

/** Apply a style preset: only style fields change; content, size and annotations stay. */
export function applyStylePatch(scene: Scene, patch: StylePatch, presetId?: string): Scene {
  const merged = deepMerge(scene, patch as unknown as Partial<Scene>);
  const next: Scene = {
    ...merged,
    background: dropCleared(merged.background, ["texture", "vignette"]),
    card: dropCleared(merged.card, ["stack", "reflection"]),
  };
  return presetId ? { ...next, meta: { ...next.meta, stylePresetId: presetId } } : next;
}

/** Extract the style-only part of a scene (for "save as preset"). */
export function extractStylePatch(scene: Scene): StylePatch {
  const { card, background, canvas } = JSON.parse(JSON.stringify(scene)) as Scene;
  return {
    canvas: {
      padding: canvas.padding,
      anchor: canvas.anchor ?? "center",
      bleed: canvas.bleed ?? 0,
    },
    background: {
      ...background,
      texture: background.texture ?? null,
      vignette: background.vignette ?? null,
    },
    card: {
      frame: { id: card.frame.id, theme: card.frame.theme },
      radius: card.radius,
      smoothing: card.smoothing,
      border: card.border,
      inset: card.inset,
      shadow: card.shadow,
      tilt: card.tilt,
      transform: card.transform,
      stack: card.stack ?? null,
      reflection: card.reflection ?? null,
    },
  };
}

/** Set a value at a key path, returning a new scene with structural sharing. */
export function setIn<T>(root: T, path: readonly (string | number)[], value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  if (Array.isArray(root)) {
    const copy = root.slice();
    copy[head as number] = setIn(copy[head as number], rest, value);
    return copy as T;
  }
  const obj = (isPlain(root) ? root : {}) as Plain;
  const current = obj[head as string];
  const nextChild = setIn(current, rest, value);
  if (nextChild === current) return root;
  return { ...obj, [head as string]: nextChild } as T;
}

export function getIn(root: unknown, path: readonly (string | number)[]): unknown {
  let cur: unknown = root;
  for (const k of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

export function updateAnnotation(scene: Scene, id: string, patch: Partial<Annotation>): Scene {
  return {
    ...scene,
    annotations: scene.annotations.map((a) =>
      a.id === id ? ({ ...a, ...patch, kind: a.kind, id: a.id } as Annotation) : a,
    ),
  };
}

export function addAnnotation(scene: Scene, annotation: Annotation): Scene {
  return { ...scene, annotations: [...scene.annotations, annotation] };
}

export function removeAnnotation(scene: Scene, id: string): Scene {
  return { ...scene, annotations: scene.annotations.filter((a) => a.id !== id) };
}

/**
 * Asset ids referenced by a scene (content, every extra screen, background
 * image). Extra screens count even while the layout is "single": they are
 * kept for when the user switches back, so storage clean-up, project files
 * and exports must all carry them. Built-in wallpapers (`builtin:*`) are
 * included unless `includeBuiltin` is false.
 */
export function sceneAssetIds(scene: Scene, opts: { includeBuiltin?: boolean } = {}): string[] {
  const ids = new Set<string>();
  if (scene.content.kind === "image" && scene.content.assetId) ids.add(scene.content.assetId);
  if (scene.content.kind === "post" && scene.content.avatarAssetId)
    ids.add(scene.content.avatarAssetId);
  for (const s of scene.slots ?? []) if (s.assetId) ids.add(s.assetId);
  if (scene.background.fill.kind === "image") ids.add(scene.background.fill.assetId);
  const all = [...ids];
  return opts.includeBuiltin === false ? all.filter((id) => !id.startsWith("builtin:")) : all;
}
