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
  CanvasFrameSpec,
  DeviceButton,
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

/**
 * Chrome unit in cu: 1 ch = min(1, W / 625) cu. Landscape shots (W = 1000 cu)
 * get full-size chrome; narrow and tall windows scale it with their width, so
 * a title bar is always about 3 % of the window's width at most.
 */
export function chromeUnit(content: Size): number {
  return Math.min(1, Math.max(0, content.width) / 625);
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
      // Reload glyph at the right end of the field, when there is room.
      const reload = aw > 150 * ch;
      const room = aw - 24 * ch - k - gap - (reload ? 2 * k : 0);
      const text = ref.url ? fitText(ctx, ref.url, room) : "";
      // An empty address still reads as one: a soft placeholder bar the width of a short domain.
      const tw = text ? ctx.measureText(text).width : Math.min(room, 76 * ch);
      const groupW = k + gap + tw;
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
      } else if (tw > 0) {
        const bh = a.textSize * 0.42 * ch;
        fillRoundedRect(
          ctx,
          { x: lx + k + gap, y: cy - bh / 2, width: tw, height: bh },
          bh / 2,
          toCss(t.url, 0.22),
        );
      }
      if (reload) {
        const rx = field.x + field.width - 1.6 * k;
        const r = 0.42 * k;
        ctx.beginPath();
        ctx.arc(rx, cy, r, -0.35 * Math.PI, 1.45 * Math.PI);
        ctx.strokeStyle = toCss(t.nav);
        ctx.lineWidth = 0.95 * ch;
        ctx.lineCap = "round";
        ctx.stroke();
        // Arrow head at the start of the arc.
        const ax0 = rx + r * Math.cos(-0.35 * Math.PI);
        const ay0 = cy + r * Math.sin(-0.35 * Math.PI);
        const hs = 0.34 * k;
        ctx.beginPath();
        ctx.moveTo(ax0 - hs * 0.9, ay0 - hs * 0.35);
        ctx.lineTo(ax0 + hs * 0.15, ay0 + hs * 0.05);
        ctx.lineTo(ax0 - hs * 0.2, ay0 + hs * 0.95);
        ctx.fillStyle = toCss(t.nav);
        ctx.fill();
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

/**
 * Where the content sits on a device screen. Content captured on such a device
 * (a portrait phone shot, a tablet shot) fills the screen edge to edge. Anything
 * else is letterboxed inside a screen of plausible proportions, with safe
 * margins so the screen's rounded corners and the camera never cover it, and a
 * landscape image turns the device sideways (camera on a short edge).
 */
export interface DeviceScreen {
  screen: Size;
  content: Rect;
  contentRadius: number;
  screenRadius: number;
  orientation: "portrait" | "landscape";
}

export function deviceScreen(spec: DeviceSpec, content: Size): DeviceScreen {
  const { width: w, height: h } = content;
  const short = Math.max(1e-9, Math.min(w, h));
  const long = Math.max(w, h);
  const landscape = w > h * 1.001;
  const orientation = landscape ? "landscape" : "portrait";
  const A = long / short;
  const fb = spec.fullBleed;
  const bleedOk = fb
    ? A >= fb.min && A <= fb.max && (!landscape || spec.id !== "phone")
    : A >= spec.aspect.min && A <= spec.aspect.max;
  if (bleedOk) {
    const rs = Math.min(spec.screenRadius * short, short / 2);
    return {
      screen: { width: w, height: h },
      content: { x: 0, y: 0, width: w, height: h },
      contentRadius: rs,
      screenRadius: rs,
      orientation,
    };
  }
  // Safe margin on the short axis, scaled with the screen's corner radius.
  let dS = short * spec.screenRadius * 0.26;
  let S = short + 2 * dS;
  let rs = spec.screenRadius * S;
  const cam = spec.camera;
  const camClear = cam.placement === "screen" ? ((cam.offset ?? 0) + cam.diameter * 1.5) * S : 0;
  const dLmin = Math.max(camClear, 0.6 * rs);
  let L = Math.max(long + 2 * dLmin, spec.aspect.min * S);
  if (L > spec.aspect.max * S) {
    // Too long for the device: widen the short axis instead (letterbox the other way).
    S = L / spec.aspect.max;
    dS = (S - short) / 2;
    rs = spec.screenRadius * S;
    L = Math.max(long + 2 * Math.max(camClear, 0.6 * rs), spec.aspect.min * S);
  }
  const dL = (L - long) / 2;
  const screen = landscape ? { width: L, height: S } : { width: S, height: L };
  const rect: Rect = landscape
    ? { x: dL, y: dS, width: w, height: h }
    : { x: dS, y: dL, width: w, height: h };
  return {
    screen,
    content: rect,
    contentRadius: Math.max(0, rs - Math.max(dL, dS)),
    screenRadius: rs,
    orientation,
  };
}

interface DeviceMetrics {
  u: number;
  b: number;
  rim: number;
  rs: number;
  rb: number;
  p: number;
  body: Rect;
  landscape: boolean;
}

function deviceMetrics(
  spec: DeviceSpec,
  screen: Size,
  orientation: "portrait" | "landscape" = "portrait",
): DeviceMetrics {
  const landscape = orientation === "landscape";
  const u =
    spec.unit === "width" && !landscape ? screen.width : Math.min(screen.width, screen.height);
  const b = spec.bezel * u;
  const rim = spec.rim * u;
  const rs = Math.min(spec.screenRadius * u, Math.min(screen.width, screen.height) / 2);
  const p = spec.buttonProtrusion * u;
  const padX = landscape ? spec.padAllSides : true;
  const padY = landscape ? true : spec.padAllSides;
  const body: Rect = {
    x: padX ? p : 0,
    y: padY ? p : 0,
    width: screen.width + 2 * b,
    height: screen.height + 2 * b,
  };
  return { u, b, rim, rs, rb: rs + b, p, body, landscape };
}

/** Button rects in card units, rotated with the device in landscape. */
function deviceButtons(spec: DeviceSpec, m: DeviceMetrics): Rect[] {
  const { body, p } = m;
  return spec.buttons.map((btn) => {
    let side: DeviceButton["side"] | "bottom" = btn.side;
    let from = btn.from;
    let to = btn.to;
    if (m.landscape) {
      // Rotate 90 degrees counter-clockwise: right -> top, left -> bottom, top -> left.
      if (btn.side === "right") side = "top";
      else if (btn.side === "left") side = "bottom";
      else {
        side = "left";
        [from, to] = [1 - btn.to, 1 - btn.from];
      }
    }
    if (side === "top" || side === "bottom") {
      return {
        x: body.x + from * body.width,
        y: side === "top" ? body.y - p : body.y + body.height - p,
        width: (to - from) * body.width,
        height: 2 * p,
      };
    }
    return {
      x: side === "left" ? body.x - p : body.x + body.width - p,
      y: body.y + from * body.height,
      width: 2 * p,
      height: (to - from) * body.height,
    };
  });
}

export const deviceKind: FrameKind<DeviceSpec> = {
  kind: "device",
  supportsInset: false,
  usesCardRadius: false,
  layout(spec, { plate }) {
    const ds = deviceScreen(spec, plate);
    const m = deviceMetrics(spec, ds.screen, ds.orientation);
    const landscape = ds.orientation === "landscape";
    const padW = landscape ? (spec.padAllSides ? 2 * m.p : 0) : 2 * m.p;
    const padH = landscape ? 2 * m.p : spec.padAllSides ? 2 * m.p : 0;
    const sx = m.body.x + m.b;
    const sy = m.body.y + m.b;
    const rb = ds.screenRadius + m.b;
    return {
      size: { width: m.body.width + padW, height: m.body.height + padH },
      screen: { x: sx, y: sy, width: ds.screen.width, height: ds.screen.height },
      screenRadii: [ds.screenRadius, ds.screenRadius, ds.screenRadius, ds.screenRadius],
      screenSmoothing: spec.smoothing,
      outline: [{ rect: m.body, radii: [rb, rb, rb, rb], smoothing: spec.smoothing }],
      content: { ...ds.content, x: sx + ds.content.x, y: sy + ds.content.y },
      contentRadii: [ds.contentRadius, ds.contentRadius, ds.contentRadius, ds.contentRadius],
      screenFill: "black",
      orientation: ds.orientation,
    };
  },
  drawBack(ctx, spec, { ref, geometry, onePx }) {
    const t = spec.themes[ref.theme];
    const m = deviceMetrics(spec, geometry.screen, geometry.orientation);
    const { body } = m;
    // Screen radius comes from the layout (it may be letterboxed).
    const rb = (geometry.screenRadii[0] ?? m.rs) + m.b;
    for (const r of deviceButtons(spec, m)) {
      fillRoundedRect(ctx, r, Math.min(r.width, r.height) / 2, t.button);
    }
    const g = m.landscape
      ? ctx.createLinearGradient(0, body.y, 0, body.y + body.height)
      : ctx.createLinearGradient(body.x, 0, body.x + body.width, 0);
    t.rim.forEach((c, i) =>
      g.addColorStop(t.rim.length > 1 ? i / (t.rim.length - 1) : 0, toCss(c)),
    );
    fillPath(ctx, roundedRectPath(body, rb, spec.smoothing), g);
    const inner: Rect = {
      x: body.x + m.rim,
      y: body.y + m.rim,
      width: body.width - 2 * m.rim,
      height: body.height - 2 * m.rim,
    };
    fillRoundedRect(ctx, inner, rb - m.rim, t.bezel, spec.smoothing);
    const edge: Rect = {
      x: body.x + m.rim / 2,
      y: body.y + m.rim / 2,
      width: body.width - m.rim,
      height: body.height - m.rim,
    };
    strokePath(
      ctx,
      roundedRectPath(edge, rb - m.rim / 2, spec.smoothing),
      t.rimHighlight,
      Math.max(onePx, 0.35 * m.rim),
    );
    if (spec.camera.placement === "bezel" && ref.camera !== false) {
      // Tablets keep the camera centred on the top edge in either orientation.
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
    const m = deviceMetrics(spec, geometry.screen, geometry.orientation);
    const d = spec.camera.diameter * m.u;
    const along = m.b + (spec.camera.offset ?? 0) * m.u + d / 2;
    const cx = m.landscape ? m.body.x + along : m.body.x + m.body.width / 2;
    const cy = m.landscape ? m.body.y + m.body.height / 2 : m.body.y + along;
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
    // A laptop screen keeps laptop proportions; other content is centred on its own edge colour.
    const A = plate.width / Math.max(1e-9, plate.height);
    const screen: Size =
      A < spec.aspect.min
        ? { width: plate.height * spec.aspect.min, height: plate.height }
        : A > spec.aspect.max
          ? { width: plate.width, height: plate.width / spec.aspect.max }
          : plate;
    const m = laptopMetrics(spec, screen);
    const h = m.deck.height;
    const sr = spec.screenRadiusTop * m.W;
    const sx = m.lid.x + m.bs;
    const letterboxed = screen !== plate;
    return {
      size: { width: m.deck.width, height: m.lid.height + h },
      screen: { x: sx, y: m.bt, width: screen.width, height: screen.height },
      screenRadii: [sr, sr, 0, 0],
      ...(letterboxed
        ? {
            content: {
              x: sx + (screen.width - plate.width) / 2,
              y: m.bt + (screen.height - plate.height) / 2,
              width: plate.width,
              height: plate.height,
            },
            contentRadii: [0, 0, 0, 0] as Radii,
            screenFill: "edge" as const,
          }
        : {}),
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

// ----------------------------------------------------------------------------
// Canvas frame (design-tool selection: name, outline, handles, size)
// ----------------------------------------------------------------------------

/** Default name shown above a canvas frame until the user renames it. */
export const CANVAS_FRAME_NAME = "Frame 1";

function canvasBands(spec: CanvasFrameSpec) {
  const top = spec.labelSize * 1.25 + spec.labelGap;
  const bottom = spec.tag.gap + spec.tag.size + 2 * spec.tag.padY;
  // Room for the corner handles to overhang the screenshot.
  const side = spec.handle / 2 + spec.handleStroke;
  return { top, bottom, side };
}

export const canvasKind: FrameKind<CanvasFrameSpec> = {
  kind: "canvas",
  supportsInset: true,
  usesCardRadius: true,
  layout(spec, input) {
    const { top, bottom, side } = canvasBands(spec);
    const w = input.plate.width;
    const h = input.plate.height;
    const r = Math.max(0, Math.min(input.radius, w / 2, h / 2));
    const screen: Rect = { x: side, y: top, width: w, height: h };
    const radii: Radii = [r, r, r, r];
    return {
      size: { width: w + 2 * side, height: top + h + bottom },
      screen,
      screenRadii: radii,
      screenSmoothing: input.smoothing,
      // Shadows and borders hug the screenshot, not the label or the tag.
      outline: [{ rect: screen, radii, smoothing: input.smoothing }],
    };
  },
  drawBack(ctx, spec, { ref, geometry, fontFamily }) {
    const t = spec.themes[ref.theme];
    const s = geometry.screen;
    withState(ctx, () => {
      ctx.font = `500 ${spec.labelSize}px ${fontFamily}`;
      ctx.fillStyle = toCss(t.label);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      const name = ref.title.trim() || CANVAS_FRAME_NAME;
      ctx.fillText(fitText(ctx, name, s.width), s.x, s.y - spec.labelGap);
    });
  },
  drawFront(ctx, spec, { ref, geometry, onePx, fontFamily, pixels }) {
    const t = spec.themes[ref.theme];
    const s = geometry.screen;
    const line = Math.max(onePx, spec.stroke);
    // Selection outline, straddling the screenshot's edge.
    strokePath(
      ctx,
      roundedRectPath(s, geometry.screenRadii, geometry.screenSmoothing),
      t.accent,
      line,
    );
    // Corner handles.
    const hs = spec.handle;
    const hw = Math.max(onePx, spec.handleStroke);
    for (const [x, y] of [
      [s.x, s.y],
      [s.x + s.width, s.y],
      [s.x + s.width, s.y + s.height],
      [s.x, s.y + s.height],
    ] as const) {
      const box: Rect = { x: x - hs / 2, y: y - hs / 2, width: hs, height: hs };
      fillRoundedRect(ctx, box, 0, t.handleFill);
      strokePath(ctx, roundedRectPath(box, 0), t.accent, hw);
    }
    // Size tag under the frame.
    if (ref.sizeTag === false || !pixels) return;
    withState(ctx, () => {
      const text = `${Math.round(pixels.width)} × ${Math.round(pixels.height)}`;
      ctx.font = `600 ${spec.tag.size}px ${fontFamily}`;
      const tw = ctx.measureText(text).width;
      const w = tw + 2 * spec.tag.padX;
      const h = spec.tag.size + 2 * spec.tag.padY;
      const box: Rect = {
        x: s.x + s.width / 2 - w / 2,
        y: s.y + s.height + spec.tag.gap,
        width: w,
        height: h,
      };
      fillRoundedRect(ctx, box, spec.tag.radius, t.accent);
      ctx.fillStyle = toCss(t.tagText);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, box.x + w / 2, box.y + h / 2 + spec.tag.size * 0.04);
    });
  },
};

export const BUILTIN_KINDS = [windowKind, browserKind, deviceKind, laptopKind, canvasKind] as const;
