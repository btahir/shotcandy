/**
 * IndexedDB implementation of ShotcandyStore (via the tiny `idb` wrapper).
 *
 * Database "shotcandy", version 1:
 *   designs   keyPath "id", index "updatedAt"
 *   presets   keyPath "id", index "updatedAt"
 *   assets    keyPath "id", index "role"
 *   settings  out-of-line keys
 *
 * Binary data (asset files, design thumbnails) is stored as ArrayBuffer plus a
 * MIME type rather than as Blob: Safari refuses Blobs in IndexedDB in private
 * windows ("Error preparing Blob/File data"), while ArrayBuffers work
 * everywhere. The public interface still speaks Blob.
 *
 * Schema changes add a new `if (oldVersion < N)` block in `upgrade`; record
 * contents are migrated lazily on read (see migrate-records.ts).
 */
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { migrateDesign, migratePreset } from "./migrate-records";
import type {
  AssetRecord,
  AssetRepository,
  AssetRole,
  DesignRecord,
  PresetRecord,
  Repository,
  SettingsStore,
  ShotcandyStore,
} from "./types";

export const DB_NAME = "shotcandy";
export const DB_VERSION = 1;

interface StoredBinary {
  bytes: ArrayBuffer;
  type: string;
}

type StoredDesign = Omit<DesignRecord, "thumbnail"> & { thumbnail?: StoredBinary };
type StoredAsset = Omit<AssetRecord, "blob"> & { data: StoredBinary };

interface ShotcandyDB extends DBSchema {
  designs: { key: string; value: StoredDesign; indexes: { updatedAt: number } };
  presets: { key: string; value: PresetRecord; indexes: { updatedAt: number } };
  assets: { key: string; value: StoredAsset; indexes: { role: AssetRole } };
  settings: { key: string; value: unknown };
}

const toStored = async (b: Blob): Promise<StoredBinary> => ({
  bytes: await b.arrayBuffer(),
  type: b.type,
});
const fromStored = (s: StoredBinary): Blob => new Blob([s.bytes], { type: s.type });

export async function openShotcandyDB(name = DB_NAME): Promise<IDBPDatabase<ShotcandyDB>> {
  return openDB<ShotcandyDB>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore("designs", { keyPath: "id" }).createIndex("updatedAt", "updatedAt");
        db.createObjectStore("presets", { keyPath: "id" }).createIndex("updatedAt", "updatedAt");
        db.createObjectStore("assets", { keyPath: "id" }).createIndex("role", "role");
        db.createObjectStore("settings");
      }
    },
  });
}

function designRepo(db: IDBPDatabase<ShotcandyDB>): Repository<DesignRecord> {
  const decode = (r: StoredDesign): DesignRecord => {
    const { thumbnail, ...rest } = r;
    return migrateDesign({ ...rest, ...(thumbnail ? { thumbnail: fromStored(thumbnail) } : {}) });
  };
  return {
    async get(id) {
      const r = await db.get("designs", id);
      return r ? decode(r) : undefined;
    },
    async list() {
      return (await db.getAllFromIndex("designs", "updatedAt")).reverse().map(decode);
    },
    async put(record) {
      const { thumbnail, ...rest } = record;
      await db.put("designs", {
        ...rest,
        ...(thumbnail ? { thumbnail: await toStored(thumbnail) } : {}),
      });
    },
    async delete(id) {
      await db.delete("designs", id);
    },
    async clear() {
      await db.clear("designs");
    },
  };
}

function presetRepo(db: IDBPDatabase<ShotcandyDB>): Repository<PresetRecord> {
  return {
    async get(id) {
      const r = await db.get("presets", id);
      return r ? migratePreset(r) : undefined;
    },
    async list() {
      return (await db.getAllFromIndex("presets", "updatedAt")).reverse().map(migratePreset);
    },
    async put(record) {
      await db.put("presets", record);
    },
    async delete(id) {
      await db.delete("presets", id);
    },
    async clear() {
      await db.clear("presets");
    },
  };
}

function assetRepo(db: IDBPDatabase<ShotcandyDB>): AssetRepository {
  const decode = ({ data, ...meta }: StoredAsset): AssetRecord => ({
    ...meta,
    blob: fromStored(data),
  });
  const meta = ({ data: _data, ...m }: StoredAsset) => m;
  return {
    async get(id) {
      const r = await db.get("assets", id);
      return r ? decode(r) : undefined;
    },
    async list() {
      return (await db.getAll("assets")).sort((a, b) => b.createdAt - a.createdAt).map(decode);
    },
    async listMeta(role) {
      const all = role
        ? await db.getAllFromIndex("assets", "role", role)
        : await db.getAll("assets");
      return all.sort((a, b) => b.createdAt - a.createdAt).map(meta);
    },
    async put(record) {
      const { blob, ...rest } = record;
      await db.put("assets", { ...rest, data: await toStored(blob) });
    },
    async delete(id) {
      await db.delete("assets", id);
    },
    async clear() {
      await db.clear("assets");
    },
    async gc(keep) {
      const tx = db.transaction("assets", "readwrite");
      const deleted: string[] = [];
      for (const key of await tx.store.getAllKeys()) {
        if (!keep.has(key)) {
          deleted.push(key);
          await tx.store.delete(key);
        }
      }
      await tx.done;
      return deleted;
    },
  };
}

function settings(db: IDBPDatabase<ShotcandyDB>): SettingsStore {
  return {
    get: async <T>(key: string) => (await db.get("settings", key)) as T | undefined,
    set: async (key, value) => {
      await db.put("settings", value, key);
    },
    delete: async (key) => {
      await db.delete("settings", key);
    },
  };
}

export async function createIndexedDBStore(name = DB_NAME): Promise<ShotcandyStore> {
  const db = await openShotcandyDB(name);
  return {
    persistent: true,
    designs: designRepo(db),
    presets: presetRepo(db),
    assets: assetRepo(db),
    settings: settings(db),
    close: () => db.close(),
  };
}
