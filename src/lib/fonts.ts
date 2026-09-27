/**
 * Brand fonts for canvas rendering. The same self-hosted files back the CSS
 * @font-face rules (src/app/fonts.css), the preview canvas and the export and
 * thumbnail workers, so text renders identically everywhere.
 *
 * Annotation font ids (render/fonts registry):
 *   display -> Bricolage Grotesque, sans -> Figtree, mono -> Geist Mono.
 * Frame chrome uses "ui" (Figtree).
 */
import { registerFont } from "@/engine";

const FIGTREE = [
  { url: "/fonts/figtree-latin-wght-normal.woff2", weight: "300 900" },
  { url: "/fonts/figtree-latin-ext-wght-normal.woff2", weight: "300 900" },
];
const BRICOLAGE = [
  { url: "/fonts/bricolage-grotesque-latin-opsz-normal.woff2", weight: "200 800" },
  { url: "/fonts/bricolage-grotesque-latin-ext-opsz-normal.woff2", weight: "200 800" },
];
const GEIST_MONO = [
  { url: "/fonts/geist-mono-latin-400-normal.woff2", weight: "400" },
  { url: "/fonts/geist-mono-latin-500-normal.woff2", weight: "500" },
];

const SYSTEM = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

let registered = false;

/** Register the brand faces with the engine's font registry (idempotent). */
export function registerBrandFonts(): void {
  if (registered) return;
  registered = true;
  registerFont({ id: "ui", label: "UI", stack: `Figtree, ${SYSTEM}`, sources: FIGTREE });
  registerFont({ id: "sans", label: "Sans", stack: `Figtree, ${SYSTEM}`, sources: FIGTREE });
  registerFont({
    id: "display",
    label: "Display",
    stack: `"Bricolage Grotesque", Figtree, ${SYSTEM}`,
    sources: BRICOLAGE,
  });
  registerFont({
    id: "mono",
    label: "Mono",
    stack: '"Geist Mono", ui-monospace, Menlo, monospace',
    sources: GEIST_MONO,
  });
}

export const ANNOTATION_FONTS = [
  { id: "sans", label: "Sans", weight: 700 },
  { id: "display", label: "Display", weight: 800 },
  { id: "mono", label: "Mono", weight: 500 },
] as const;

let loading: Promise<void> | null = null;

/**
 * Make sure every canvas face is loaded before text is drawn (canvas text
 * does not wait for fonts the way DOM text does). Resolves even on failure,
 * so a missing font never blocks editing.
 */
export function loadCanvasFonts(): Promise<void> {
  if (loading) return loading;
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  const faces = [
    "400 16px Figtree",
    "600 16px Figtree",
    "700 16px Figtree",
    '800 16px "Bricolage Grotesque"',
    '700 16px "Bricolage Grotesque"',
    '500 16px "Geist Mono"',
    '400 16px "Geist Mono"',
  ];
  loading = Promise.all(faces.map((f) => document.fonts.load(f).catch(() => [])))
    .then(() => undefined)
    .catch(() => undefined);
  return loading;
}
