import { describe, expect, it } from "vitest";
import {
  colorAt,
  fromGradientEdit,
  hueShiftFill,
  setStopCount,
  shuffleMesh,
  toGradientEdit,
  colorToOklch,
  type BackgroundFill,
} from "@/engine";

const linear: BackgroundFill = {
  kind: "linear",
  angle: 135,
  stops: [
    { offset: 0, color: "#ff0000" },
    { offset: 1, color: "#0000ff" },
  ],
};

describe("gradient editing model", () => {
  it("round-trips linear fills and edits angle and type", () => {
    const e = toGradientEdit(linear);
    expect(fromGradientEdit(e)).toEqual(linear);
    expect(fromGradientEdit({ ...e, angle: -90 })).toMatchObject({ kind: "linear", angle: 270 });
    expect(fromGradientEdit({ ...e, type: "radial" }).kind).toBe("radial");
    const conic = fromGradientEdit({ ...e, type: "conic" });
    expect(conic.kind === "conic" && conic.stops.at(-1)!.color).toBe("#ff0000"); // seamless
    const mesh = fromGradientEdit({ ...e, type: "mesh" });
    expect(mesh).toMatchObject({ kind: "mesh", base: "#ff0000" });
    expect(toGradientEdit(mesh).type).toBe("mesh");
  });

  it("keeps 2 to 4 stops and resamples colours when the count changes", () => {
    const three = setStopCount(linear.kind === "linear" ? linear.stops : [], 3);
    expect(three.map((s) => s.offset)).toEqual([0, 0.5, 1]);
    expect(three[1]!.color).toBe(colorAt(three, 0.5));
    expect(setStopCount(three, 9)).toHaveLength(4);
    expect(setStopCount(three, 1)).toHaveLength(2);
  });

  it("turns solids into an editable two-stop blend", () => {
    const e = toGradientEdit({ kind: "solid", color: "#336699" });
    expect(e.stops).toHaveLength(2);
    expect(e.stops[0]!.color).toBe("#336699");
  });

  it("shuffles mesh points deterministically and shifts hue", () => {
    const mesh = fromGradientEdit({ ...toGradientEdit(linear), type: "mesh" });
    if (mesh.kind !== "mesh") throw new Error("mesh");
    expect(shuffleMesh(mesh, 7)).toEqual(shuffleMesh(mesh, 7));
    expect(shuffleMesh(mesh, 7)).not.toEqual(shuffleMesh(mesh, 8));
    const shifted = hueShiftFill(linear, 120);
    const h0 = colorToOklch("#ff0000").h;
    const h1 = colorToOklch(shifted.kind === "linear" ? shifted.stops[0]!.color : "").h;
    expect((h1 - h0 + 360) % 360).toBeGreaterThan(100);
  });
});
