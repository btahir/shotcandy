"use client";
/** Small shared pieces of the batch UI (hooks, sizes, labels). */
import { useSyncExternalStore } from "react";
import { type Batch, isBatch } from "@/engine/batch/batch";
import { type OverrideGroup, GROUP_LABELS } from "@/engine/batch/style";
import { useStore } from "@/lib/store";
import type { BatchUi } from "./batch";
import { useApp, useScene, useUi } from "./context";

/** Width of the collapsed images rail. */
export const RAIL_COLLAPSED = 52;

/** The open batch (screenshot mode), or null. */
export function useBatch(): Batch | null {
  const doc = useScene((s) => s.doc);
  const mode = useUi((s) => s.mode);
  return mode === "screenshot" && isBatch(doc) ? doc : null;
}

export function useBatchUi<T>(selector: (s: BatchUi) => T): T {
  return useStore(useApp().batch.ui, selector);
}

const COMPACT = "(max-width: 1199px)";

// Stable functions, so the media query isn't re-subscribed on every render.
const subscribeCompact = (cb: () => void) => {
  const m = window.matchMedia(COMPACT);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const isCompact = () => window.matchMedia(COMPACT).matches;
const notCompact = () => false;

/** The rail starts collapsed on smaller desktop windows (the stage needs the room). */
export function useRailCollapsed(): boolean {
  const pref = useBatchUi((s) => s.railCollapsed);
  const compact = useSyncExternalStore(subscribeCompact, isCompact, notCompact);
  return pref ?? compact;
}

/** "Own background, layout" for a thumbnail's tooltip. */
export function groupsText(groups: readonly OverrideGroup[]): string {
  if (!groups.length) return "";
  const names = groups.map((g) => GROUP_LABELS[g].toLowerCase());
  return `Own ${names.join(", ")}`;
}

/** "login.png" -> "login.png"; long names keep their distinguishing end. */
export function middleTruncate(name: string, max = 28): string {
  if (name.length <= max) return name;
  const keep = max - 1;
  const head = Math.ceil(keep * 0.55);
  return `${name.slice(0, head)}…${name.slice(name.length - (keep - head))}`;
}

export const isMac = () =>
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
