/** Read-path migrations for stored records. */
import { loadScene } from "../scene/migrate";
import { normalizeScene } from "../scene/normalize";
import { createScene } from "../scene/defaults";
import { extractStylePatch } from "../scene/patch";
import { SCENE_VERSION } from "../scene/types";
import type { DesignRecord, PresetRecord } from "./types";

export function migrateDesign(rec: DesignRecord): DesignRecord {
  try {
    return { ...rec, scene: loadScene(rec.scene).scene };
  } catch {
    // A design written by a newer app version: keep it readable, never crash the list.
    return { ...rec, scene: normalizeScene(rec.scene).scene };
  }
}

/**
 * Style patches are validated by applying them to a blank scene and reading
 * the style back, which drops unknown fields and clamps values.
 */
export function migratePreset(rec: PresetRecord): PresetRecord {
  const base = createScene();
  const merged = {
    ...base,
    version: rec.schemaVersion,
    ...rec.patch,
    card: { ...base.card, ...(rec.patch.card ?? {}) },
  };
  let scene;
  try {
    scene = loadScene(merged).scene;
  } catch {
    scene = normalizeScene(merged).scene;
  }
  const patch = rec.patch;
  const clean = extractStylePatch(scene);
  return {
    ...rec,
    schemaVersion: SCENE_VERSION,
    patch: {
      ...(patch.canvas ? { canvas: clean.canvas } : {}),
      ...(patch.background ? { background: clean.background } : {}),
      ...(patch.card ? { card: clean.card } : {}),
    },
  };
}
