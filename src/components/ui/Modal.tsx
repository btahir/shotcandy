"use client";
/** Modal sheet over a scrim: focus trap, Esc to close, focus restore, exit animation. */
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function Modal({
  open,
  onClose,
  labelledBy,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
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
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, 200);
    return () => clearTimeout(t);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      const el = ref.current;
      const target =
        el?.querySelector<HTMLElement>("[data-autofocus]") ??
        el?.querySelector<HTMLElement>("input, button, [tabindex='0']");
      target?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      prev?.focus?.({ preventScroll: true });
    };
  }, [open]);

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeRef.current();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const f = Array.from(
      ref.current.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input, textarea, select, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0]!;
    const last = f[f.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className={`scrim${closing ? " closing" : ""}`} onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`sheet${closing ? " closing" : ""}${className ? ` ${className}` : ""}`}
        onKeyDown={onKey}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
