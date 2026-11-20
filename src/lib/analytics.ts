/**
 * Umami custom events. The script only loads on the live domain
 * (see SiteAnalytics), so on localhost and previews this is a no-op.
 * Events carry formats and counts only: never file names or image data.
 */
type Umami = { track: (name: string, data?: Record<string, string | number>) => void };

export function track(name: string, data?: Record<string, string | number>): void {
  try {
    (window as unknown as { umami?: Umami }).umami?.track(name, data);
  } catch {
    // Analytics must never break the editor.
  }
}

type Emitter = { on(evt: string, fn: (arg?: unknown) => void): () => void };

const formatOf = (r: unknown): string => {
  const mime =
    (r as { mime?: string; blob?: Blob } | undefined)?.mime ??
    (r as { blob?: Blob } | undefined)?.blob?.type ??
    "";
  return mime.split("/")[1]?.split(";")[0] || "unknown";
};

/** Count every finished export: images, copies, clips, batches and App Store sets. */
export function trackExports(app: Emitter): () => void {
  const offs = [
    app.on("downloaded", (r) => track("export-image", { format: formatOf(r) })),
    app.on("copied", () => track("copy-image")),
    app.on("motion-exported", (r) => track("export-video", { format: formatOf(r) })),
    app.on("batch-exported", (r) => {
      const { names = [], target = "zip" } = (r ?? {}) as { names?: string[]; target?: string };
      track("export-batch", { count: names.length, target });
    }),
    app.on("set-exported", (r) =>
      track("export-appstore", { count: Array.isArray(r) ? r.length : 0 }),
    ),
  ];
  return () => offs.forEach((off) => off());
}
