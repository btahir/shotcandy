/**
 * Export filename patterns.
 *
 * Tokens: {name} {preset} {w} {h} {scale} {format} {date} {time} {n}
 * Example: "{name}-{preset}-{w}x{h}@{scale}x" -> "shotcandy-og-2400x1260@2x.png"
 */
import { type ExportFormat, FILE_EXTENSIONS } from "./formats";

export const DEFAULT_FILENAME_PATTERN = "{name}-{w}x{h}@{scale}x";

export interface FilenameVars {
  name: string;
  preset?: string;
  width: number;
  height: number;
  scale: number;
  format: ExportFormat;
  /** Injected so results are testable/deterministic. */
  now: Date;
  /** Sequence number for batch exports. */
  n?: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatFilename(pattern: string, v: FilenameVars): string {
  const date = `${v.now.getFullYear()}-${pad(v.now.getMonth() + 1)}-${pad(v.now.getDate())}`;
  const time = `${pad(v.now.getHours())}${pad(v.now.getMinutes())}${pad(v.now.getSeconds())}`;
  const tokens: Record<string, string> = {
    name: v.name || "shotcandy",
    preset: v.preset ?? "custom",
    w: String(v.width),
    h: String(v.height),
    scale: String(v.scale),
    format: v.format,
    date,
    time,
    n: String(v.n ?? 1),
  };
  const raw = (pattern || DEFAULT_FILENAME_PATTERN).replace(/\{(\w+)\}/g, (m, key: string) =>
    key in tokens ? tokens[key]! : m,
  );
  const base = sanitizeFilename(raw) || "shotcandy";
  return `${base}.${FILE_EXTENSIONS[v.format]}`;
}

/** Remove characters that are invalid on Windows/macOS/Linux; trim and cap length. */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-{2,}/g, "-")
    .replace(/^[\s.-]+|[\s.-]+$/g, "")
    .slice(0, 150);
}
