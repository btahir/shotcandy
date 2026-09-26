/** In-memory ShotcandyStore for tests and browsers without IndexedDB. */
import { migrateDesign, migratePreset } from "./migrate-records";
import type {
  AssetRecord,
  AssetRepository,
  DesignRecord,
  PresetRecord,
  Repository,
  ShotcandyStore,
} from "./types";
import { createIndexedDBStore } from "./idb";

const clone = <T>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : v);

function memRepo<T extends { id: string; updatedAt: number }>(migrate: (r: T) => T): Repository<T> {
  const map = new Map<string, T>();
  return {
    get: async (id) => {
      const r = map.get(id);
      return r ? migrate(clone(r)) : undefined;
    },
    list: async () =>
      [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt).map((r) => migrate(clone(r))),
    put: async (r) => {
      map.set(r.id, clone(r));
    },
    delete: async (id) => {
      map.delete(id);
    },
    clear: async () => map.clear(),
  };
}

function memAssets(): AssetRepository {
  const map = new Map<string, AssetRecord>();
  return {
    get: async (id) => map.get(id),
    list: async () => [...map.values()].sort((a, b) => b.createdAt - a.createdAt),
    listMeta: async (role) =>
      [...map.values()]
        .filter((a) => !role || a.role === role)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(({ blob: _blob, ...meta }) => meta),
    put: async (r) => {
      map.set(r.id, r);
    },
    delete: async (id) => {
      map.delete(id);
    },
    clear: async () => map.clear(),
    gc: async (keep) => {
      const deleted = [...map.keys()].filter((k) => !keep.has(k));
      for (const k of deleted) map.delete(k);
      return deleted;
    },
  };
}

export function createMemoryStore(): ShotcandyStore {
  const settings = new Map<string, unknown>();
  return {
    persistent: false,
    designs: memRepo<DesignRecord>(migrateDesign),
    presets: memRepo<PresetRecord>(migratePreset),
    assets: memAssets(),
    settings: {
      get: async <T>(k: string) => settings.get(k) as T | undefined,
      set: async (k, v) => {
        settings.set(k, clone(v));
      },
      delete: async (k) => {
        settings.delete(k);
      },
    },
    close: () => {},
  };
}

/** IndexedDB when available and working, otherwise an in-memory store. */
export async function openStore(name?: string): Promise<ShotcandyStore> {
  if (typeof indexedDB === "undefined") return createMemoryStore();
  try {
    return await createIndexedDBStore(name);
  } catch {
    return createMemoryStore();
  }
}
