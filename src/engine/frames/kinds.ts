/**
 * Frame family implementations: layout (pure geometry) and vector drawing,
 * following docs/design/frames/frames.md. Coordinates are card units with the
 * frame's top-left at (0, 0).
 */
import { toCss } from "../math/color";
import type { Radii, Rect, Size } from "../math/geometry";
import { roundedRectPath } from "../math/path";
import {
  clipPath,
  fillCircle,
  fillPath,
  fillRoundedRect,
  strokePath,
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
  TrafficLightsSpec,
  WindowSpec,
} from "./types";

// ----------------------------------------------------------------------------
// Shared helpers
// ----------------------------------------------------------------------------

/** Chrome unit in cu: 1 ch = min(1, 1.6 W / max(W, H)) cu (caps chrome on tall captures). */
export function chromeUnit(content: Size): number {
  const long = Math.max(content.width, content.height, 1e-9);
  return Math.min(1, (1.6 * content.width) / long);
}

/** Truncate text with a trailing ellipsis to fit `maxWidth` (binary search). */
export function fitText(ctx: Ctx2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid).trimEnd() + "…").width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? text.slice(0, lo).trimEnd() + "…" : "";
}

// ----------------------------------------------------------------------------
// Window-like (macOS window, browser)
// ----------------------------------------------------------------------------

function windowLayout(
  barHeightCh: number,
  input: { plate: Size; content: Size; radius: number; smoothing: number },
): FrameGeometry {
  const ch = chromeUnit(input.content);
  const barH = barHeightCh * ch;
  const w = input.plate.width;
  const h = input.plate.height + barH;
  const r = Math.max(0, Math.min(input.radius, w / 2, h / 2));
  return {
    size: { width: w, height: h },
    screen: { x: 0, y: barH, width: input.plate.width, height: input.plate.height },
    screenRadii: [0, 0, r, r],
    screenSmoothing: input.smoothing,
    outline: [
      {
        rect: { x: 0, y: 0, width: w, height: h },
        radii: [r, r, r, r],
        smoothing: input.smoothing,
      },
    ],
  };
}

interface BarTheme {
  barTop: string;
  barBottom: string;
  separator: string;
  topHighlight: string | null;
}

function drawBar(
  ctx: Ctx2D,
  geo: FrameGeometry,
  barH: number,
  hair: number,
  theme: BarTheme,
  body: string,
  lights: TrafficLightsSpec,
  mono: boolean,
  ch: number,
): void {
  const o = geo.outline[0]!;
  const r = o.radii[0];
  const path = roundedRectPath(o.rect, o.radii, o.smoothing);
  withState(ctx, () => {
    clipPath(ctx, path);
    ctx.fillStyle = toCss(body);
    ctx.fillRect(0, barH, geo.size.width, geo.size.height - barH);
    const g = ctx.createLinearGradient(0, 0, 0, barH);
    g.addColorStop(0, toCss(theme.barTop));
    g.addColorStop(1, toCss(theme.barBottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, geo.size.width, barH);
    ctx.fillStyle = toCss(theme.separator);
    ctx.fillRect(0, barH - hair, geo.size.width, hair);
    if (theme.topHighlight) {
      ctx.fillStyle = toCss(theme.topHighlight);
      ctx.fillRect(r, hair / 2, Math.max(0, geo.size.width - 2 * r), hair);
    }
  });
  const palette = mono ? lights.mono : lights.colors;
  const d = lights.diameter * ch;
  const sw = lights.stroke * ch;
  for (let i = 0; i < 3; i++) {
    const c = palette[i] ?? palette[0]!;
    const cx = (lights.firstCenterX + i * lights.spacing) * ch;
    const cy = barH / 2;
    fillCircle(ctx, cx, cy, d / 2, c.fill);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0, d / 2 - sw / 2), 0, Math.PI * 2);
    ctx.strokeStyle = toCss(c.stroke);
    ctx.lineWidth = sw;
    ctx.stroke();
  }
}

function drawWindowBorder(ctx: Ctx2D, geo: FrameGeometry, hair: number, color: string): void {
  const o = geo.outline[0]!;
  const rect: Rect = {
    x: hair / 2,
    y: hair / 2,
    width: o.rect.width - hair,
    height: o.rect.height - hair,
  };
  const radii = o.radii.map((r) => Math.max(0, r - hair / 2)) as unknown as Radii;
  strokePath(ctx, roundedRectPath(rect, radii, o.smoothing), color, hair);
}

const hairOf = (spec: { hairline: number }, ch: number, onePx: number) =>
  Math.max(onePx, spec.hairline * ch);

export const windowKind: FrameKind<WindowSpec> = {
  kind: "window",
  supportsInset: true,
  usesCardRadius: true,
  layout: (spec, input) => windowLayout(spec.barHeight, input),
  drawBack(ctx, spec, { ref, geometry, content, onePx, fontFamily }: FrameDrawInput) {
    const t = spec.themes[ref.theme];
    const ch = chromeUnit(content);
    const barH = spec.barHeight * ch;
    const hair = hairOf(spec, ch, onePx);
    const body = ref.theme === "dark" ? "#1c1b1a" : "#ffffff";
    drawBar(ctx, geometry, barH, hair, t, body, spec.trafficLights, ref.lights === "mono", ch);
    if (ref.title) {
      withState(ctx, () => {
        ctx.font = `${spec.title.weight} ${spec.title.size * ch}px ${fontFamily}`;
        ctx.fillStyle = toCss(t.title);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const text = fitText(ctx, ref.title, spec.title.maxWidthFraction * geometry.size.width);
        ctx.fillText(text, geometry.size.width / 2, barH / 2);
      });
    }
  },
  drawFront(ctx, spec, { ref, geometry, content, onePx }) {
    const ch = chromeUnit(content);
    drawWindowBorder(ctx, geometry, hairOf(spec, ch, onePx), spec.themes[ref.theme].border);
  },
};

function drawChevron(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  size: number,
  dir: -1 | 1,
  width: number,
): void {
  const half = size / 2;
  const q = size / 4;
  ctx.beginPath();
  ctx.moveTo(cx - dir * q, cy - half);
  ctx.lineTo(cx + dir * q, cy);
  ctx.lineTo(cx - dir * q, cy + half);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

export const browserKind: FrameKind<BrowserSpec> = {
  kind: "browser",
  supportsInset: true,
  usesCardRadius: true,
  layout: (spec, input) => windowLayout(spec.barHeight, input),
  drawBack(ctx, spec, { ref, geometry, content, onePx, fontFamily }) {
    const t = spec.themes[ref.theme];
    const ch = chromeUnit(content);
    const barH = spec.barHeight * ch;
    const hair = hairOf(spec, ch, onePx);
    const body = ref.theme === "dark" ? "#1c1b1f" : "#ffffff";
    drawBar(ctx, geometry, barH, hair, t, body, spec.trafficLights, ref.lights === "mono", ch);
    const w = geometry.size.width;
    const cy = barH / 2;
    const a = spec.address;
    const aw = Math.min(a.widthFraction * w, a.maxWidth * ch);
    const ah = a.height * ch;
    const ax = (w - aw) / 2;
    // Navigation chevrons, only when they clear the address field.
    const nav = spec.nav;
    if ((nav.forwardX + nav.size) * ch < ax) {
      withState(ctx, () => {
        ctx.strokeStyle = toCss(t.nav);
        drawChevron(ctx, nav.backX * ch, cy, nav.size * ch, -1, nav.stroke * ch);
        ctx.strokeStyle = toCss(t.nav, 0.45);
        drawChevron(ctx, nav.forwardX * ch, cy, nav.size * ch, 1, nav.stroke * ch);
      });
    }
    if (aw <= ah) return;
    const field: Rect = { x: ax, y: cy - ah / 2, width: aw, height: ah };
    fillRoundedRect(ctx, field, a.radius * ch, t.field);
    strokePath(
      ctx,
      roundedRectPath(
        {
          x: field.x + hair / 2,
          y: field.y + hair / 2,
          width: field.width - hair,
          height: field.height - hair,
        },
        Math.max(0, a.radius * ch - hair / 2),
      ),
      t.fieldBorder,
      hair,
    );
    withState(ctx, () => {
      ctx.font = `500 ${a.textSize * ch}px ${fontFamily}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      const k = a.lockSize * ch;
      const gap = a.lockGap * ch;
      const text = ref.url ? fitText(ctx, ref.url, aw - 24 * ch - k - gap) : "";
      const tw = text ? ctx.measureText(text).width : 0;
      const groupW = k + (text ? gap + tw : 0);
      const lx = w / 2 - groupW / 2;
      // Lock: filled body and a stroked shackle.
      fillRoundedRect(
        ctx,
        { x: lx, y: cy - 0.1 * k, width: k, height: 0.62 * k },
        0.14 * k,
        t.lock,
      );
      ctx.beginPath();
      ctx.arc(lx + k / 2, cy - 0.1 * k, 0.26 * k, Math.PI, 2 * Math.PI);
      ctx.strokeStyle = toCss(t.lock);
      ctx.lineWidth = 1.1 * ch;
      ctx.stroke();
      if (text) {
        ctx.fillStyle = toCss(t.url);
        ctx.fillText(text, lx + k + gap, cy);
      }
    });
  },
  drawFront(ctx, spec, { ref, geometry, content, onePx }) {
    const ch = chromeUnit(content);
    drawWindowBorder(ctx, geometry, hairOf(spec, ch, onePx), spec.themes[ref.theme].border);
  },
};

// ----------------------------------------------------------------------------
// Devices (phone, tablet)
// ----------------------------------------------------------------------------

interface DeviceMetrics {
  u: number;
  b: number;
  rim: number;
  rs: number;
  rb: number;
  p: number;
  body: Rect;
}

function deviceMetrics(spec: DeviceSpec, screen: Size): DeviceMetrics {
  const u = spec.unit === "width" ? screen.width : Math.min(screen.width, screen.height);
  const b = spec.bezel * u;
  const rim = spec.rim * u;
  const rs = Math.min(spec.screenRadius * u, Math.min(screen.width, screen.height) / 2);
  const p = spec.buttonProtrusion * u;
  const body: Rect = {
    x: p,
    y: spec.padAllSides ? p : 0,
    width: screen.width + 2 * b,
    height: screen.height + 2 * b,
  };
  return { u, b, rim, rs, rb: rs + b, p, body };
}

export const deviceKind: FrameKind<DeviceSpec> = {
  kind: "device",
  supportsInset: false,
  usesCardRadius: false,
  layout(spec, { plate }) {
    const m = deviceMetrics(spec, plate);
    return {
      size: {
        width: m.body.width + 2 * m.p,
        height: m.body.height + (spec.padAllSides ? 2 * m.p : 0),
      },
      screen: { x: m.body.x + m.b, y: m.body.y + m.b, width: plate.width, height: plate.height },
      screenRadii: [m.rs, m.rs, m.rs, m.rs],
      screenSmoothing: spec.smoothing,
      outline: [{ rect: m.body, radii: [m.rb, m.rb, m.rb, m.rb], smoothing: spec.smoothing }],
    };
  },
  drawBack(ctx, spec, { ref, geometry, onePx }) {
    const t = spec.themes[ref.theme];
    const m = deviceMetrics(spec, geometry.screen);
    const { body, p } = m;
    for (const btn of spec.buttons) {
      let r: Rect;
      if (btn.side === "top") {
        r = {
          x: body.x + btn.from * body.width,
          y: body.y - p,
          width: (btn.to - btn.from) * body.width,
          height: 2 * p,
        };
      } else {
        const x = btn.side === "left" ? body.x - p : body.x + body.width - p;
        r = {
          x,
          y: body.y + btn.from * body.height,
          width: 2 * p,
          height: (btn.to - btn.from) * body.height,
        };
      }
      fillRoundedRect(ctx, r, Math.min(r.width, r.height) / 2, t.button);
    }
    const g = ctx.createLinearGradient(body.x, 0, body.x + body.width, 0);
    t.rim.forEach((c, i) =>
      g.addColorStop(t.rim.length > 1 ? i / (t.rim.length - 1) : 0, toCss(c)),
    );
    fillPath(ctx, roundedRectPath(body, m.rb, spec.smoothing), g);
    const inner: Rect = {
      x: body.x + m.rim,
      y: body.y + m.rim,
      width: body.width - 2 * m.rim,
      height: body.height - 2 * m.rim,
    };
    fillRoundedRect(ctx, inner, m.rb - m.rim, t.bezel, spec.smoothing);
    const edge: Rect = {
      x: body.x + m.rim / 2,
      y: body.y + m.rim / 2,
      width: body.width - m.rim,
      height: body.height - m.rim,
    };
    strokePath(
      ctx,
      roundedRectPath(edge, m.rb - m.rim / 2, spec.smoothing),
      t.rimHighlight,
      Math.max(onePx, 0.35 * m.rim),
    );
    if (spec.camera.placement === "bezel" && ref.camera !== false) {
      const d = spec.camera.diameter * m.u;
      const cx = body.x + body.width / 2;
      const cy = body.y + m.b / 2;
      fillCircle(ctx, cx, cy, d / 2, t.camera);
      fillCircle(ctx, cx, cy, (d * 0.56) / 2, t.lens);
    }
  },
  drawFront(ctx, spec, { ref, geometry }) {
    if (spec.camera.placement !== "screen" || ref.camera === false) return;
    const t = spec.themes[ref.theme];
    const m = deviceMetrics(spec, geometry.screen);
    const d = spec.camera.diameter * m.u;
    const cx = m.body.x + m.body.width / 2;
    const cy = m.body.y + m.b + (spec.camera.offset ?? 0) * m.u + d / 2;
    fillCircle(ctx, cx, cy, d / 2, t.camera);
    fillCircle(ctx, cx, cy, (d * 0.56) / 2, t.lens);
  },
};

// ----------------------------------------------------------------------------
// Laptop
// ----------------------------------------------------------------------------

function laptopMetrics(spec: LaptopSpec, screen: Size) {
  const W = screen.width;
  const bs = spec.bezelSide * W;
  const bt = spec.bezelTop * W;
  const bb = spec.bezelBottom * W;
  const lidW = W + 2 * bs;
  const lidH = screen.height + bt + bb;
  const deckW = spec.deck.widthRatio * lidW;
  const deckH = spec.deck.height * W;
  const lid: Rect = { x: (deckW - lidW) / 2, y: 0, width: lidW, height: lidH };
  const deck: Rect = { x: 0, y: lidH, width: deckW, height: deckH };
  const rt = spec.lidRadiusTop * W;
  const rbm = spec.lidRadiusBottom * W;
  return { W, bs, bt, bb, lid, deck, rim: spec.rim * W, lidRadii: [rt, rt, rbm, rbm] as Radii };
}

export const laptopKind: FrameKind<LaptopSpec> = {
  kind: "laptop",
  supportsInset: false,
  usesCardRadius: false,
  layout(spec, { plate }) {
    const m = laptopMetrics(spec, plate);
    const h = m.deck.height;
    const sr = spec.screenRadiusTop * m.W;
    return {
      size: { width: m.deck.width, height: m.lid.height + h },
      screen: { x: m.lid.x + m.bs, y: m.bt, width: plate.width, height: plate.height },
      screenRadii: [sr, sr, 0, 0],
      screenSmoothing: 0,
      outline: [
        { rect: m.lid, radii: m.lidRadii, smoothing: 0 },
        {
          rect: m.deck,
          radii: [0.15 * h, 0.15 * h, spec.deck.bottomRadius * h, spec.deck.bottomRadius * h],
          smoothing: 0,
        },
      ],
    };
  },
  drawBack(ctx, spec, { ref, geometry, onePx }) {
    const t = spec.themes[ref.theme];
    const m = laptopMetrics(spec, geometry.screen);
    fillPath(ctx, roundedRectPath(m.lid, m.lidRadii), t.rim);
    const inner: Rect = {
      x: m.lid.x + m.rim,
      y: m.rim,
      width: m.lid.width - 2 * m.rim,
      height: m.lid.height - 2 * m.rim,
    };
    fillRoundedRect(
      ctx,
      inner,
      m.lidRadii.map((r) => Math.max(0, r - m.rim)) as unknown as Radii,
      t.bezel,
    );
    fillCircle(
      ctx,
      m.lid.x + m.lid.width / 2,
      m.bt / 2,
      (spec.camera.diameter * m.W) / 2,
      t.camera,
    );
    const hw = spec.hinge.widthRatio * m.lid.width;
    const hh = spec.hinge.height * m.W;
    ctx.fillStyle = toCss(t.hinge);
    ctx.fillRect(m.lid.x + (m.lid.width - hw) / 2, m.lid.height - hh, hw, hh);
    // Deck.
    const deckShape = geometry.outline[1]!;
    const deckPath = roundedRectPath(deckShape.rect, deckShape.radii, 0);
    const g = ctx.createLinearGradient(0, m.deck.y, 0, m.deck.y + m.deck.height);
    g.addColorStop(0, toCss(t.deckTop));
    g.addColorStop(1, toCss(t.deckBottom));
    fillPath(ctx, deckPath, g);
    withState(ctx, () => {
      clipPath(ctx, deckPath);
      ctx.fillStyle = toCss(t.deckHighlight);
      ctx.fillRect(0, m.deck.y, m.deck.width, Math.max(onePx, 0.06 * m.deck.height));
    });
    const nw = spec.deck.notchWidth * m.W;
    const nd = spec.deck.notchDepth * m.deck.height;
    fillRoundedRect(
      ctx,
      { x: (m.deck.width - nw) / 2, y: m.deck.y, width: nw, height: nd },
      [0, 0, 0.9 * nd, 0.9 * nd],
      t.notch,
    );
  },
};

export const BUILTIN_KINDS = [windowKind, browserKind, deviceKind, laptopKind] as const;
