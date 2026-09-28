/**
 * Getting images in: paste, drop, file picker and the async clipboard API.
 * Formats are sniffed from magic bytes (clipboard MIME types are unreliable).
 * PNG, JPEG and WebP are accepted; HEIC/HEIF is rejected with a helpful error.
 * Screen recordings (MP4, MOV, WebM) come in the same ways and are opened by
 * video/import.ts.
 */

export type ImageKind = "png" | "jpeg" | "webp" | "gif" | "heic" | "avif" | "bmp" | "unknown";

export const ACCEPTED_KINDS: readonly ImageKind[] = ["png", "jpeg", "webp"];
export const ACCEPTED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
/** Screen recordings: MP4, QuickTime MOV and WebM. */
export const ACCEPTED_VIDEO_MIME = ["video/mp4", "video/quicktime", "video/webm"] as const;
/** For `<input type="file" accept>`: screenshots and screen recordings. */
export const ACCEPT_ATTRIBUTE = [
  ...ACCEPTED_MIME,
  ...ACCEPTED_VIDEO_MIME,
  ".mov",
  ".mp4",
  ".webm",
].join(",");
/** Screenshots only (App Store slides). */
export const ACCEPT_IMAGES = ACCEPTED_MIME.join(",");

export type ImportErrorCode =
  | "unsupported-format"
  | "heic"
  | "too-large"
  | "too-long"
  | "decode-failed"
  | "video-codec"
  | "empty";

export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

export function sniffImageKind(bytes: Uint8Array): ImageKind {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return "webp";
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38)
    return "gif";
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return "bmp";
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!);
    if (brand === "avif" || brand === "avis") return "avif";
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand))
      return "heic";
  }
  return "unknown";
}

export type VideoKind = "mp4" | "mov" | "webm";

/** ISO-BMFF top-level boxes a QuickTime or MP4 file can open with. */
const BMFF_BOXES = ["ftyp", "moov", "mdat", "wide", "free", "skip"];

/** Container of a screen recording, from its first bytes, or null. */
export function sniffVideoKind(bytes: Uint8Array): VideoKind | null {
  const b = bytes;
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3)
    return "webm";
  if (b.length < 12) return null;
  const box = String.fromCharCode(b[4]!, b[5]!, b[6]!, b[7]!);
  if (!BMFF_BOXES.includes(box)) return null;
  if (box !== "ftyp") return "mov";
  const kind = sniffImageKind(b);
  if (kind === "heic" || kind === "avif") return null;
  const brand = String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!);
  return brand === "qt  " ? "mov" : "mp4";
}

export const MIME_FOR_VIDEO: Record<VideoKind, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

/** Whether a file looks like a screen recording (by MIME type or extension). */
export function isVideoFile(f: { type: string; name?: string }): boolean {
  return f.type.startsWith("video/") || /\.(mp4|m4v|mov|webm)$/i.test(f.name ?? "");
}

export const MIME_FOR_KIND: Partial<Record<ImageKind, string>> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** Validate bytes and return the canonical MIME type, or throw an ImportError. */
export function validateImageBytes(bytes: Uint8Array): string {
  if (bytes.length === 0) throw new ImportError("empty", "The file is empty.");
  const kind = sniffImageKind(bytes);
  if (kind === "heic") {
    throw new ImportError(
      "heic",
      "HEIC photos are not supported yet. Export the image as PNG or JPEG (on iPhone: Settings > Camera > Formats > Most Compatible) and try again.",
    );
  }
  const mime = MIME_FOR_KIND[kind];
  if (!mime) {
    throw new ImportError(
      "unsupported-format",
      "Unsupported format. Use a PNG, JPEG or WebP screenshot, or an MP4, MOV or WebM recording.",
    );
  }
  return mime;
}

function firstImageFile(files: ArrayLike<File> | null | undefined): File | null {
  if (!files) return null;
  for (let i = 0; i < files.length; i++) {
    const f = files[i]!;
    if (f.type.startsWith("image/") || f.type === "" || isVideoFile(f)) return f;
  }
  return null;
}

/** Image file from a paste event (Cmd/Ctrl+V), or null if the paste has no image. */
export function imageFromClipboardEvent(e: Pick<ClipboardEvent, "clipboardData">): File | null {
  const dt = e.clipboardData;
  if (!dt) return null;
  return imageFromDataTransfer(dt);
}

/** Image file from a drop event's DataTransfer. */
export function imageFromDataTransfer(dt: DataTransfer): File | null {
  const fromFiles = firstImageFile(dt.files);
  if (fromFiles) return fromFiles;
  for (let i = 0; i < (dt.items?.length ?? 0); i++) {
    const item = dt.items[i]!;
    if (
      item.kind === "file" &&
      (item.type.startsWith("image/") || item.type.startsWith("video/"))
    ) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

/** Whether a drag carries files (for showing the drop affordance on dragenter). */
export function dragHasFiles(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types ?? []).includes("Files");
}

/**
 * Read an image through the async Clipboard API (a "Paste" button). Browsers
 * prompt or require a user gesture; returns null when there is no image.
 */
export async function readClipboardImage(): Promise<Blob | null> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.read) return null;
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type =
      item.types.find((t) => (ACCEPTED_MIME as readonly string[]).includes(t)) ??
      item.types.find((t) => t.startsWith("image/"));
    if (type) return item.getType(type);
  }
  return null;
}
