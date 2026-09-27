"use client";
/**
 * Theme preference: "system" (default, follows prefers-color-scheme), "light"
 * or "dark". A forced theme sets data-theme on <html>; the inline script in
 * the root layout applies it before first paint so there is no flash.
 */
import { useSyncExternalStore } from "react";

export type ThemePref = "system" | "light" | "dark";
const KEY = "shotcandy:theme";
const listeners = new Set<() => void>();


function read(): ThemePref {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function setTheme(pref: ThemePref): void {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* private mode: theme still applies for this page view */
  }
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
  for (const l of listeners) l();
}

export function resolvedTheme(): "light" | "dark" {
  const forced = document.documentElement.dataset.theme;
  if (forced === "light" || forced === "dark") return forced;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "system",
  );
}

/** Cycle system -> light -> dark -> system. */
export function nextTheme(p: ThemePref): ThemePref {
  return p === "system" ? "light" : p === "light" ? "dark" : "system";
}
