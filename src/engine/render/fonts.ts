/**
 * Font registry. Scenes reference fonts by id; the registry maps ids to CSS
 * font stacks and optional font files. Rendering text is only deterministic
 * across machines when the referenced font files are loaded, so the app (and
 * the export worker) must load `sources` before rendering text. The design
 * team will replace these stacks with the bundled brand fonts.
 */

export interface FontDefinition {
  id: string;
  label: string;
  /** CSS font-family stack used in ctx.font. */
  stack: string;
  /** Optional font files (same-origin URLs) to load with FontFace. */
  sources?: { url: string; weight?: string; style?: string }[];
}

const fonts = new Map<string, FontDefinition>();

export function registerFont(def: FontDefinition): void {
  fonts.set(def.id, def);
}

export function getFont(id: string): FontDefinition {
  return fonts.get(id) ?? fonts.get("sans")!;
}

export function listFonts(): FontDefinition[] {
  return [...fonts.values()];
}

export function fontStack(id: string): string {
  return getFont(id).stack;
}

/** Font used by frame chrome (window titles, address bars). */
export const UI_FONT_ID = "ui";

const SYSTEM_UI =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// Frame chrome uses the brand UI face (Figtree) when loaded, else the system UI font.
registerFont({ id: "ui", label: "UI", stack: `Figtree, ${SYSTEM_UI}` });
registerFont({ id: "sans", label: "Sans", stack: SYSTEM_UI });
registerFont({
  id: "serif",
  label: "Serif",
  stack: 'ui-serif, "New York", Georgia, "Times New Roman", serif',
});
registerFont({
  id: "mono",
  label: "Mono",
  stack: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
});
registerFont({
  id: "rounded",
  label: "Rounded",
  stack: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif',
});
