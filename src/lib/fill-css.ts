/** CSS approximations of background fills, for swatches and tints (not for export). */
import {
  type BackgroundFill,
  type GradientStop,
  type Palette,
  builtinAssetUrl,
  resolveAutoFill,
} from "@/engine";

const stops = (s: GradientStop[]) =>
  s.map((x) => `${x.color} ${Math.round(x.offset * 100)}%`).join(", ");

export function fillToCss(fill: BackgroundFill, palette: Palette | null = null): string {
  switch (fill.kind) {
    case "none":
      return "transparent";
    case "solid":
      return fill.color;
    case "linear":
      return `linear-gradient(${fill.angle}deg, ${stops(fill.stops)})`;
    case "radial":
      return `radial-gradient(circle at ${fill.cx * 100}% ${fill.cy * 100}%, ${stops(fill.stops)})`;
    case "conic":
      return `conic-gradient(from ${fill.angle}deg at ${fill.cx * 100}% ${fill.cy * 100}%, ${stops(fill.stops)})`;
    case "mesh":
      return [
        ...fill.points.map(
          (p) =>
            `radial-gradient(circle at ${Math.round(p.x * 100)}% ${Math.round(p.y * 100)}%, ${p.color} 0%, transparent ${Math.round(Math.min(95, p.radius * 110))}%)`,
        ),
        fill.base,
      ].join(", ");
    case "image":
      return fill.assetId.startsWith("builtin:")
        ? `center / cover url(${builtinAssetUrl(fill.assetId).replace("/backgrounds/", "/backgrounds/thumbs/")})`
        : "var(--sc-well)";
    case "auto":
      return fillToCss(resolveAutoFill(fill, palette), palette);
  }
}

/** A representative colour of a fill (for the stage tint wash). */
export function fillDominant(fill: BackgroundFill, palette: Palette | null = null): string | null {
  switch (fill.kind) {
    case "solid":
      return fill.color;
    case "linear":
    case "radial":
    case "conic":
      return fill.stops[Math.floor(fill.stops.length / 2)]?.color ?? null;
    case "mesh":
      return fill.points[0]?.color ?? fill.base;
    case "auto":
      return fillDominant(resolveAutoFill(fill, palette), palette);
    default:
      return null;
  }
}
