/**
 * Streaming ZIP for "Export all": files are added one at a time and stored,
 * not deflated (PNG, JPEG and WebP are already compressed), so only the
 * compressed images are ever held, never a second copy of the archive.
 * fflate (MIT). Import this module lazily.
 */
import { Zip, ZipPassThrough } from "fflate";

export class ZipStream {
  private readonly zip: Zip;
  private readonly chunks: Uint8Array[] = [];
  private readonly finished: Promise<void>;
  private failed: Error | null = null;
  private count = 0;

  /** `onChunk` receives the archive as it is written (e.g. a file stream); else it is collected. */
  constructor(private readonly onChunk?: (chunk: Uint8Array) => void) {
    let resolve!: () => void;
    let reject!: (e: Error) => void;
    this.finished = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.zip = new Zip((err, chunk, final) => {
      if (err) {
        this.failed = err;
        reject(err);
        return;
      }
      if (this.onChunk) this.onChunk(chunk);
      else this.chunks.push(chunk);
      if (final) resolve();
    });
  }

  get size(): number {
    return this.count;
  }

  add(name: string, data: Uint8Array, mtime?: Date): void {
    if (this.failed) throw this.failed;
    const file = new ZipPassThrough(name);
    if (mtime) file.mtime = mtime;
    this.zip.add(file);
    file.push(data, true);
    this.count++;
  }

  /** Close the archive; resolves with it as a Blob (empty when streamed elsewhere). */
  async finish(): Promise<Blob> {
    this.zip.end();
    await this.finished;
    return new Blob(this.chunks as Uint8Array<ArrayBuffer>[], { type: "application/zip" });
  }

  abort(): void {
    this.zip.terminate();
    this.chunks.length = 0;
  }
}
