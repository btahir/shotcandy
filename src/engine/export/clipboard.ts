/**
 * Copy images to the system clipboard.
 *
 * Safari requires the ClipboardItem to be constructed synchronously inside the
 * user gesture, with a *promise* of the blob; Chrome and Firefox accept either.
 * Passing the render promise straight in keeps all three working. Only PNG is
 * universally supported on the clipboard.
 */

export function canCopyImages(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.write === "function" &&
    typeof ClipboardItem !== "undefined"
  );
}

export class ClipboardUnavailableError extends Error {
  constructor(message = "Copying images is not supported in this browser") {
    super(message);
    this.name = "ClipboardUnavailableError";
  }
}

/** Call synchronously from the click handler; `png` may be a pending promise. */
export async function copyImageToClipboard(png: Blob | Promise<Blob>): Promise<void> {
  if (!canCopyImages()) throw new ClipboardUnavailableError();
  const item = new ClipboardItem({ "image/png": Promise.resolve(png) });
  await navigator.clipboard.write([item]);
}
