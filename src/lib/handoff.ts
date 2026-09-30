/**
 * Links into the editor. Content pages open the editor in a given state with
 * query parameters (read once by EditorApp.init, then cleared from the URL):
 *
 *   mode=code|post|appstore   start in that mode
 *   style=<style id>          apply a style
 *   size=<size preset id>     set the canvas size
 *   open=<id>[,<id>…]         open images a page stored in IndexedDB; several
 *                             start a batch (or fill an App Store set, or the
 *                             screens of `layout`)
 *   layout=<layout id>        start a multi-screen design with this layout
 *   tool=redact               arm the blur tool once an image is in
 *   sample=<id>, gallery=1    open a sample, or the style gallery
 *
 * File names for `open` travel in sessionStorage (HANDOFF_NAMES_KEY) so a
 * batch keeps its original names without putting them in the URL.
 */
import { getLayoutDef } from "@/engine/scene/layouts";
import type { LayoutId } from "@/engine/scene/types";

export const HANDOFF_NAMES_KEY = "shotcandy:handoff-names";

export type HandoffMode = "code" | "post" | "appstore";
export type HandoffTool = "redact";

export interface Handoff {
  mode: HandoffMode | null;
  style: string | null;
  size: string | null;
  open: string[];
  layout: Exclude<LayoutId, "single"> | null;
  tool: HandoffTool | null;
  sample: string | null;
  gallery: boolean;
}

/** Most images one link hands over (the batch cap on a computer). */
export const HANDOFF_MAX_OPEN = 100;

const ID = /^[\w-]{1,80}$/;

/** Read the editor's query parameters; unknown or malformed values are dropped. */
export function parseHandoff(search: string | URLSearchParams): Handoff {
  const p = typeof search === "string" ? new URLSearchParams(search) : search;
  const mode = p.get("mode");
  const layout = p.get("layout");
  const def = layout ? getLayoutDef(layout) : undefined;
  const open = (p.get("open") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => ID.test(s));
  return {
    mode: mode === "code" || mode === "post" || mode === "appstore" ? mode : null,
    style: p.get("style") || null,
    size: p.get("size") || null,
    open: [...new Set(open)].slice(0, HANDOFF_MAX_OPEN),
    layout: def && def.id !== "single" ? (def.id as Exclude<LayoutId, "single">) : null,
    tool: p.get("tool") === "redact" ? "redact" : null,
    sample: p.get("sample") || null,
    gallery: !!p.get("gallery"),
  };
}

/** Whether the URL carried anything the editor acts on (and should then clear). */
export function hasHandoff(h: Handoff): boolean {
  return !!(
    h.mode ||
    h.style ||
    h.size ||
    h.open.length ||
    h.layout ||
    h.tool ||
    h.sample ||
    h.gallery
  );
}

/** The editor URL for a handoff (only the parts that are set, in a stable order). */
export function editorUrl(h: Partial<Handoff>): string {
  const p = new URLSearchParams();
  if (h.mode) p.set("mode", h.mode);
  if (h.style) p.set("style", h.style);
  if (h.size) p.set("size", h.size);
  if (h.layout) p.set("layout", h.layout);
  if (h.tool) p.set("tool", h.tool);
  if (h.open?.length) p.set("open", h.open.join(","));
  if (h.sample) p.set("sample", h.sample);
  if (h.gallery) p.set("gallery", "1");
  const q = p.toString();
  return q ? `/?${q}` : "/";
}

/** The layout that suits `n` screenshots dropped on the mockup page. */
export function layoutForCount(n: number): Exclude<LayoutId, "single"> {
  if (n <= 2) return "side-by-side";
  if (n === 3) return "hero";
  return "grid";
}
