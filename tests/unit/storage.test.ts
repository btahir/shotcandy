import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  SCENE_VERSION,
  collectKeepIds,
  createSet,
  createIndexedDBStore,
  createMemoryStore,
  createScene,
  openStore,
  type ShotcandyStore,
} from "@/engine";

let dbCounter = 0;
const factories: [string, () => Promise<ShotcandyStore>][] = [
  ["IndexedDB", () => createIndexedDBStore(`test-${++dbCounter}`)],
  ["memory", async () => createMemoryStore()],
];

describe.each(factories)("%s store", (_name, make) => {
  it("saves, lists (newest first), reads and deletes designs", async () => {
    const store = await make();
    const s1 = createScene({ meta: { name: "one" } });
    const s2 = createScene({ meta: { name: "two" } });
    await store.designs.put({ id: "d1", name: "one", scene: s1, createdAt: 1, updatedAt: 1 });
    await store.designs.put({ id: "d2", name: "two", scene: s2, createdAt: 2, updatedAt: 5 });
    expect((await store.designs.list()).map((d) => d.id)).toEqual(["d2", "d1"]);
    expect((await store.designs.get("d1"))!.scene).toEqual(s1);
    await store.designs.put({
      id: "t",
      name: "t",
      scene: s1,
      createdAt: 3,
      updatedAt: 0,
      thumbnail: new Blob([new Uint8Array([9, 8])], { type: "image/webp" }),
    });
    const thumb = (await store.designs.get("t"))!.thumbnail!;
    expect(thumb.type).toBe("image/webp");
    expect(new Uint8Array(await thumb.arrayBuffer())).toEqual(new Uint8Array([9, 8]));
    await store.designs.delete("t");
    await store.designs.delete("d1");
    expect(await store.designs.get("d1")).toBeUndefined();
    await store.designs.clear();
    expect(await store.designs.list()).toEqual([]);
    store.close();
  });

  it("migrates and repairs scenes on read", async () => {
    const store = await make();
    const corrupt = { ...createScene(), card: { radius: "big" } } as unknown as ReturnType<
      typeof createScene
    >;
    await store.designs.put({ id: "x", name: "x", scene: corrupt, createdAt: 1, updatedAt: 1 });
    const back = await store.designs.get("x");
    expect(back!.scene.card.radius).toBe(createScene().card.radius);
    // A design from a newer app version stays readable.
    const future = { ...createScene(), version: 42 } as unknown as ReturnType<typeof createScene>;
    await store.designs.put({ id: "f", name: "f", scene: future, createdAt: 1, updatedAt: 1 });
    expect((await store.designs.get("f"))!.scene.version).toBe(SCENE_VERSION);
  });

  it("stores user presets and normalizes them on read", async () => {
    const store = await make();
    await store.presets.put({
      id: "p",
      name: "Mine",
      schemaVersion: 1,
      patch: {
        card: { radius: 9999, frame: { id: "macos" } },
        background: { fill: { kind: "solid", color: "#ABC" } },
      },
      createdAt: 1,
      updatedAt: 1,
    });
    const p = (await store.presets.get("p"))!;
    expect(p.patch.card!.radius).toBe(500);
    expect(p.patch.card!.frame).toEqual({ id: "macos", theme: "auto" });
    expect(p.patch.background!.fill).toEqual({ kind: "solid", color: "#aabbcc" });
    expect(p.patch.canvas).toBeUndefined();
  });

  it("stores blobs, lists metadata and garbage-collects assets", async () => {
    const store = await make();
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    await store.assets.put({
      id: "a",
      blob,
      mime: "image/png",
      width: 1,
      height: 1,
      role: "content",
      createdAt: 1,
    });
    await store.assets.put({
      id: "b",
      blob,
      mime: "image/png",
      width: 1,
      height: 1,
      role: "background",
      createdAt: 2,
    });
    expect((await store.assets.listMeta()).map((a) => a.id)).toEqual(["b", "a"]);
    expect((await store.assets.listMeta("content")).map((a) => a.id)).toEqual(["a"]);
    expect((await store.assets.listMeta())[0]).not.toHaveProperty("blob");
    const got = await store.assets.get("a");
    expect(got!.blob.type).toBe("image/png");
    expect(new Uint8Array(await got!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(await store.assets.gc(new Set(["a"]))).toEqual(["b"]);
    expect((await store.assets.list()).map((a) => a.id)).toEqual(["a"]);
  });

  it("keeps settings", async () => {
    const store = await make();
    await store.settings.set("filenamePattern", "{name}");
    expect(await store.settings.get("filenamePattern")).toBe("{name}");
    await store.settings.delete("filenamePattern");
    expect(await store.settings.get("filenamePattern")).toBeUndefined();
  });
});

describe("openStore", () => {
  it("persists across reopen with IndexedDB", async () => {
    const a = await openStore("persist-test");
    expect(a.persistent).toBe(true);
    await a.designs.put({ id: "k", name: "k", scene: createScene(), createdAt: 1, updatedAt: 1 });
    a.close();
    const b = await openStore("persist-test");
    expect((await b.designs.get("k"))!.name).toBe("k");
    b.close();
  });
});

describe("collectKeepIds", () => {
  const imageScene = (assetId: string, bg?: string) => {
    const s = createScene();
    return {
      ...s,
      content: { kind: "image" as const, assetId },
      ...(bg
        ? {
            background: {
              ...s.background,
              fill: {
                kind: "image" as const,
                assetId: bg,
                fit: "cover" as const,
                blur: 0,
                tint: 0,
              },
            },
          }
        : {}),
    };
  };

  it("keeps recents, App Store slides and template, and preset backgrounds", () => {
    const set = createSet();
    set.slides[0]!.assetId = "slide-a";
    set.slides[2]!.assetId = "slide-b";
    const keep = collectKeepIds({
      scenes: [imageScene("recent", "recent-bg")],
      appstore: { set, template: imageScene("tpl", "tpl-bg") },
      patches: [
        {
          background: {
            fill: { kind: "image", assetId: "preset-bg", fit: "cover", blur: 0, tint: 0 },
          },
        },
        { canvas: { padding: 10 } },
      ],
      ids: ["open"],
    });
    expect([...keep].sort()).toEqual(
      ["open", "preset-bg", "recent", "recent-bg", "slide-a", "slide-b", "tpl", "tpl-bg"].sort(),
    );
  });

  it("ignores a missing or malformed App Store record", () => {
    expect([...collectKeepIds({ appstore: undefined })]).toEqual([]);
    expect([...collectKeepIds({ appstore: "nope" })]).toEqual([]);
    expect([...collectKeepIds({ appstore: { set: { slides: "x" } } })]).toEqual([]);
  });

  it("gc with the keep set no longer drops App Store slide images", async () => {
    const store = createMemoryStore();
    const put = (id: string) =>
      store.assets.put({
        id,
        blob: new Blob([id]),
        mime: "image/png",
        width: 1,
        height: 1,
        role: "content",
        createdAt: 1,
      });
    await Promise.all(["recent", "slide-a", "orphan"].map(put));
    const set = createSet();
    set.slides[0]!.assetId = "slide-a";
    const deleted = await store.assets.gc(
      collectKeepIds({ scenes: [imageScene("recent")], appstore: { set } }),
    );
    expect(deleted).toEqual(["orphan"]);
  });
});
