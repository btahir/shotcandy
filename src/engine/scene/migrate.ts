/**
 * Versioned schema migrations.
 *
 * Every persisted document (scene in IndexedDB, project file, preset) carries a
 * version number. Loading runs each migration step from the stored version up
 * to the current one, then normalizes. Migrations are pure functions over plain
 * JSON, registered in order; each step must bump exactly one version.
 *
 * Adding a schema change:
 *   1. bump SCENE_VERSION in scene/types.ts and update the types;
 *   2. append `{ from: N, to: N + 1, migrate }` to SCENE_MIGRATIONS below;
 *   3. add a fixture of the old shape to tests/unit/migrate.test.ts.
 */
import { normalizeScene, type NormalizeResult } from "./normalize";
import { SCENE_VERSION } from "./types";

export interface MigrationStep {
  from: number;
  to: number;
  /** Receives a deep copy; may mutate and return it. */
  migrate: (doc: Record<string, unknown>) => Record<string, unknown>;
  description?: string;
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

export interface Migrator {
  readonly current: number;
  /** Returns the document migrated to `current`, plus the versions it passed through. */
  migrate(doc: unknown): { doc: Record<string, unknown>; applied: number[] };
}

export function createMigrator(
  current: number,
  steps: readonly MigrationStep[],
  versionKey = "version",
): Migrator {
  const byFrom = new Map<number, MigrationStep>();
  for (const s of steps) {
    if (s.to !== s.from + 1) throw new MigrationError(`step ${s.from}->${s.to} must bump by one`);
    if (byFrom.has(s.from)) throw new MigrationError(`duplicate step from ${s.from}`);
    byFrom.set(s.from, s);
  }
  return {
    current,
    migrate(input) {
      if (typeof input !== "object" || input === null || Array.isArray(input)) {
        throw new MigrationError("document must be an object");
      }
      let doc = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
      const raw = doc[versionKey];
      // Documents without a version predate versioning and are treated as v1.
      const initial = raw === undefined ? 1 : raw;
      if (typeof initial !== "number" || !Number.isInteger(initial) || initial < 1) {
        throw new MigrationError(`invalid ${versionKey}: ${JSON.stringify(raw)}`);
      }
      let version: number = initial;
      if (version > current) {
        throw new MigrationError(
          `document version ${version} is newer than this app supports (${current}); please update Shotcandy`,
        );
      }
      const applied: number[] = [];
      while (version < current) {
        const step = byFrom.get(version);
        if (!step) throw new MigrationError(`no migration from version ${version}`);
        doc = step.migrate(doc);
        version = step.to;
        doc[versionKey] = version;
        applied.push(version);
      }
      doc[versionKey] = version;
      return { doc, applied };
    },
  };
}

/** Scene schema migrations, oldest first. Version 1 is the initial schema. */
export const SCENE_MIGRATIONS: readonly MigrationStep[] = [
  {
    from: 1,
    to: 2,
    // v2 adds optional fields only (scene.animation, new content kinds); a v1
    // scene is a valid v2 scene. Older apps refuse v2 files with a clear message.
    migrate: (doc) => doc,
    description: "animation and new content kinds (additive)",
  },
  {
    from: 2,
    to: 3,
    // v3 adds optional multi-screen fields (scene.layout, scene.slots); a v2
    // scene is a valid v3 scene. Older apps refuse v3 files instead of silently
    // dropping the extra screens.
    migrate: (doc) => doc,
    description: "multi-screen layouts and extra screens (additive)",
  },
];

export const sceneMigrator = createMigrator(SCENE_VERSION, SCENE_MIGRATIONS);

/** Load a scene of any supported version: migrate, then validate/normalize. */
export function loadScene(input: unknown): NormalizeResult & { migratedFrom: number | null } {
  const before =
    typeof input === "object" && input !== null && "version" in input
      ? Number((input as { version: unknown }).version)
      : 1;
  const { doc, applied } = sceneMigrator.migrate(input);
  const result = normalizeScene(doc);
  return { ...result, migratedFrom: applied.length ? before : null };
}
