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

/** Apply a style preset: only style fields change; content, size and annotations stay. */
export function applyStylePatch(scene: Scene, patch: StylePatch, presetId?: string): Scene {
  const next = deepMerge(scene, patch as unknown as Partial<Scene>);
  return presetId ? { ...next, meta: { ...next.meta, stylePresetId: presetId } } : next;
}

/** Extract the style-only part of a scene (for "save as preset"). */
export function extractStylePatch(scene: Scene): StylePatch {
  const { card, background, canvas } = JSON.parse(JSON.stringify(scene)) as Scene;
  return {
    canvas: { padding: canvas.padding },
    background,
    card: {
      frame: { id: card.frame.id, theme: card.frame.theme },
      radius: card.radius,
      smoothing: card.smoothing,
      border: card.border,
      inset: card.inset,
      shadow: card.shadow,
      tilt: card.tilt,
      transform: card.transform,
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

/** Asset ids referenced by a scene (content + background image). */
export function sceneAssetIds(scene: Scene): string[] {
  const ids = new Set<string>();
  if (scene.content.kind === "image" && scene.content.assetId) ids.add(scene.content.assetId);
  if (scene.background.fill.kind === "image") ids.add(scene.background.fill.assetId);
  return [...ids];
}
