import { describe, expect, it } from "vitest";
import {
  PROJECT_FORMAT,
  ProjectError,
  assetIdForBytes,
  createAnnotation,
  createProjectFile,
  createScene,
  parseProject,
  serializeProject,
} from "@/engine";
import { base64ToBytes, bytesToBase64 } from "@/engine/project/project";

const png = (seed: number) => {
  const b = new Uint8Array(4096);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (let i = 8; i < b.length; i++) b[i] = (i * seed) % 256;
  return b;
};

describe("base64", () => {
  it("round-trips large binary data", () => {
    const b = new Uint8Array(300_000).map((_, i) => (i * 31) % 256);
    expect(base64ToBytes(bytesToBase64(b))).toEqual(b);
  });
});

describe("project files", () => {
  const bytes = png(7);
  const id = assetIdForBytes(bytes);
  const scene = {
    ...createScene({ content: { kind: "image", assetId: id }, meta: { name: "demo" } }),
    annotations: [createAnnotation("arrow", "a1")],
  };
  const now = new Date("2026-09-26T12:00:00Z");

  it("round-trips scene and assets exactly", async () => {
    const file = await createProjectFile(
      scene,
      [{ id, blob: new Blob([bytes], { type: "image/png" }), width: 10, height: 20 }],
      {
        appVersion: "0.1.0",
        now,
      },
    );
    expect(file.format).toBe(PROJECT_FORMAT);
    expect(file.createdAt).toBe("2026-09-26T12:00:00.000Z");
    const loaded = await parseProject(serializeProject(file));
    expect(loaded.issues).toEqual([]);
    expect(loaded.scene).toEqual(scene);
    expect(loaded.assets).toHaveLength(1);
    expect(loaded.assets[0]).toMatchObject({ id, mime: "image/png", width: 10, height: 20 });
    expect(new Uint8Array(await loaded.assets[0]!.blob.arrayBuffer())).toEqual(bytes);
  });

  it("keeps solid redactions and their colour", async () => {
    const solid = {
      ...scene,
      annotations: [
        { ...createAnnotation("redact", "r1"), mode: "solid" as const, fill: "auto" as const },
        { ...createAnnotation("redact", "r2"), mode: "solid" as const, fill: "#ffffff" },
      ],
    };
    const file = await createProjectFile(
      solid,
      [{ id, blob: new Blob([bytes], { type: "image/png" }), width: 10, height: 20 }],
      { appVersion: "0.1.0", now },
    );
    const loaded = await parseProject(serializeProject(file));
    expect(loaded.issues).toEqual([]);
    expect(loaded.scene).toEqual(solid);
  });

  it("parses from a Blob", async () => {
    const file = await createProjectFile(
      scene,
      [{ id, blob: new Blob([bytes]), width: 1, height: 1 }],
      { appVersion: "x", now },
    );
    const loaded = await parseProject(new Blob([serializeProject(file)]));
    expect(loaded.scene.meta.name).toBe("demo");
  });

  it("does not embed built-in wallpapers or unreferenced assets", async () => {
    const withBuiltin = {
      ...scene,
      background: {
        fill: {
          kind: "image" as const,
          assetId: "builtin:peach-dunes",
          fit: "cover" as const,
          blur: 0,
          tint: 0,
          focusX: 0.5,
          focusY: 0.5,
        },
        grain: { amount: 0, size: 1, seed: 1 },
      },
    };
    const extra = png(9);
    const file = await createProjectFile(
      withBuiltin,
      [
        { id, blob: new Blob([bytes]), width: 1, height: 1 },
        { id: assetIdForBytes(extra), blob: new Blob([extra]), width: 1, height: 1 },
      ],
      { appVersion: "x", now },
    );
    expect(Object.keys(file.assets)).toEqual([id]);
    const loaded = await parseProject(serializeProject(file));
    expect(loaded.issues).toEqual([]);
  });

  it("fails loudly when referenced asset data is missing", async () => {
    await expect(createProjectFile(scene, [], { appVersion: "x", now })).rejects.toThrow(
      ProjectError,
    );
  });

  it("re-identifies assets whose hash does not match and reports missing ones", async () => {
    const file = await createProjectFile(
      scene,
      [{ id, blob: new Blob([bytes]), width: 1, height: 1 }],
      { appVersion: "x", now },
    );
    const tampered = JSON.parse(serializeProject(file));
    tampered.assets["img_wrong"] = tampered.assets[id];
    delete tampered.assets[id];
    tampered.scene.content.assetId = "img_wrong";
    const loaded = await parseProject(JSON.stringify(tampered));
    expect(loaded.scene.content).toMatchObject({ assetId: id });
    expect(loaded.issues.join()).toMatch(/hash mismatch/);

    const missing = JSON.parse(serializeProject(file));
    missing.assets = {};
    expect((await parseProject(JSON.stringify(missing))).issues.join()).toMatch(/missing asset/);
  });

  it("rejects things that are not project files", async () => {
    await expect(parseProject("not json")).rejects.toThrow(/invalid JSON/);
    await expect(parseProject("{}")).rejects.toThrow(/not a Shotcandy project/);
    await expect(
      parseProject(JSON.stringify({ format: PROJECT_FORMAT, formatVersion: 99 })),
    ).rejects.toThrow(/newer/);
  });

  it("migrates and normalizes the embedded scene", async () => {
    const raw = {
      format: PROJECT_FORMAT,
      formatVersion: 1,
      scene: { card: { radius: -1 } },
      assets: {},
    };
    const loaded = await parseProject(JSON.stringify(raw));
    expect(loaded.scene.card.radius).toBe(0);
    expect(loaded.issues.join()).toMatch(/card.radius/);
  });
});
