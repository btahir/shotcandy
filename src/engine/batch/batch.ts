/**
 * Batch documents: many screenshots that share one style, with per-image
 * exceptions.
 *
 * A batch holds the shared style as an ordinary Scene (`shared`, whose own
 * content, annotations and caption are unused) and one item per image: its
 * asset, source file name, per-image content settings (crop, tall, fade,
 * sampling), annotations and redactions (always per image), caption, and
 * sparse style overrides. `itemScene` composes an item into an ordinary
 * Scene, so every item previews, renders and exports through the unchanged
 * pipeline (multi-screen layouts plug in the same way: per-image keys go in
 * ITEM_KEYS).
 *
 * The editor document is either a single Scene or a Batch; a batch always has
 * two or more images. `batchLens` lets the editor store edit the active item's
 * scene and routes each edit: per-image keys to the item, style changes to the
 * shared style ("All") or to overrides ("This image", "Selected").
 *
 * Everything here is pure and deterministic.
 */
import { loadScene } from "../scene/migrate";
import { normalizeScene } from "../scene/normalize";
import type { Annotation, CaptionSpec, ImageContent, Scene } from "../scene/types";
import { baseName } from "./names";
import {
  type OverrideGroup,
  type StyleOverrides,
  applyStyle,
  diffStyle,
  dropGroups,
  overrideGroups,
  pruneOverrides,
  withoutPaths,
} from "./style";

export const BATCH_VERSION = 1;
/** Most images a batch holds (desktop / phones). */
export const BATCH_MAX = 100;
export const BATCH_MAX_PHONE = 30;

export interface BatchItem {
  /** Stable per item (the same file may be in a batch twice). */
  id: string;
  /** Source file name ("login.png"): the sidebar label and the export name. */
  name: string;
  /** The screenshot and its per-image settings. */
  content: ImageContent;
  annotations: Annotation[];
  caption?: CaptionSpec;
  /** Style that differs from the shared style (absent: follows it). */
  overrides?: StyleOverrides;
}

export interface Batch {
  kind: "batch";
  version: typeof BATCH_VERSION;
  /** The shared style. Its content, annotations and caption are unused. */
  shared: Scene;
  items: BatchItem[];
  /** The item on the stage. */
  active: string;
  /** Selected items (always includes `active`), in batch order. */
  selected: string[];
}

export type EditorDoc = Scene | Batch;

/** Where style edits go: the shared style, the active image, or every selected image. */
export type EditScope = "all" | "item" | "selected";

export function isBatch(doc: unknown): doc is Batch {
  return !!doc && typeof doc === "object" && (doc as { kind?: unknown }).kind === "batch";
}

let seq = 0;
let salt = "";
/** Item ids stay unique across sessions when the app seeds them (e.g. with the time). */
export function seedItemIds(s: string): void {
  salt = s.replace(/[^a-z0-9]/gi, "").slice(0, 12);
}
export function newItemId(): string {
  seq = (seq + 1) % 1e9;
  return `b${salt}${seq.toString(36)}`;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/** The shared style of a scene: the scene without its image, marks and caption. */
export function styleScene(scene: Scene): Scene {
  const { caption: _c, ...rest } = scene;
  return { ...rest, content: { kind: "image", assetId: null }, annotations: [] };
}

const cache = new WeakMap<Scene, WeakMap<BatchItem, Scene>>();

/** The ordinary Scene for one item: shared style, overrides, then the item's own parts. */
export function itemScene(b: Batch, item: BatchItem): Scene {
  let byItem = cache.get(b.shared);
  if (!byItem) cache.set(b.shared, (byItem = new WeakMap()));
  const hit = byItem.get(item);
  if (hit) return hit;
  const styled = applyStyle(b.shared, item.overrides);
  const { caption: _c, ...rest } = styled;
  const name = baseName(item.name) || styled.meta.name;
  const scene: Scene = {
    ...rest,
    content: item.content,
    annotations: item.annotations,
    meta: { ...styled.meta, name },
    ...(item.caption ? { caption: item.caption } : {}),
  };
  byItem.set(item, scene);
  return scene;
}

export function activeIndex(b: Batch): number {
  const i = b.items.findIndex((x) => x.id === b.active);
  return i < 0 ? 0 : i;
}

export function activeItem(b: Batch): BatchItem {
  return b.items[activeIndex(b)]!;
}

/** The scene on the stage. */
export function docScene(doc: EditorDoc): Scene {
  return isBatch(doc) ? itemScene(doc, activeItem(doc)) : doc;
}

export function itemGroups(item: BatchItem): OverrideGroup[] {
  return overrideGroups(item.overrides);
}

// ---------------------------------------------------------------------------
// Editing through the lens
// ---------------------------------------------------------------------------

function withItems(b: Batch, items: BatchItem[]): Batch {
  return { ...b, items };
}

/**
 * Fold an edit of the active item's scene (`prev` -> `next`) into the batch.
 * Per-image keys always go to the active item. Style changes go to the shared
 * style ("all": other images keep their overrides, the image on stage follows
 * the edit), to the active item ("item") or to every selected item ("selected").
 */
export function routeEdit(b: Batch, next: Scene, prev: Scene, scope: EditScope): Batch {
  const idx = activeIndex(b);
  const cur = b.items[idx]!;
  let item = cur;
  if (next.content !== prev.content && next.content.kind === "image")
    item = { ...item, content: next.content };
  if (next.annotations !== prev.annotations) item = { ...item, annotations: next.annotations };
  if (next.caption !== prev.caption) {
    const { caption: _c, ...rest } = item;
    item = next.caption ? { ...rest, caption: next.caption } : rest;
  }
  const changed = diffStyle(prev, next);
  if (!changed) {
    if (item === cur) return b;
    const items = b.items.slice();
    items[idx] = item;
    return withItems(b, items);
  }
  if (scope === "all") {
    const shared = applyStyle(b.shared, changed);
    const items = b.items.map((x, i) => {
      const base = i === idx ? item : x;
      const ov = i === idx ? withoutPaths(base.overrides, changed) : base.overrides;
      return setOverrides(base, pruneOverrides(shared, ov));
    });
    return { ...b, shared, items };
  }
  const targets = new Set(scope === "selected" ? b.selected : [b.active]);
  targets.add(b.active);
  const items = b.items.map((x, i) => {
    if (i === idx) return setOverrides(item, diffStyle(b.shared, next));
    if (!targets.has(x.id)) return x;
    const eff = applyStyle(applyStyle(b.shared, x.overrides), changed);
    return setOverrides(x, diffStyle(b.shared, eff));
  });
  return withItems(b, items);
}

function setOverrides(item: BatchItem, ov: StyleOverrides | undefined): BatchItem {
  if (!ov && !item.overrides) return item;
  if (ov && item.overrides && JSON.stringify(ov) === JSON.stringify(item.overrides)) return item;
  const { overrides: _o, ...rest } = item;
  return ov ? { ...rest, overrides: ov } : rest;
}

/** A lens for the editor store: documents are scenes or batches. */
export function batchLens(scope: () => EditScope) {
  return {
    scene: docScene,
    update(doc: EditorDoc, next: Scene, prev: Scene): EditorDoc {
      return isBatch(doc) ? routeEdit(doc, next, prev, scope()) : next;
    },
  };
}

// ---------------------------------------------------------------------------
// Operations (each returns a new document; the editor makes each one undo step)
// ---------------------------------------------------------------------------

export interface NewItem {
  name: string;
  content: ImageContent;
  annotations?: Annotation[];
  caption?: CaptionSpec;
  id?: string;
}

function makeItem(n: NewItem): BatchItem {
  return {
    id: n.id ?? newItemId(),
    name: n.name,
    content: n.content,
    annotations: n.annotations ?? [],
    ...(n.caption ? { caption: n.caption } : {}),
  };
}

/** Whether a scene has a screenshot (a design, not the empty editor). */
export function hasImage(scene: Scene): boolean {
  return scene.content.kind === "image" && !!scene.content.assetId;
}

/** Turn a single design into a batch: it becomes the first item, its look the shared style. */
export function batchFromScene(scene: Scene, current: { name: string; id?: string }): Batch {
  const first = makeItem({
    name: current.name,
    content: scene.content as ImageContent,
    annotations: scene.annotations,
    ...(scene.caption ? { caption: scene.caption } : {}),
    ...(current.id ? { id: current.id } : {}),
  });
  return {
    kind: "batch",
    version: BATCH_VERSION,
    shared: styleScene(scene),
    items: [first],
    active: first.id,
    selected: [first.id],
  };
}

export interface AddOptions {
  /** Name of the open single design, when it joins a new batch. */
  currentName?: string;
  /** Styles the very first image of an empty editor (the default style pick). */
  prepareFirst?: (scene: Scene) => Scene;
  /** Put the first new image on the stage (adding to an existing batch). */
  activate?: boolean;
}

/**
 * Add images. An empty editor takes the first as its design; a single design
 * keeps its image and becomes a batch; a batch appends.
 */
export function addItems(
  doc: EditorDoc,
  add: readonly NewItem[],
  opts: AddOptions = {},
): EditorDoc {
  if (!add.length) return doc;
  let rest = add;
  let d: EditorDoc = doc;
  if (!isBatch(d) && !hasImage(d)) {
    const n = rest[0]!;
    let s: Scene = {
      ...d,
      content: n.content,
      annotations: n.annotations ?? d.annotations,
      ...(n.caption ? { caption: n.caption } : {}),
    };
    if (opts.prepareFirst) s = opts.prepareFirst(s);
    if (rest.length === 1) return s;
    d = batchFromScene(s, { name: n.name, ...(n.id ? { id: n.id } : {}) });
    rest = rest.slice(1);
    opts = { ...opts, activate: false };
  }
  const b: Batch = isBatch(d) ? d : batchFromScene(d, { name: opts.currentName ?? "shotcandy" });
  const items = rest.map(makeItem);
  const next: Batch = { ...b, items: [...b.items, ...items] };
  if (opts.activate && isBatch(doc)) {
    next.active = items[0]!.id;
    next.selected = [items[0]!.id];
  }
  return next;
}

/** The single design a one-image batch collapses to. */
export function toSingle(b: Batch, item: BatchItem = activeItem(b)): Scene {
  return itemScene(b, item);
}

/**
 * Remove items. One image left: the batch becomes that single design again.
 * None left: the empty editor, keeping the shared style.
 */
export function removeItems(b: Batch, ids: readonly string[]): EditorDoc {
  const drop = new Set(ids);
  const items = b.items.filter((x) => !drop.has(x.id));
  if (items.length === b.items.length) return b;
  if (items.length === 0) return b.shared;
  if (items.length === 1) return toSingle(b, items[0]!);
  let active = b.active;
  if (drop.has(active)) {
    const i = activeIndex(b);
    const after = b.items.slice(i + 1).find((x) => !drop.has(x.id));
    const before = b.items
      .slice(0, i)
      .reverse()
      .find((x) => !drop.has(x.id));
    active = (after ?? before ?? items[0]!).id;
  }
  const selected = b.selected.filter((id) => !drop.has(id));
  return {
    ...b,
    items,
    active,
    selected: selected.includes(active) ? orderSel(items, selected) : [active],
  };
}

function orderSel(items: readonly BatchItem[], ids: readonly string[]): string[] {
  const set = new Set(ids);
  return items.filter((x) => set.has(x.id)).map((x) => x.id);
}

/**
 * Move items to an insertion point (0..items.length, in the current order,
 * as a drop indicator shows it). They keep their relative order.
 */
export function moveItems(b: Batch, ids: readonly string[], to: number): Batch {
  const move = new Set(ids);
  const moving = b.items.filter((x) => move.has(x.id));
  if (!moving.length) return b;
  const before = b.items.slice(0, Math.max(0, Math.min(b.items.length, to)));
  const shift = before.filter((x) => move.has(x.id)).length;
  const rest = b.items.filter((x) => !move.has(x.id));
  const at = Math.max(0, Math.min(rest.length, to - shift));
  const items = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
  if (items.every((x, i) => x === b.items[i])) return b;
  return { ...b, items, selected: orderSel(items, b.selected) };
}

/** Move the selected items one place up (-1) or down (+1) as a block. */
export function nudgeItems(b: Batch, ids: readonly string[], dir: -1 | 1): Batch {
  const set = new Set(ids);
  const idx = b.items.map((x, i) => (set.has(x.id) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return b;
  if (dir < 0 && idx[0] === 0) return b;
  if (dir > 0 && idx[idx.length - 1] === b.items.length - 1) return b;
  // Contiguous or not, each selected item swaps with its unselected neighbour.
  const items = b.items.slice();
  const order = dir < 0 ? idx : idx.slice().reverse();
  for (const i of order) {
    const j = i + dir;
    if (set.has(items[j]!.id)) continue;
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return { ...b, items, selected: orderSel(items, b.selected) };
}

/** Copies of the items, each right after its original; the copies become the selection. */
export function duplicateItems(b: Batch, ids: readonly string[]): Batch {
  const set = new Set(ids);
  const copies: string[] = [];
  const items: BatchItem[] = [];
  for (const x of b.items) {
    items.push(x);
    if (set.has(x.id)) {
      const id = newItemId();
      copies.push(id);
      items.push({ ...x, id });
    }
  }
  if (!copies.length) return b;
  return { ...b, items, active: copies[0]!, selected: copies };
}

/** Select: only this item, toggle it (Cmd/Ctrl), or a range from `anchor` (Shift). */
export function selectItems(
  b: Batch,
  id: string,
  mode: "only" | "toggle" | "range" | "add" = "only",
  anchor?: string,
): Batch {
  if (!b.items.some((x) => x.id === id)) return b;
  let active = id;
  let selected: string[];
  if (mode === "toggle") {
    if (b.selected.includes(id)) {
      selected = b.selected.filter((x) => x !== id);
      if (!selected.length) return b;
      active = id === b.active ? selected[selected.length - 1]! : b.active;
    } else selected = orderSel(b.items, [...b.selected, id]);
  } else if (mode === "range") {
    const from = b.items.findIndex((x) => x.id === (anchor ?? b.active));
    const to = b.items.findIndex((x) => x.id === id);
    const [lo, hi] = from < to ? [from, to] : [to, from];
    selected = b.items.slice(Math.max(0, lo), hi + 1).map((x) => x.id);
  } else if (mode === "add") selected = orderSel(b.items, [...b.selected, id]);
  else selected = [id];
  if (active === b.active && selected.join() === b.selected.join()) return b;
  return { ...b, active, selected };
}

export function selectAll(b: Batch): Batch {
  if (b.selected.length === b.items.length) return b;
  return { ...b, selected: b.items.map((x) => x.id) };
}

/** Clear the overrides (all, or some groups) of the given items. */
export function resetOverrides(
  b: Batch,
  ids: readonly string[],
  groups?: readonly OverrideGroup[],
): Batch {
  const set = new Set(ids);
  let touched = false;
  const items = b.items.map((x) => {
    if (!set.has(x.id) || !x.overrides) return x;
    const next = setOverrides(x, dropGroups(x.overrides, groups));
    if (next !== x) touched = true;
    return next;
  });
  return touched ? withItems(b, items) : b;
}

/**
 * "Use this style for all": the item's look becomes the shared style. Other
 * images keep their own changes unless `replace` (then everyone matches).
 */
export function useStyleForAll(b: Batch, id: string, replace = false): Batch {
  const item = b.items.find((x) => x.id === id);
  if (!item) return b;
  const shared = styleScene(applyStyle(b.shared, item.overrides));
  // Others keep the values they override; everything else follows the new style.
  const items = b.items.map((x) =>
    setOverrides(x, x.id === id || replace ? undefined : pruneOverrides(shared, x.overrides)),
  );
  return { ...b, shared, items };
}

/** Images (other than `except`) that have overrides. */
export function customCount(b: Batch, except?: string): number {
  return b.items.filter((x) => x.id !== except && !!x.overrides).length;
}

/** Per-item change of the per-image parts (e.g. an auto caption after a size change). */
export function mapItems(b: Batch, fn: (item: BatchItem, scene: Scene) => BatchItem): Batch {
  let touched = false;
  const items = b.items.map((x) => {
    const y = fn(x, itemScene(b, x));
    if (y !== x) touched = true;
    return y;
  });
  return touched ? withItems(b, items) : b;
}

/** Asset ids the batch uses (images and shared or overridden backgrounds). */
export function batchAssetIds(b: Batch): string[] {
  const ids = new Set<string>();
  for (const x of b.items) {
    const s = itemScene(b, x);
    if (s.content.kind === "image" && s.content.assetId) ids.add(s.content.assetId);
    if (s.background.fill.kind === "image") ids.add(s.background.fill.assetId);
  }
  return [...ids];
}

// ---------------------------------------------------------------------------
// Validation (batches come back from IndexedDB and project files)
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function loadAny(raw: unknown): Scene {
  try {
    return loadScene(raw).scene;
  } catch {
    return normalizeScene(raw).scene;
  }
}

/**
 * Validate a stored batch. Returns a batch, the single design it collapses to
 * (one valid image), or null (nothing usable).
 */
export function normalizeBatch(input: unknown, max = BATCH_MAX): EditorDoc | null {
  if (!isObj(input) || !isObj(input.shared) || !Array.isArray(input.items)) return null;
  const shared = styleScene(loadAny(input.shared));
  const seen = new Set<string>();
  const items: BatchItem[] = [];
  for (const raw of input.items) {
    if (items.length >= max) break;
    if (!isObj(raw)) continue;
    let id = typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : newItemId();
    if (seen.has(id)) id = newItemId();
    seen.add(id);
    // Validate the per-image parts by normalizing them inside a whole scene.
    const probe = normalizeScene({
      ...shared,
      content: raw.content,
      annotations: raw.annotations,
      ...(raw.caption ? { caption: raw.caption } : {}),
    }).scene;
    if (probe.content.kind !== "image" || !probe.content.assetId) continue;
    let overrides: StyleOverrides | undefined;
    if (isObj(raw.overrides)) {
      try {
        const eff = normalizeScene(applyStyle(shared, raw.overrides as StyleOverrides)).scene;
        overrides = diffStyle(shared, eff);
      } catch {
        overrides = undefined;
      }
    }
    items.push({
      id,
      name: typeof raw.name === "string" ? raw.name.slice(0, 255) : "",
      content: probe.content,
      annotations: probe.annotations,
      ...(probe.caption ? { caption: probe.caption } : {}),
      ...(overrides ? { overrides } : {}),
    });
  }
  if (!items.length) return null;
  const b: Batch = {
    kind: "batch",
    version: BATCH_VERSION,
    shared,
    items,
    active: items[0]!.id,
    selected: [items[0]!.id],
  };
  if (items.length === 1) return toSingle(b);
  const active =
    typeof input.active === "string" && items.some((x) => x.id === input.active)
      ? input.active
      : items[0]!.id;
  const sel = Array.isArray(input.selected)
    ? orderSel(
        items,
        input.selected.filter((x): x is string => typeof x === "string"),
      )
    : [];
  return { ...b, active, selected: sel.includes(active) ? sel : [active] };
}
