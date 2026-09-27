/**
 * Minimal container parsers for tests: they read what the encoders wrote
 * (frame count, timing, size) straight from the file structure, independent
 * of the code that produced it.
 */

export interface GifInfo {
  version: string;
  width: number;
  height: number;
  frames: number;
  /** Per-frame delays in centiseconds. */
  delays: number[];
  /** NETSCAPE2.0 loop count (0 = forever), or null when absent. */
  loop: number | null;
  globalColors: number;
  /** Whether the file ends with the 0x3B trailer. */
  trailer: boolean;
}

/** Walk a GIF's block structure (throws on malformed data). */
export function parseGif(bytes: Uint8Array): GifInfo {
  const td = new TextDecoder();
  const version = td.decode(bytes.subarray(0, 6));
  if (version !== "GIF89a" && version !== "GIF87a") throw new Error(`bad GIF header ${version}`);
  const u16 = (o: number) => bytes[o]! | (bytes[o + 1]! << 8);
  const width = u16(6);
  const height = u16(8);
  const packed = bytes[10]!;
  let p = 13;
  let globalColors = 0;
  if (packed & 0x80) {
    globalColors = 2 << (packed & 7);
    p += 3 * globalColors;
  }
  const delays: number[] = [];
  let frames = 0;
  let loop: number | null = null;
  let pendingDelay = 0;
  const skipSub = () => {
    while (p < bytes.length) {
      const n = bytes[p++]!;
      if (n === 0) return;
      p += n;
    }
    throw new Error("truncated sub-blocks");
  };
  for (;;) {
    if (p >= bytes.length)
      return { version, width, height, frames, delays, loop, globalColors, trailer: false };
    const b = bytes[p++]!;
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = bytes[p++]!;
      if (label === 0xf9) {
        const size = bytes[p]!;
        pendingDelay = u16(p + 2);
        p += 1 + size;
        skipSub();
      } else if (label === 0xff) {
        const size = bytes[p]!;
        const app = td.decode(bytes.subarray(p + 1, p + 1 + size));
        p += 1 + size;
        if (app === "NETSCAPE2.0" && bytes[p] === 3) loop = u16(p + 2);
        skipSub();
      } else {
        skipSub();
      }
    } else if (b === 0x2c) {
      const lp = bytes[p + 8]!;
      p += 9;
      if (lp & 0x80) p += 3 * (2 << (lp & 7));
      p++; // LZW minimum code size
      skipSub();
      frames++;
      delays.push(pendingDelay);
      pendingDelay = 0;
    } else {
      throw new Error(`unexpected block 0x${b.toString(16)} at ${p - 1}`);
    }
  }
  return { version, width, height, frames, delays, loop, globalColors, trailer: true };
}

export interface Mp4Info {
  brand: string;
  width: number;
  height: number;
  /** Movie duration in seconds (mvhd). */
  duration: number;
  /** Track media duration in seconds (mdhd). */
  mediaDuration: number;
  timescale: number;
  /** Video sample (frame) count (stsz). */
  frames: number;
  /** frames / mediaDuration */
  fps: number;
  /** Sample entry fourcc, e.g. avc1. */
  codec: string;
  /** Distinct sample deltas from stts, in timescale units. */
  sampleDeltas: number[];
}

/** Read the boxes an MP4 player needs for timing. */
export function parseMp4(bytes: Uint8Array): Mp4Info {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const td = new TextDecoder();
  const type = (o: number) => td.decode(bytes.subarray(o + 4, o + 8));
  const out: Partial<Mp4Info> = { sampleDeltas: [] };
  const containers = new Set(["moov", "trak", "mdia", "minf", "stbl"]);
  const walk = (start: number, end: number) => {
    let o = start;
    while (o + 8 <= end) {
      let size = dv.getUint32(o);
      const t = type(o);
      let header = 8;
      if (size === 1) {
        size = Number(dv.getBigUint64(o + 8));
        header = 16;
      } else if (size === 0) size = end - o;
      const body = o + header;
      if (t === "ftyp") out.brand = td.decode(bytes.subarray(body, body + 4));
      else if (containers.has(t)) walk(body, o + size);
      else if (t === "mvhd") {
        const v = bytes[body]!;
        const ts = v === 1 ? dv.getUint32(body + 20) : dv.getUint32(body + 12);
        const dur = v === 1 ? Number(dv.getBigUint64(body + 24)) : dv.getUint32(body + 16);
        out.duration = dur / ts;
      } else if (t === "tkhd") {
        const v = bytes[body]!;
        const wo = body + (v === 1 ? 88 : 76);
        out.width = dv.getUint32(wo) / 65536;
        out.height = dv.getUint32(wo + 4) / 65536;
      } else if (t === "mdhd") {
        const v = bytes[body]!;
        const ts = v === 1 ? dv.getUint32(body + 20) : dv.getUint32(body + 12);
        const dur = v === 1 ? Number(dv.getBigUint64(body + 24)) : dv.getUint32(body + 16);
        out.timescale = ts;
        out.mediaDuration = dur / ts;
      } else if (t === "stsd") {
        out.codec = type(body + 8);
      } else if (t === "stsz") {
        out.frames = dv.getUint32(body + 8);
      } else if (t === "stts") {
        const n = dv.getUint32(body + 4);
        const deltas = new Set<number>();
        for (let i = 0; i < n; i++) deltas.add(dv.getUint32(body + 8 + i * 8 + 4));
        out.sampleDeltas = [...deltas];
      }
      o += size;
    }
  };
  walk(0, bytes.length);
  const info = out as Mp4Info;
  info.fps = info.frames / info.mediaDuration;
  return info;
}

/** EBML (WebM) check: header magic plus the DocType string. */
export function webmDocType(bytes: Uint8Array): string | null {
  if (bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3) return null;
  const head = new TextDecoder().decode(bytes.subarray(0, 64));
  return head.includes("webm") ? "webm" : head.includes("matroska") ? "matroska" : "unknown";
}
