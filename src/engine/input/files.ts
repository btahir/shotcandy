/**
 * Many files at once: drops (files and folders), pastes and pickers.
 *
 * Folder drops only work through the entries API, and only while the drop
 * event is being dispatched, so `captureDrop` must run synchronously inside
 * the handler; `readCapture` then walks the folders. `readEntries` returns at
 * most 100 entries per call in Chromium, so it is called until it returns
 * nothing (the classic "only 100 images imported" bug).
 */
import { isVideoFile } from "./input";

export interface PickedFile {
  file: File;
  /** Path inside a dropped or picked folder ("shots/login.png"), else the name. */
  path: string;
}

/** Hidden and system files a folder may hold. */
function junk(name: string): boolean {
  return (
    name.startsWith(".") || name === "Thumbs.db" || name === "desktop.ini" || name === "__MACOSX"
  );
}

const IMAGE_EXT = /\.(png|jpe?g|webp|heic|heif|avif|gif|bmp|tiff?)$/i;

export type FileKind = "image" | "video" | "other";

/** What a file looks like before its bytes are read (bytes decide in the end). */
export function fileKind(f: { type: string; name?: string }): FileKind {
  if (isVideoFile(f)) return "video";
  if (f.type.startsWith("image/") || IMAGE_EXT.test(f.name ?? "")) return "image";
  // Some drag sources give no type: let the bytes decide.
  if (!f.type && !/\.[a-z0-9]{1,5}$/i.test(f.name ?? "")) return "image";
  return "other";
}

/** Every file (not just the first) of a paste or a drop without folders. */
export function filesFromDataTransfer(dt: DataTransfer): File[] {
  const out: File[] = [];
  for (let i = 0; i < (dt.files?.length ?? 0); i++) out.push(dt.files[i]!);
  if (out.length) return out;
  for (let i = 0; i < (dt.items?.length ?? 0); i++) {
    const item = dt.items[i]!;
    if (item.kind !== "file") continue;
    const f = item.getAsFile();
    if (f) out.push(f);
  }
  return out;
}

// Minimal shapes of the (webkit-prefixed) entries API, so tests can fake them.
export interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
}
export interface FileEntryLike extends EntryLike {
  file(ok: (f: File) => void, fail?: (e: unknown) => void): void;
}
export interface DirEntryLike extends EntryLike {
  createReader(): { readEntries(ok: (e: EntryLike[]) => void, fail?: (e: unknown) => void): void };
}

export interface DropCapture {
  files: File[];
  entries: EntryLike[];
  /** Whether the drop holds at least one folder. */
  hasFolder: boolean;
}

/** Take everything out of a drop. Call synchronously inside the drop handler. */
export function captureDrop(dt: DataTransfer): DropCapture {
  const entries: EntryLike[] = [];
  let hasFolder = false;
  for (let i = 0; i < (dt.items?.length ?? 0); i++) {
    const item = dt.items[i]!;
    if (item.kind !== "file") continue;
    const e = (
      item as DataTransferItem & { webkitGetAsEntry?: () => EntryLike | null }
    ).webkitGetAsEntry?.();
    if (e) {
      entries.push(e);
      if (e.isDirectory) hasFolder = true;
    }
  }
  return { files: filesFromDataTransfer(dt), entries, hasFolder };
}

function readAll(dir: DirEntryLike): Promise<EntryLike[]> {
  const reader = dir.createReader();
  const all: EntryLike[] = [];
  return new Promise((resolve, reject) => {
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) return resolve(all);
        all.push(...batch);
        next();
      }, reject);
    next();
  });
}

const fileOf = (e: FileEntryLike) =>
  new Promise<File>((resolve, reject) => e.file(resolve, reject));

/** Walk entries (folders up to `depth` levels deep), skipping hidden files. */
export async function readEntries(
  entries: readonly EntryLike[],
  opts: { depth?: number; limit?: number } = {},
): Promise<PickedFile[]> {
  const depth = opts.depth ?? 4;
  const limit = opts.limit ?? 5000;
  const out: PickedFile[] = [];
  const visit = async (e: EntryLike, prefix: string, level: number): Promise<void> => {
    if (out.length >= limit || junk(e.name)) return;
    const path = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isFile) {
      try {
        out.push({ file: await fileOf(e as FileEntryLike), path });
      } catch {
        /* unreadable: skip */
      }
    } else if (e.isDirectory && level < depth) {
      let children: EntryLike[] = [];
      try {
        children = await readAll(e as DirEntryLike);
      } catch {
        return;
      }
      for (const c of children) await visit(c, path, level + 1);
    }
  };
  for (const e of entries) await visit(e, "", 0);
  return out;
}

/** The files of a captured drop, folders walked. */
export async function readCapture(c: DropCapture): Promise<PickedFile[]> {
  if (!c.hasFolder) return c.files.map((file) => ({ file, path: file.name }));
  return readEntries(c.entries);
}

// Minimal File System Access shapes (Chromium's showDirectoryPicker).
interface HandleLike {
  kind: "file" | "directory";
  name: string;
}
interface FileHandleLike extends HandleLike {
  getFile(): Promise<File>;
}
interface DirHandleLike extends HandleLike {
  values(): AsyncIterable<HandleLike>;
}

/** Files of a picked directory handle (folders up to `depth` levels deep). */
export async function readDirectoryHandle(
  dir: DirHandleLike,
  opts: { depth?: number; limit?: number } = {},
): Promise<PickedFile[]> {
  const depth = opts.depth ?? 4;
  const limit = opts.limit ?? 5000;
  const out: PickedFile[] = [];
  const visit = async (h: DirHandleLike, prefix: string, level: number): Promise<void> => {
    for await (const c of h.values()) {
      if (out.length >= limit) return;
      if (junk(c.name)) continue;
      const path = prefix ? `${prefix}/${c.name}` : c.name;
      if (c.kind === "file") {
        try {
          out.push({ file: await (c as FileHandleLike).getFile(), path });
        } catch {
          /* unreadable: skip */
        }
      } else if (level < depth) await visit(c as DirHandleLike, path, level + 1);
    }
  };
  await visit(dir, dir.name, 0);
  return out;
}

/** Files from an `<input webkitdirectory>` (paths from webkitRelativePath). */
export function filesFromDirectoryInput(list: ArrayLike<File>): PickedFile[] {
  const out: PickedFile[] = [];
  for (let i = 0; i < list.length; i++) {
    const file = list[i]!;
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    if (path.split("/").some(junk)) continue;
    out.push({ file, path });
  }
  return out;
}
