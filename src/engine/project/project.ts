/**
 * Project files (`.shotcandy`): a single JSON document holding the scene and
 * every referenced asset as base64, for backup and sharing.
 *
 * {
 *   "format": "shotcandy.project",
 *   "formatVersion": 1,
 *   "app": { "name": "Shotcandy", "version": "0.1.0" },
 *   "createdAt": "2026-09-26T12:00:00.000Z",
 *   "scene": { "version": 1, ... },
 *   "assets": { "img_…": { "mime": "image/png", "width": 1440, "height": 900, "bytes": 123456, "data": "iVBOR…" } }
 * }
 *
 * The wrapper and the scene are versioned independently and both pass through
 * migrations on load. Asset ids are content hashes and are verified on import.
 *
 * Format 2 adds an optional `batch` (many images sharing one style, see
 * batch/batch.ts); `scene` is then the image that was on stage. Files without
 * a batch are still written as format 1, so older versions keep opening them.
 */
import { type Batch, batchAssetIds, isBatch, normalizeBatch } from "../batch/batch";
import { MIME_FOR_VIDEO, sniffVideoKind, validateImageBytes } from "../input/input";
import { assetIdForBytes } from "../input/import";
import { createMigrator, loadScene, type MigrationStep } from "../scene/migrate";
import { sceneAssetIds } from "../scene/patch";
import { videoIdForBytes } from "../video/id";
import type { Scene } from "../scene/types";

export const PROJECT_FORMAT = "shotcandy.project";
export const PROJECT_FORMAT_VERSION = 2;
export const PROJECT_EXTENSION = "shotcandy";
export const PROJECT_MIME = "application/vnd.shotcandy.project+json";

export interface ProjectAsset {
  mime: string;
  width: number;
  height: number;
  bytes: number;
  data: string;
}

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  formatVersion: number;
  app: { name: string; version: string };
  createdAt: string;
  scene: Scene;
  /** Format 2: a batch of images sharing one style. */
  batch?: Batch;
  assets: Record<string, ProjectAsset>;
}

export interface ProjectAssetInput {
  id: string;
  blob: Blob;
  width: number;
  height: number;
}

export interface LoadedProject {
  scene: Scene;
  /** The batch, when the file holds one (validated). */
  batch?: Batch;
  assets: { id: string; blob: Blob; mime: string; width: number; height: number }[];
  issues: string[];
}

export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectError";
  }
}

/** Wrapper migrations (format-level changes, independent of the scene schema). */
export const PROJECT_MIGRATIONS: readonly MigrationStep[] = [
  {
    from: 1,
    to: 2,
    // v2 adds the optional `batch`; a v1 file is a valid v2 file.
    migrate: (doc) => doc,
    description: "batches (additive)",
  },
];
const projectMigrator = createMigrator(PROJECT_FORMAT_VERSION, PROJECT_MIGRATIONS, "formatVersion");

// ----------------------------------------------------------------------------
// base64 (chunked so large images do not blow the call stack)
// ----------------------------------------------------------------------------

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ----------------------------------------------------------------------------

export async function createProjectFile(
  scene: Scene,
  assets: ProjectAssetInput[],
  meta: { appVersion: string; now: Date; batch?: Batch },
): Promise<ProjectFile> {
  // Built-in wallpapers ship with the app and are never embedded.
  const needed = new Set(sceneAssetIds(scene, { includeBuiltin: false }));
  const batch = meta.batch && isBatch(meta.batch) ? meta.batch : undefined;
  if (batch) for (const id of batchAssetIds(batch)) if (!id.startsWith("builtin:")) needed.add(id);
  const out: Record<string, ProjectAsset> = {};
  for (const a of assets) {
    if (!needed.has(a.id)) continue;
    const bytes = new Uint8Array(await a.blob.arrayBuffer());
    out[a.id] = {
      mime: a.blob.type || "image/png",
      width: a.width,
      height: a.height,
      bytes: bytes.length,
      data: bytesToBase64(bytes),
    };
  }
  const missing = [...needed].filter((id) => !out[id]);
  if (missing.length) throw new ProjectError(`Missing asset data for ${missing.join(", ")}`);
  return {
    format: PROJECT_FORMAT,
    formatVersion: batch ? PROJECT_FORMAT_VERSION : 1,
    app: { name: "Shotcandy", version: meta.appVersion },
    createdAt: meta.now.toISOString(),
    scene,
    ...(batch ? { batch } : {}),
    assets: out,
  };
}

export function serializeProject(file: ProjectFile): string {
  return JSON.stringify(file);
}

export async function projectToBlob(file: ProjectFile): Promise<Blob> {
  return new Blob([serializeProject(file)], { type: PROJECT_MIME });
}

/** Parse, migrate and verify a project file. Asset ids are re-derived from bytes. */
export async function parseProject(input: string | Blob): Promise<LoadedProject> {
  const text = typeof input === "string" ? input : await input.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectError("This is not a Shotcandy project file (invalid JSON).");
  }
  if (
    typeof raw !== "object" ||
    raw === null ||
    (raw as { format?: unknown }).format !== PROJECT_FORMAT
  ) {
    throw new ProjectError("This is not a Shotcandy project file.");
  }
  const { doc } = projectMigrator.migrate(raw);
  const issues: string[] = [];
  const rawAssets = (doc.assets ?? {}) as Record<string, Partial<ProjectAsset>>;
  const remap = new Map<string, string>();
  const assets: LoadedProject["assets"] = [];
  for (const [id, a] of Object.entries(rawAssets)) {
    if (typeof a?.data !== "string") {
      issues.push(`asset ${id}: missing data`);
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(a.data);
    } catch {
      issues.push(`asset ${id}: invalid base64`);
      continue;
    }
    const video = sniffVideoKind(bytes);
    const mime = video ? MIME_FOR_VIDEO[video] : validateImageBytes(bytes);
    const realId = video ? videoIdForBytes(bytes) : assetIdForBytes(bytes);
    if (realId !== id) {
      issues.push(`asset ${id}: content hash mismatch, re-identified as ${realId}`);
      remap.set(id, realId);
    }
    assets.push({
      id: realId,
      blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }),
      mime,
      width: Number(a.width) || 0,
      height: Number(a.height) || 0,
    });
  }
  const fix = (raw: unknown) => {
    if (!remap.size || raw === undefined) return raw;
    let json = JSON.stringify(raw);
    for (const [from, to] of remap)
      json = json.split(JSON.stringify(from)).join(JSON.stringify(to));
    return JSON.parse(json);
  };
  const loaded = loadScene(fix(doc.scene));
  issues.push(...loaded.issues);
  const have = new Set(assets.map((a) => a.id));
  for (const id of sceneAssetIds(loaded.scene, { includeBuiltin: false }))
    if (!have.has(id)) issues.push(`scene references missing asset ${id}`);
  let batch: Batch | undefined;
  if (doc.batch !== undefined) {
    const b = normalizeBatch(fix(doc.batch));
    if (isBatch(b)) {
      const lost = b.items.filter((x) => !have.has(x.content.assetId!));
      for (const x of lost) issues.push(`batch image ${x.name || x.id} is missing`);
      const kept = normalizeBatch({ ...b, items: b.items.filter((x) => !lost.includes(x)) });
      if (isBatch(kept)) batch = kept;
    } else issues.push("the batch in this file couldn't be read");
  }
  return { scene: loaded.scene, ...(batch ? { batch } : {}), assets, issues };
}
