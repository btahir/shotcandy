/** Platform helpers for keycaps and shortcuts. */
export function isApple(): boolean {
  if (typeof navigator === "undefined") return true;
  const p =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    "";
  return /mac|iphone|ipad|ipod/i.test(p) || /Mac OS X/.test(navigator.userAgent);
}

/** "⌘" on Apple platforms, "Ctrl" elsewhere. */
export function modLabel(): string {
  return isApple() ? "⌘" : "Ctrl";
}

export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (t as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "range", "submit", "file", "color"].includes(type);
  }
  return false;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
