"use client";
/**
 * Modal sheet over a scrim.
 * - While open, everything else on the page is `inert`, so Tab can never reach
 *   the editor behind it (and screen readers see only the dialog).
 * - Esc closes. The closing sheet turns `inert` at once, so nothing inside the
 *   fading "ghost" can be focused or clicked, and focus goes straight back to
 *   the control that opened it (or `fallbackFocus` when that was the page).
 * - Unmounts on `animationend`, with a timeout fallback.
 */
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), textarea, select, [tabindex]:not([tabindex="-1"])';

/** Make every body child except `keep` inert; returns an undo function. */
function inertOthers(keep: HTMLElement): () => void {
  const changed: HTMLElement[] = [];
  for (const el of Array.from(document.body.children) as HTMLElement[]) {
    if (el === keep || el.contains(keep) || el.hasAttribute("inert")) continue;
    // Live regions stay audible (announcements made from inside the dialog).
    if (el.hasAttribute("data-modal-keep")) continue;
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
    el.setAttribute("inert", "");
    changed.push(el);
  }
  return () => changed.forEach((el) => el.removeAttribute("inert"));
}

export function Modal({
  open,
  onClose,
  labelledBy,
  className,
  children,
  fallbackFocus = "[data-testid=stage]",
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  className?: string;
  children: ReactNode;
  /** Where focus goes on close when the opener was the page itself (e.g. a shortcut). */
  fallbackFocus?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    // animationend unmounts; this is the fallback (reduced motion, hidden tabs).
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, 250);
    return () => clearTimeout(t);
  }, [open, mounted]);

  // Inert the rest of the page while open (and focus into the sheet, once).
  const autofocused = useRef(false);
  useLayoutEffect(() => {
    if (!open || !mounted) return;
    const root = rootRef.current;
    if (!root) return;
    const release = inertOthers(root);
    let raf = 0;
    if (!autofocused.current) {
      autofocused.current = true;
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        const target =
          el?.querySelector<HTMLElement>("[data-autofocus]") ??
          el?.querySelector<HTMLElement>(FOCUSABLE);
        target?.focus({ preventScroll: true });
        target?.scrollIntoView?.({ block: "nearest" });
      });
    }
    return () => {
      cancelAnimationFrame(raf);
      release();
    };
  }, [open, mounted]);

  // Remember who opened it; give focus back the moment it closes.
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (open && !wasOpen.current) {
      wasOpen.current = true;
      const a = document.activeElement as HTMLElement | null;
      opener.current = a && a !== document.body ? a : null;
    } else if (!open && wasOpen.current) {
      wasOpen.current = false;
      autofocused.current = false;
      const prev = opener.current;
      opener.current = null;
      const back =
        prev && prev.isConnected && !rootRef.current?.contains(prev)
          ? prev
          : document.querySelector<HTMLElement>(fallbackFocus);
      back?.focus?.({ preventScroll: true });
    }
  }, [open, fallbackFocus]);

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeRef.current();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const f = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (x) => x.offsetParent !== null,
    );
    if (!f.length) return;
    // Move focus ourselves so the trap holds in every engine (WebKit skips
    // buttons on Tab by default, which would let focus fall out to the page).
    e.preventDefault();
    const i = f.indexOf(document.activeElement as HTMLElement);
    const dir = e.shiftKey ? -1 : 1;
    const next = i < 0 ? (dir > 0 ? f[0] : f[f.length - 1]) : f[(i + dir + f.length) % f.length];
    next?.focus();
  };

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div ref={rootRef} className="modal-root" inert={closing || undefined}>
      <div className={`scrim${closing ? " closing" : ""}`} onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-hidden={closing || undefined}
        className={`sheet${closing ? " closing" : ""}${className ? ` ${className}` : ""}`}
        onKeyDown={onKey}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) {
            setMounted(false);
            setClosing(false);
          }
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
