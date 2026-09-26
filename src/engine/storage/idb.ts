/**
 * IndexedDB implementation of ShotcandyStore (via the tiny `idb` wrapper).
 *
 * Database "shotcandy", version 1:
 *   designs   keyPath "id", index "updatedAt"
 *   presets   keyPath "id", index "updatedAt"
 *   assets    keyPath "id", index "role"  (blobs stored natively)
 *   settings  out-of-line keys
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

interface ShotcandyDB extends DBSchema {
  designs: { key: string; value: DesignRecord; indexes: { updatedAt: number } };
  presets: { key: string; value: PresetRecord; indexes: { updatedAt: number } };
  assets: { key: string; value: AssetRecord; indexes: { role: AssetRole } };
  settings: { key: string; value: unknown };
}

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
    blocked() {
      // Another tab holds an older version open; it will be asked to close.
    },
    blocking() {
      // A newer tab wants to upgrade: nothing to flush, so let it proceed.
    },
  });
}

function repo<S extends "designs" | "presets">(
  db: IDBPDatabase<ShotcandyDB>,
  store: S,
  migrate: (r: ShotcandyDB[S]["value"]) => ShotcandyDB[S]["value"],
): Repository<ShotcandyDB[S]["value"]> {
  return {
    async get(id) {
      const r = await db.get(store, id);
      return r ? migrate(r) : undefined;
    },
    async list() {
      const all = await db.getAllFromIndex(store, "updatedAt");
      return all.reverse().map(migrate);
    },
    async put(record) {
      await db.put(store, record);
    },
    async delete(id) {
      await db.delete(store, id);
    },
    async clear() {
      await db.clear(store);
    },
  };
}

function assetRepo(db: IDBPDatabase<ShotcandyDB>): AssetRepository {
  return {
    get: (id) => db.get("assets", id),
    async list() {
      const all = await db.getAll("assets");
      return all.sort((a, b) => b.createdAt - a.createdAt);
    },
    async listMeta(role) {
      const all = role
        ? await db.getAllFromIndex("assets", "role", role)
        : await db.getAll("assets");
      return all
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((a) => ({
          id: a.id,
          mime: a.mime,
          width: a.width,
          height: a.height,
          role: a.role,
          createdAt: a.createdAt,
        }));
    },
    async put(record) {
      await db.put("assets", record);
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
    designs: repo(db, "designs", migrateDesign),
    presets: repo(db, "presets", migratePreset),
    assets: assetRepo(db),
    settings: settings(db),
    close: () => db.close(),
  };
}
