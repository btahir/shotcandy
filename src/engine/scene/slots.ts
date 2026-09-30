/**
 * Multi-screen editing: pure scene -> scene helpers for picking a layout and
 * filling, swapping and emptying its screens. The editor calls these inside
 * store.update so every change is one undo step.
 *
 * Screens are numbered from 0. Screen 0 is always `scene.content` (so
 * palettes, auto backgrounds and content annotations keep working off it);
 * screen i > 0 is `scene.slots[i - 1]`. Layouts apply to images only: every
 * helper returns code, post and recording scenes unchanged.
 */
import {
  type LayoutDef,
  clampCount,
  clampParam,
  getLayoutDef,
  screenContent,
  slotToContent,
} from "./layouts";
import type {
  Annotation,
  ImageContent,
  LayoutId,
  LayoutParamKey,
  LayoutSpec,
  Scene,
  ScreenSlot,
} from "./types";

const EMPTY: ScreenSlot = { assetId: null };

function editable(scene: Scene): boolean {
  return scene.content.kind === "image" && !scene.content.clip;
}

/** Screens stored in the scene (content + extra slots), shown or not. */
export function screenCount(scene: Scene): number {
  return 1 + (scene.slots?.length ?? 0);
}

/** Screens the current layout shows (1 for "single"). */
export function shownScreens(scene: Scene): number {
  const spec = scene.layout;
  const def = spec ? getLayoutDef(spec.id) : undefined;
  if (!spec || !def || spec.id === "single" || !editable(scene)) return 1;
  return clampCount(def, spec.count);
}

/** Shown screens that have no image yet, in order. */
export function emptySlots(scene: Scene): number[] {
  const out: number[] = [];
  for (let i = 0; i < shownScreens(scene); i++) if (!screenContent(scene, i)?.assetId) out.push(i);
  return out;
}

/** Screen i as a slot record (screen 0 is read from the content). */
function screenAt(scene: Scene, i: number): ScreenSlot {
  if (i === 0) {
    const c = scene.content as ImageContent;
    const out: ScreenSlot = { assetId: c.assetId };
    if (c.crop) out.crop = c.crop;
    if (c.tall !== undefined) out.tall = c.tall;
    if (c.fade !== undefined) out.fade = c.fade;
    if (c.sampling !== undefined) out.sampling = c.sampling;
    const notes = scene.annotations.filter((a) => a.anchor === "content");
    if (notes.length) out.annotations = notes;
    return out;
  }
  return scene.slots?.[i - 1] ?? EMPTY;
}

/** Write screen i. Screen 0 takes the content fields and its content annotations. */
function withScreen(scene: Scene, i: number, slot: ScreenSlot): Scene {
  if (i === 0) {
    const { annotations: notes = [], ...rest } = slot;
    const content: ImageContent = { ...slotToContent(rest) };
    const canvasNotes = scene.annotations.filter((a) => a.anchor !== "content");
    return { ...scene, content, annotations: [...notes, ...canvasNotes] };
  }
  const slots = [...(scene.slots ?? [])];
  while (slots.length < i - 1) slots.push(EMPTY);
  slots[i - 1] = slot;
  return { ...scene, slots };
}

/** Drop trailing empty slots past `keep` screens (they hold nothing). */
function pruneEmpty(scene: Scene, keep: number): Scene {
  const slots = scene.slots;
  if (!slots) return scene;
  let n = slots.length;
  while (n > 0 && n + 1 > keep && !slots[n - 1]!.assetId && !slots[n - 1]!.annotations?.length) n--;
  if (n === slots.length) return scene;
  if (n === 0) {
    const { slots: _gone, ...rest } = scene;
    return rest;
  }
  return { ...scene, slots: slots.slice(0, n) };
}

/** Grow storage with empty slots so `n` screens exist. */
function ensureScreens(scene: Scene, n: number): Scene {
  if (screenCount(scene) >= n) return scene;
  const slots = [...(scene.slots ?? [])];
  while (slots.length + 1 < n) slots.push(EMPTY);
  return { ...scene, slots };
}

function setSpec(scene: Scene, spec: LayoutSpec): Scene {
  return { ...scene, layout: spec };
}

/**
 * Switch the arrangement. Screen 0 stays the content; extra screens are kept
 * (images first, in order, so a layout never hides a filled screen behind an
 * empty one). The count becomes the layout's default, or more when more
 * images are already there, within the layout's range. Empty slots are added
 * up to the count. "single" keeps every screen but shows only screen 0.
 * Knobs start from the new layout's defaults.
 */
export function setLayout(scene: Scene, id: LayoutId): Scene {
  if (!editable(scene)) return scene;
  const def = getLayoutDef(id);
  if (!def) return scene;
  if (id === "single") {
    if (!scene.layout) return scene;
    const { layout: _gone, ...rest } = scene;
    return pruneEmpty(rest, 1);
  }
  if (scene.layout?.id === id) return scene;
  // Filled extra screens first, empty ones after (the content stays screen 0).
  const slots = scene.slots ?? [];
  const filled = slots.filter((s) => s.assetId || s.annotations?.length);
  let next: Scene = { ...scene };
  if (filled.length) next.slots = filled;
  else delete next.slots;
  const images = 1 + filled.length;
  const count = clampCount(def, Math.max(def.defaultCount, images));
  next = ensureScreens(next, count);
  next = pruneEmpty(next, count);
  return setSpec(next, { id: def.id, count });
}

/** Set one knob of the current layout (clamped; unknown knobs are ignored). */
export function setLayoutParam(scene: Scene, key: LayoutParamKey, value: number): Scene {
  const spec = scene.layout;
  const def = spec ? getLayoutDef(spec.id) : undefined;
  const p = def?.params.find((q) => q.key === key);
  if (!spec || !p) return scene;
  const v = clampParam(p, value);
  if (spec.params?.[key] === v) return scene;
  return setSpec(scene, { ...spec, params: { ...spec.params, [key]: v } });
}

/**
 * Show `n` screens (clamped to the layout's range). Growing adds empty slots;
 * shrinking hides screens but keeps their images, so nothing is lost.
 */
export function setScreenCount(scene: Scene, n: number): Scene {
  const spec = scene.layout;
  const def = spec ? getLayoutDef(spec.id) : undefined;
  if (!spec || !def || spec.id === "single" || !editable(scene)) return scene;
  const count = clampCount(def, n);
  const next = pruneEmpty(ensureScreens(scene, count), count);
  return count === spec.count && next === scene ? scene : setSpec(next, { ...spec, count });
}

/** Bump the count so screen `index` is shown, when the layout allows it. */
function reveal(scene: Scene, def: LayoutDef | undefined, index: number): Scene {
  const spec = scene.layout;
  if (!spec || !def || spec.id === "single" || index < spec.count || index >= def.maxCount)
    return scene;
  return setSpec(scene, { ...spec, count: clampCount(def, index + 1) });
}

/**
 * Put an image into screen `index`. A replaced extra screen starts fresh (its
 * crop and annotations belonged to the old image); screen 0 keeps its
 * annotations, like dropping a new screenshot on a single design does.
 */
export function fillSlot(scene: Scene, index: number, assetId: string): Scene {
  if (!editable(scene) || !Number.isInteger(index) || index < 0) return scene;
  const def = scene.layout ? getLayoutDef(scene.layout.id) : undefined;
  const max = Math.max(def?.maxCount ?? 1, screenCount(scene));
  if (index >= max) return scene;
  if (index === 0) {
    const c = scene.content as ImageContent;
    if (c.assetId === assetId && !c.crop) return scene;
    return { ...scene, content: { kind: "image", assetId } };
  }
  return reveal(withScreen(scene, index, { assetId }), def, index);
}

/**
 * Fill the shown empty screens in order with `assetIds`; when images are
 * left over, grow the layout up to its maximum and keep filling. Extra ids
 * beyond that are ignored.
 */
export function fillEmptySlots(scene: Scene, assetIds: readonly string[]): Scene {
  if (!editable(scene) || assetIds.length === 0) return scene;
  const spec = scene.layout;
  const def = spec ? getLayoutDef(spec.id) : undefined;
  let next = scene;
  let k = 0;
  const shown = shownScreens(scene);
  for (let i = 0; i < shown && k < assetIds.length; i++)
    if (!screenContent(next, i)?.assetId) next = fillSlot(next, i, assetIds[k++]!);
  if (spec && def && spec.id !== "single") {
    for (let i = shown; i < def.maxCount && k < assetIds.length; i++) {
      if (screenContent(next, i)?.assetId) continue;
      next = fillSlot(next, i, assetIds[k++]!);
    }
  }
  return next;
}

/**
 * Swap two screens: image, crop and content annotations move together, so a
 * redaction always stays on the image it hides. Canvas annotations stay put.
 */
export function swapSlots(scene: Scene, a: number, b: number): Scene {
  if (!editable(scene) || a === b) return scene;
  const n = screenCount(scene);
  if (![a, b].every((i) => Number.isInteger(i) && i >= 0 && i < n)) return scene;
  const sa = screenAt(scene, a);
  const sb = screenAt(scene, b);
  return withScreen(withScreen(scene, a, sb), b, sa);
}

/**
 * Empty screen `index` (its image and annotations go; the slot stays, so the
 * layout keeps its shape). Screen 0's canvas annotations are untouched.
 */
export function clearSlot(scene: Scene, index: number): Scene {
  if (!editable(scene) || !Number.isInteger(index) || index < 0 || index >= screenCount(scene))
    return scene;
  if (index === 0) {
    const kept: Annotation[] = scene.annotations.filter((a) => a.anchor !== "content");
    return { ...scene, content: { kind: "image", assetId: null }, annotations: kept };
  }
  return withScreen(scene, index, EMPTY);
}

/** Annotation ids anywhere in the scene (screen 0's marks, canvas marks, other screens' marks). */
function noteIds(scene: Scene): Set<string> {
  const ids = new Set(scene.annotations.map((a) => a.id));
  for (const s of scene.slots ?? []) for (const a of s.annotations ?? []) ids.add(a.id);
  return ids;
}

/** Give `notes` ids no other annotation in `scene` uses (ids select annotations). */
function uniqueNotes(scene: Scene, notes: readonly Annotation[], skip: number): Annotation[] {
  const taken = noteIds(withScreen(scene, skip, skip === 0 ? { assetId: null } : EMPTY));
  return notes.map((a) => {
    let id = a.id;
    let n = 2;
    while (taken.has(id)) id = `${a.id}-${n++}`;
    taken.add(id);
    return id === a.id ? a : { ...a, id };
  });
}

/**
 * Put a whole screen (an image with its crop and its content marks) into
 * screen `index`, e.g. another design's screenshot. Its marks come along, so
 * a redaction stays on the image it hides; they replace the old screen's
 * marks. Canvas annotations stay put. Like fillSlot, it shows the screen
 * when the layout has room.
 */
export function placeScreen(scene: Scene, index: number, screen: ScreenSlot): Scene {
  if (!editable(scene) || !Number.isInteger(index) || index < 0 || !screen.assetId) return scene;
  const def = scene.layout ? getLayoutDef(scene.layout.id) : undefined;
  const max = Math.max(def?.maxCount ?? 1, screenCount(scene));
  if (index >= max) return scene;
  const notes = (screen.annotations ?? []).filter((a) => a.anchor === "content");
  const slot: ScreenSlot = { ...screen };
  delete slot.annotations;
  if (notes.length) slot.annotations = uniqueNotes(scene, notes, index);
  return reveal(withScreen(scene, index, slot), def, index);
}

/** Screen `index` as a slot record (screen 0 read from the content), or null past the end. */
export function screenSlot(scene: Scene, index: number): ScreenSlot | null {
  if (!editable(scene) || !Number.isInteger(index) || index < 0 || index >= screenCount(scene))
    return null;
  return screenAt(scene, index);
}
