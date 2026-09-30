import { describe, expect, it } from "vitest";
import {
  PROJECT_FORMAT,
  collectKeepIds,
  createMemoryStore,
  createProjectFile,
  createScene,
  parseProject,
  serializeProject,
  setIn,
} from "@/engine";
import {
  type Batch,
  addItems,
  docScene,
  isBatch,
  itemScene,
  normalizeBatch,
  routeEdit,
} from "@/engine/batch/batch";
import { SKIP_OTHER, SKIP_VIDEO, planImport, summarizeSkipped } from "@/engine/batch/plan";
import { assetIdForBytes } from "@/engine/input/import";
import {
  type DirEntryLike,
  type EntryLike,
  type FileEntryLike,
  fileKind,
  filesFromDirectoryInput,
  readEntries,
} from "@/engine/input/files";

const file = (name: string, type = "image/png") => ({ file: { name, type }, path: name });

describe("import rules", () => {
  const empty = { batch: 0, single: false, max: 100 };
  const single = { batch: 0, single: true, max: 100 };

  it("one file opens as always (replaces); several, a folder or Add images make a batch", () => {
    expect(planImport([file("a.png")], empty).route).toBe("single");
    expect(planImport([file("a.png")], single).route).toBe("single");
    expect(planImport([file("a.png")], single, { add: true }).route).toBe("batch");
    expect(planImport([file("a.png")], single, { folder: true }).route).toBe("batch");
    expect(planImport([file("a.png"), file("b.png")], empty).route).toBe("batch");
    // Anything into a batch adds.
    expect(planImport([file("a.png")], { batch: 3, single: false, max: 100 }).route).toBe("batch");
  });

  it("sorts in natural order and skips what isn't an image, saying why", () => {
    const p = planImport(
      [
        file("shot-10.png"),
        file("notes.txt", "text/plain"),
        file("shot-2.png"),
        file("clip.mov", "video/quicktime"),
        file("Shot-1.PNG"),
      ],
      empty,
    );
    expect(p.accept.map((f) => f.file.name)).toEqual(["Shot-1.PNG", "shot-2.png", "shot-10.png"]);
    expect(p.skipped).toEqual([
      { name: "clip.mov", reason: SKIP_VIDEO },
      { name: "notes.txt", reason: SKIP_OTHER },
    ]);
    expect(summarizeSkipped([...p.skipped, { name: "x", reason: SKIP_OTHER }])).toBe(
      `1 ${SKIP_VIDEO}, 2 ${SKIP_OTHER}`,
    );
  });

  it("caps at the batch's room (the open design counts, a recording doesn't)", () => {
    const many = Array.from({ length: 40 }, (_, i) => file(`s${i}.png`));
    expect(planImport(many, { batch: 0, single: false, max: 30 })).toMatchObject({
      over: 10,
      room: 30,
    });
    expect(planImport(many, { batch: 0, single: true, max: 30 }).accept).toHaveLength(29);
    expect(
      planImport(many, { batch: 0, single: true, recording: true, max: 30 }).accept,
    ).toHaveLength(30);
    expect(planImport(many, { batch: 98, single: false, max: 100 })).toMatchObject({
      over: 38,
      room: 2,
    });
    expect(planImport(many, { batch: 100, single: false, max: 100 }).accept).toEqual([]);
  });

  it("classifies files before reading them", () => {
    expect(fileKind({ type: "image/heic", name: "a.heic" })).toBe("image"); // bytes decide
    expect(fileKind({ type: "", name: "IMG_1" })).toBe("image");
    expect(fileKind({ type: "", name: "a.webp" })).toBe("image");
    expect(fileKind({ type: "video/mp4", name: "a.mp4" })).toBe("video");
    expect(fileKind({ type: "application/pdf", name: "a.pdf" })).toBe("other");
  });
});

describe("folders", () => {
  const f = (name: string): FileEntryLike => ({
    isFile: true,
    isDirectory: false,
    name,
    file: (ok) => ok(new File(["x"], name, { type: "image/png" })),
  });
  /** A directory whose reader hands out entries in pages, like Chromium (100 at a time). */
  const dir = (name: string, children: EntryLike[], page = 100): DirEntryLike => ({
    isFile: false,
    isDirectory: true,
    name,
    createReader() {
      let i = 0;
      return {
        readEntries(ok) {
          const batch = children.slice(i, i + page);
          i += page;
          ok(batch);
        },
      };
    },
  });

  it("reads every entry, past the first page, and walks subfolders", async () => {
    const big = Array.from({ length: 250 }, (_, i) => f(`s${i}.png`));
    const out = await readEntries([
      dir("shots", [
        ...big,
        f(".DS_Store"),
        dir("more", [f("deep.png")]),
        dir("__MACOSX", [f("x.png")]),
      ]),
    ]);
    expect(out).toHaveLength(251);
    expect(out.map((x) => x.path)).toContain("shots/more/deep.png");
    expect(out.some((x) => x.path.includes("__MACOSX") || x.path.endsWith(".DS_Store"))).toBe(
      false,
    );
  });

  it("stops at the depth limit", async () => {
    const deep = dir("a", [dir("b", [dir("c", [f("x.png")])])]);
    expect(await readEntries([deep], { depth: 2 })).toEqual([]);
    expect(await readEntries([deep], { depth: 3 })).toHaveLength(1);
  });

  it("takes paths from a webkitdirectory input and skips hidden files", () => {
    const mk = (path: string) =>
      Object.assign(new File(["x"], path.split("/").pop()!), { webkitRelativePath: path });
    const out = filesFromDirectoryInput([mk("shots/a.png"), mk("shots/.hidden/b.png")]);
    expect(out.map((x) => x.path)).toEqual(["shots/a.png"]);
  });
});

/** A 1x1 PNG, and a second, different one. */
const PNG_A = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);
const PNG_B = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

function twoImageBatch(): { b: Batch; ids: [string, string] } {
  const a = assetIdForBytes(PNG_A);
  const bId = assetIdForBytes(PNG_B);
  const scene = { ...createScene(), content: { kind: "image" as const, assetId: a } };
  let b = addItems(scene, [{ name: "b.png", content: { kind: "image", assetId: bId } }], {
    currentName: "a.png",
  }) as Batch;
  const prev = docScene(b);
  b = routeEdit(b, setIn(prev, ["canvas", "padding"], 12), prev, "item");
  return { b, ids: [a, bId] };
}

describe("project files with a batch", () => {
  const now = new Date("2026-09-29T12:00:00Z");

  it("round-trips the whole batch as format 2", async () => {
    const { b, ids } = twoImageBatch();
    const file = await createProjectFile(
      itemScene(b, b.items[0]!),
      [
        { id: ids[0], blob: new Blob([PNG_A], { type: "image/png" }), width: 1, height: 1 },
        { id: ids[1], blob: new Blob([PNG_B], { type: "image/png" }), width: 1, height: 1 },
      ],
      { appVersion: "t", now, batch: b },
    );
    expect(file.formatVersion).toBe(2);
    expect(Object.keys(file.assets).sort()).toEqual([...ids].sort());
    const back = await parseProject(serializeProject(file));
    expect(back.issues).toEqual([]);
    expect(isBatch(back.batch)).toBe(true);
    expect(back.batch!.items.map((x) => [x.name, x.content.assetId, x.overrides])).toEqual(
      b.items.map((x) => [x.name, x.content.assetId, x.overrides]),
    );
    expect(back.assets.map((a) => a.id).sort()).toEqual([...ids].sort());
  });

  it("still writes single designs as format 1, and reads old files", async () => {
    const scene = createScene();
    const single = await createProjectFile(scene, [], { appVersion: "t", now });
    expect(single.formatVersion).toBe(1);
    expect(single).not.toHaveProperty("batch");
    const old = await parseProject(
      JSON.stringify({ format: PROJECT_FORMAT, formatVersion: 1, scene, assets: {} }),
    );
    expect(old.batch).toBeUndefined();
    expect(old.scene.canvas).toEqual(scene.canvas);
  });

  it("drops batch images whose data is missing and says so", async () => {
    const { b, ids } = twoImageBatch();
    const file = await createProjectFile(
      itemScene(b, b.items[0]!),
      [
        { id: ids[0], blob: new Blob([PNG_A]), width: 1, height: 1 },
        { id: ids[1], blob: new Blob([PNG_B]), width: 1, height: 1 },
      ],
      { appVersion: "t", now, batch: b },
    );
    const json = JSON.parse(serializeProject(file));
    delete json.assets[ids[1]];
    const back = await parseProject(JSON.stringify(json));
    expect(back.batch).toBeUndefined(); // one image left: not a batch any more
    expect(back.issues.join()).toMatch(/b\.png is missing/);
  });
});

describe("batch persistence and clean-up", () => {
  it("survives a save and load through the settings store", async () => {
    const store = createMemoryStore();
    const { b } = twoImageBatch();
    await store.settings.set("batch", { v: 1, batch: b });
    const raw = await store.settings.get<{ batch: unknown }>("batch");
    const back = normalizeBatch(raw!.batch) as Batch;
    expect(back.items.map((x) => x.id)).toEqual(b.items.map((x) => x.id));
    expect(back.items[0]!.overrides).toEqual(b.items[0]!.overrides);
  });

  it("keeps every batch image when recents are trimmed", async () => {
    const { b, ids } = twoImageBatch();
    const store = createMemoryStore();
    for (const id of [...ids, "orphan"])
      await store.assets.put({
        id,
        blob: new Blob([id]),
        mime: "image/png",
        width: 1,
        height: 1,
        role: "content",
        createdAt: 1,
      });
    const keep = collectKeepIds({ batch: JSON.parse(JSON.stringify(b)) });
    expect([...keep].sort()).toEqual([...ids].sort());
    expect(await store.assets.gc(keep)).toEqual(["orphan"]);
    expect([...collectKeepIds({ batch: "nonsense" })]).toEqual([]);
  });
});
