/**
 * Which stored assets are still in use. Stored images are shared by recent
 * designs, the App Store set and saved styles (an uploaded background), so the
 * clean-up after trimming recents must keep every one of them.
 */
import { normalizeSet } from "../appstore/set";
import { normalizeScene } from "../scene/normalize";
import { sceneAssetIds } from "../scene/patch";
import type { Scene, StylePatch } from "../scene/types";

export interface KeepSources {
  /** Scenes of the recent designs that stay. */
  scenes?: Iterable<Scene>;
  /** Saved style patches (custom presets). */
  patches?: Iterable<StylePatch>;
  /** The saved App Store set record, as stored ({ set, template }). */
  appstore?: unknown;
  /** Any other ids in use (e.g. the open design). */
  ids?: Iterable<string>;
}

export function patchAssetIds(patch: StylePatch): string[] {
  const fill = patch.background?.fill;
  return fill && fill.kind === "image" && fill.assetId ? [fill.assetId] : [];
}

function appstoreAssetIds(record: unknown): string[] {
  if (!record || typeof record !== "object") return [];
  const { set, template } = record as { set?: unknown; template?: unknown };
  const ids: string[] = [];
  if (set) for (const s of normalizeSet(set).slides) if (s.assetId) ids.push(s.assetId);
  if (template) ids.push(...sceneAssetIds(normalizeScene(template).scene));
  return ids;
}

export function collectKeepIds(src: KeepSources): Set<string> {
  const keep = new Set<string>();
  for (const s of src.scenes ?? []) for (const id of sceneAssetIds(s)) keep.add(id);
  for (const p of src.patches ?? []) for (const id of patchAssetIds(p)) keep.add(id);
  for (const id of appstoreAssetIds(src.appstore)) keep.add(id);
  for (const id of src.ids ?? []) keep.add(id);
  return keep;
}
