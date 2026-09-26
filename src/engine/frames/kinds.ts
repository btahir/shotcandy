/**
 * Frame family implementations: layout (pure geometry) and vector drawing.
 * All coordinates are card units with the frame's top-left at (0, 0).
 */
import { toCss } from "../math/color";
import type { Radii, Rect } from "../math/geometry";
import { roundedRectPath } from "../math/path";
import {
  clipPath,
  fillCircle,
  fillPath,
  fillRoundedRect,
  innerStroke,
  vGradient,
  withState,
} from "../render/draw";
import type { Ctx2D } from "../render/env";
import type {
  BrowserSpec,
  DeviceSpec,
  FrameDrawInput,
  FrameGeometry,
  FrameKind,
  LaptopSpec,
  WindowPalette,
  WindowSpec,
} from "./types";

// ----------------------------------------------------------------------------
// Window-like (macOS window, browser)
// ----------------------------------------------------------------------------

function windowLayout(
  barHeight: number,
  plate: { width: number; height: number },
  radius: number,
  smoothing: number,
): FrameGeometry {
  const w = plate.width;
  const h = plate.height + barHeight;
  const r = Math.min(radius, w / 2, h / 2);
  const outer: Rect = { x: 0, y: 0, width: w, height: h };
  return {
    size: { width: w, height: h },
    screen: { x: 0, y: barHeight, width: plate.width, height: plate.height },
    screenRadii: [0, 0, r, r],
    screenSmoothing: smoothing,
    outline: [{ rect: outer, radii: [r, r, r, r], smoothing }],
  };
}

function drawWindowChrome(
  ctx: Ctx2D,
  geo: FrameGeometry,
  barHeight: number,
  pal: WindowPalette,
  controls: { size: number; gap: number; inset: number },
): void {
  const outline = geo.outline[0]!;
  const path = roundedRectPath(outline.rect, outline.radii, outline.smoothing);
  fillPath(ctx, path, pal.body);
  withState(ctx, () => {
    clipPath(ctx, path);
    ctx.fillStyle = vGradient(ctx, 0, barHeight, pal.bar, pal.barBottom);
    ctx.fillRect(0, 0, geo.size.width, barHeight);
    ctx.fillStyle = toCss(pal.separator);
    const sep = Math.max(0.8, barHeight * 0.025);
    ctx.fillRect(0, barHeight - sep, geo.size.width, sep);
  });
  const r = controls.size / 2;
  const cy = barHeight / 2;
  for (let i = 0; i < 3; i++) {
    const cx = controls.inset + r + i * (controls.size + controls.gap);
    fillCircle(ctx, cx, cy, r, pal.controls[i]!);
    ctx.beginPath();
    ctx.arc(cx, cy, r - 0.35, 0, Math.PI * 2);
    ctx.strokeStyle = toCss(pal.controlBorder);
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
}

function controlsEnd(spec: {
  controlInset: number;
  controlSize: number;
  controlGap: number;
}): number {
  return spec.controlInset + 3 * spec.controlSize + 2 * spec.controlGap;
}

function drawOutline(ctx: Ctx2D, geo: FrameGeometry, color: string, width: number): void {
  const o = geo.outline[0]!;
  innerStroke(ctx, roundedRectPath(o.rect, o.radii, o.smoothing), color, width);
}

function fitText(ctx: Ctx2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + "…").width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? text.slice(0, lo) + "…" : "";
}

export const windowKind: FrameKind<WindowSpec> = {
  kind: "window",
  layout: (spec, { plate, radius, smoothing }) =>
    windowLayout(spec.barHeight, plate, radius, smoothing),
  drawBack(ctx, spec, { ref, geometry, fontFamily }: FrameDrawInput) {
    const pal = spec.themes[ref.theme];
    drawWindowChrome(ctx, geometry, spec.barHeight, pal, {
      size: spec.controlSize,
      gap: spec.controlGap,
      inset: spec.controlInset,
    });
    if (ref.title) {
      withState(ctx, () => {
        ctx.font = `600 ${spec.titleSize}px ${fontFamily}`;
        ctx.fillStyle = toCss(pal.title);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const reserved = controlsEnd(spec) + spec.controlInset;
        const text = fitText(ctx, ref.title, geometry.size.width - 2 * reserved);
        ctx.fillText(text, geometry.size.width / 2, spec.barHeight / 2 + spec.titleSize * 0.04);
      });
    }
  },
  drawFront(ctx, spec, { ref, geometry }) {
    drawOutline(ctx, geometry, spec.themes[ref.theme].outline, spec.outlineWidth);
  },
};

function drawLock(ctx: Ctx2D, x: number, cy: number, size: number, color: string): void {
  const bw = size * 0.8;
  const bh = size * 0.62;
  const by = cy - bh / 2 + size * 0.14;
  ctx.beginPath();
  ctx.arc(x + bw / 2, by, bw * 0.3, Math.PI, 0);
  ctx.strokeStyle = toCss(color);
  ctx.lineWidth = size * 0.13;
  ctx.stroke();
  fillRoundedRect(ctx, { x, y: by, width: bw, height: bh }, size * 0.12, color);
}

function drawChevron(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  size: number,
  dir: -1 | 1,
  color: string,
): void {
  ctx.beginPath();
  ctx.moveTo(cx - (dir * size) / 4, cy - size / 2);
  ctx.lineTo(cx + (dir * size) / 4, cy);
  ctx.lineTo(cx - (dir * size) / 4, cy + size / 2);
  ctx.strokeStyle = toCss(color);
  ctx.lineWidth = size * 0.14;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

export const browserKind: FrameKind<BrowserSpec> = {
  kind: "browser",
  layout: (spec, { plate, radius, smoothing }) =>
    windowLayout(spec.barHeight, plate, radius, smoothing),
  drawBack(ctx, spec, { ref, geometry, fontFamily }) {
    const pal = spec.themes[ref.theme];
    drawWindowChrome(ctx, geometry, spec.barHeight, pal, {
      size: spec.controlSize,
      gap: spec.controlGap,
      inset: spec.controlInset,
    });
    const w = geometry.size.width;
    const cy = spec.barHeight / 2;
    const navX = controlsEnd(spec) + spec.controlInset * 1.4;
    const iconSize = spec.addressHeight * 0.42;
    if (navX + iconSize * 3 < w * 0.3) {
      drawChevron(ctx, navX + iconSize / 2, cy, iconSize, -1, pal.icon);
      drawChevron(ctx, navX + iconSize * 2.2, cy, iconSize, 1, pal.icon);
    }
    const aw = Math.min(w * spec.addressWidth, w - 2 * (controlsEnd(spec) + spec.controlInset));
    if (aw <= spec.addressHeight * 2) return;
    const ax = (w - aw) / 2;
    const ay = cy - spec.addressHeight / 2;
    fillRoundedRect(
      ctx,
      { x: ax, y: ay, width: aw, height: spec.addressHeight },
      spec.addressHeight * 0.3,
      pal.address,
    );
    const text = ref.url || "";
    withState(ctx, () => {
      ctx.font = `500 ${spec.addressTextSize}px ${fontFamily}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      const lockSize = spec.addressTextSize * 0.85;
      const fitted = fitText(ctx, text, aw - spec.addressHeight * 1.6 - lockSize);
      const tw = ctx.measureText(fitted).width;
      const total = lockSize + (fitted ? lockSize * 0.6 + tw : 0);
      let x = ax + (aw - total) / 2;
      drawLock(ctx, x, cy, lockSize, pal.icon);
      x += lockSize * 1.6;
      ctx.fillStyle = toCss(pal.addressText);
      if (fitted) ctx.fillText(fitted, x, cy + spec.addressTextSize * 0.04);
    });
  },
  drawFront(ctx, spec, { ref, geometry }) {
    drawOutline(ctx, geometry, spec.themes[ref.theme].outline, spec.outlineWidth);
  },
};

// ----------------------------------------------------------------------------
// Devices (phone, tablet)
// ----------------------------------------------------------------------------

interface DeviceMetrics {
  s: number;
  rim: number;
  bezel: number;
  btn: number;
  body: Rect;
  bodyRadius: number;
  screenRadius: number;
}

function deviceMetrics(spec: DeviceSpec, plate: { width: number; height: number }): DeviceMetrics {
  const s = Math.min(plate.width, plate.height);
  const rim = spec.rim * s;
  const bezel = spec.bezel * s;
  const btn = spec.buttonThickness * s;
  const hasLeft = spec.buttons.some((b) => b.side === "left");
  const hasRight = spec.buttons.some((b) => b.side === "right");
  const hasTop = spec.buttons.some((b) => b.side === "top");
  const screenRadius = Math.min(spec.screenRadius * s, s / 2);
  const bodyW = plate.width + 2 * (rim + bezel);
  const bodyH = plate.height + 2 * (rim + bezel);
  const body: Rect = {
    x: hasLeft || hasRight ? btn : 0,
    y: hasTop ? btn : 0,
    width: bodyW,
    height: bodyH,
  };
  void hasRight;
  return { s, rim, bezel, btn, body, bodyRadius: screenRadius + rim + bezel, screenRadius };
}

export const deviceKind: FrameKind<DeviceSpec> = {
  kind: "device",
  layout(spec, { plate }) {
    const m = deviceMetrics(spec, plate);
    const sideButtons = spec.buttons.some((b) => b.side === "left" || b.side === "right");
    const inset = m.rim + m.bezel;
    const r = m.bodyRadius;
    return {
      size: {
        width: m.body.width + (sideButtons ? 2 * m.btn : 0),
        height: m.body.height + m.body.y,
      },
      screen: {
        x: m.body.x + inset,
        y: m.body.y + inset,
        width: plate.width,
        height: plate.height,
      },
      screenRadii: [m.screenRadius, m.screenRadius, m.screenRadius, m.screenRadius],
      screenSmoothing: spec.smoothing,
      outline: [{ rect: m.body, radii: [r, r, r, r], smoothing: spec.smoothing }],
    };
  },
  drawBack(ctx, spec, { ref, geometry }) {
    const pal = spec.themes[ref.theme];
    const plate = { width: geometry.screen.width, height: geometry.screen.height };
    const m = deviceMetrics(spec, plate);
    const { body } = m;
    // Buttons sit behind the body and poke out of its edges.
    for (const b of spec.buttons) {
      const r = m.btn;
      let rect: Rect;
      if (b.side === "top") {
        rect = {
          x: body.x + body.width * b.at,
          y: body.y - m.btn,
          width: body.width * b.length,
          height: m.btn * 2,
        };
      } else {
        const y = body.y + body.height * b.at;
        const x = b.side === "left" ? body.x - m.btn : body.x + body.width - m.btn;
        rect = { x, y, width: m.btn * 2, height: body.height * b.length };
      }
      fillRoundedRect(ctx, rect, r, pal.button);
    }
    const bodyPath = roundedRectPath(body, m.bodyRadius, spec.smoothing);
    const g = ctx.createLinearGradient(body.x, body.y, body.x + body.width, body.y + body.height);
    g.addColorStop(0, toCss(pal.bodyEdge));
    g.addColorStop(0.5, toCss(pal.body));
    g.addColorStop(1, toCss(pal.bodyEdge));
    fillPath(ctx, bodyPath, g);
    // Inner body face (leaves a thin gradient edge visible around the rim).
    const edge = m.rim * 0.35;
    const face: Rect = {
      x: body.x + edge,
      y: body.y + edge,
      width: body.width - 2 * edge,
      height: body.height - 2 * edge,
    };
    fillRoundedRect(ctx, face, m.bodyRadius - edge, pal.body, spec.smoothing);
    // Black bezel.
    const bz: Rect = {
      x: body.x + m.rim,
      y: body.y + m.rim,
      width: body.width - 2 * m.rim,
      height: body.height - 2 * m.rim,
    };
    fillRoundedRect(ctx, bz, m.screenRadius + m.bezel, pal.bezel, spec.smoothing);
    if (spec.camera) {
      const cx = body.x + body.width / 2;
      const cy = body.y + m.rim + m.bezel / 2;
      fillCircle(ctx, cx, cy, (spec.camera.size * m.s) / 2, pal.camera);
    }
  },
  drawFront(ctx, spec, { ref, geometry }) {
    const pal = spec.themes[ref.theme];
    const scr = geometry.screen;
    const s = Math.min(scr.width, scr.height);
    if (spec.island) {
      const w = spec.island.width * s;
      const h = spec.island.height * s;
      fillRoundedRect(
        ctx,
        { x: scr.x + (scr.width - w) / 2, y: scr.y + spec.island.top * s, width: w, height: h },
        h / 2,
        pal.island,
      );
    }
  },
};

// ----------------------------------------------------------------------------
// Laptop
// ----------------------------------------------------------------------------

function laptopMetrics(spec: LaptopSpec, plate: { width: number; height: number }) {
  const W = plate.width;
  const top = spec.bezelTop * W;
  const side = spec.bezelSide * W;
  const bottom = spec.bezelBottom * W;
  const lidW = plate.width + 2 * side;
  const lidH = plate.height + top + bottom;
  const baseW = lidW * (1 + 2 * spec.baseOverhang);
  const baseH = spec.baseHeight * W;
  const lid: Rect = { x: (baseW - lidW) / 2, y: 0, width: lidW, height: lidH };
  const base: Rect = { x: 0, y: lidH, width: baseW, height: baseH };
  return {
    W,
    top,
    side,
    bottom,
    lid,
    base,
    lidR: spec.lidRadius * W,
    screenR: spec.screenRadius * W,
  };
}

export const laptopKind: FrameKind<LaptopSpec> = {
  kind: "laptop",
  layout(spec, { plate }) {
    const m = laptopMetrics(spec, plate);
    const lr = m.lidR;
    const baseR = m.base.height * 0.9;
    const screenRadii: Radii = [m.screenR, m.screenR, 0, 0];
    return {
      size: { width: m.base.width, height: m.lid.height + m.base.height },
      screen: { x: m.lid.x + m.side, y: m.top, width: plate.width, height: plate.height },
      screenRadii,
      screenSmoothing: 0.6,
      outline: [
        { rect: m.lid, radii: [lr, lr, 0, 0], smoothing: 0.6 },
        {
          rect: m.base,
          radii: [m.base.height * 0.15, m.base.height * 0.15, baseR, baseR],
          smoothing: 0.4,
        },
      ],
    };
  },
  drawBack(ctx, spec, { ref, geometry }) {
    const pal = spec.themes[ref.theme];
    const m = laptopMetrics(spec, { width: geometry.screen.width, height: geometry.screen.height });
    const lidShape = geometry.outline[0]!;
    fillPath(ctx, roundedRectPath(lidShape.rect, lidShape.radii, lidShape.smoothing), pal.body);
    const edge = m.side * 0.12;
    const bezelRect: Rect = {
      x: m.lid.x + edge,
      y: edge,
      width: m.lid.width - 2 * edge,
      height: m.lid.height - edge,
    };
    fillRoundedRect(ctx, bezelRect, [m.lidR - edge, m.lidR - edge, 0, 0], pal.bezel, 0.6);
    if (spec.camera) {
      fillCircle(
        ctx,
        m.lid.x + m.lid.width / 2,
        m.top / 2,
        (spec.camera.size * m.W) / 2,
        pal.camera,
      );
    }
    // Base (keyboard deck seen edge-on).
    const baseShape = geometry.outline[1]!;
    const basePath = roundedRectPath(baseShape.rect, baseShape.radii, baseShape.smoothing);
    const g = ctx.createLinearGradient(0, m.base.y, 0, m.base.y + m.base.height);
    g.addColorStop(0, toCss(pal.base));
    g.addColorStop(0.55, toCss(pal.base));
    g.addColorStop(1, toCss(pal.baseShadow));
    fillPath(ctx, basePath, g);
    // Hinge shadow line and the thumb notch.
    ctx.fillStyle = toCss(pal.baseEdge);
    ctx.fillRect(m.lid.x, m.base.y, m.lid.width, Math.max(0.6, m.base.height * 0.08));
    const nw = spec.notchWidth * m.W;
    const nd = spec.notchDepth * m.W;
    fillRoundedRect(
      ctx,
      { x: (m.base.width - nw) / 2, y: m.base.y, width: nw, height: nd },
      [0, 0, nd, nd],
      pal.baseEdge,
    );
  },
};

export const BUILTIN_KINDS = [windowKind, browserKind, deviceKind, laptopKind] as const;
