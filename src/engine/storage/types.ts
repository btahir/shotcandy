/**
 * Persistence interfaces. The app codes against ShotcandyStore; IndexedDB is
 * the production implementation (idb.ts) and an in-memory one (memory.ts)
 * serves tests and browsers where IndexedDB is unavailable.
 *
 * Scenes and style patches are migrated on read, so records written by older
 * versions of the app always come back in the current schema.
 */
import type { Scene, StylePatch } from "../scene/types";

export interface DesignRecord {
  id: string;
  name: string;
  scene: Scene;
  /** Small PNG/WebP preview for the designs list. */
  thumbnail?: Blob;
  createdAt: number;
  updatedAt: number;
}

export interface PresetRecord {
  id: string;
  name: string;
  patch: StylePatch;
  /** Scene schema version the patch was written against. */
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
}

export type AssetRole = "content" | "background";

export interface AssetRecord {
  /** Content hash id (see input/import.ts). */
  id: string;
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  role: AssetRole;
  createdAt: number;
}

export interface Repository<T extends { id: string }> {
  get(id: string): Promise<T | undefined>;
  /** Newest first where records have `updatedAt`/`createdAt`. */
  list(): Promise<T[]>;
  put(record: T): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

export interface AssetRepository extends Repository<AssetRecord> {
  /** Metadata only (no blobs) for fast listing. */
  listMeta(role?: AssetRole): Promise<Omit<AssetRecord, "blob">[]>;
  /** Delete assets not in `keep`; returns deleted ids. */
  gc(keep: ReadonlySet<string>): Promise<string[]>;
}

export interface SettingsStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ShotcandyStore {
  readonly persistent: boolean;
  designs: Repository<DesignRecord>;
  presets: Repository<PresetRecord>;
  assets: AssetRepository;
  settings: SettingsStore;
  close(): void;
}
