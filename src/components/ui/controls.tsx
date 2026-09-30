"use client";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * Focuses an element on the next frame (once React has rendered it), unless
 * focus has moved on since: a late focus() must never pull the keyboard back
 * from wherever the person went in the meantime. A newer call replaces one
 * still waiting (keys pressed faster than frames), so the last move wins.
 */
let waiting = 0;
export function focusNextFrame(target: () => HTMLElement | null | undefined): number {
  cancelAnimationFrame(waiting);
  const from = document.activeElement;
  waiting = requestAnimationFrame(() => {
    waiting = 0;
    const now = document.activeElement;
    if (now && now !== from && now !== document.body) return;
    target()?.focus();
  });
  return waiting;
}

// ---------------------------------------------------------------------------
// Segmented control (radiogroup or tablist) with a sliding pill
// ---------------------------------------------------------------------------

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  role = "radiogroup",
  className,
  style,
  size,
}: {
  options: SegOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
  role?: "radiogroup" | "tablist";
  className?: string;
  style?: CSSProperties;
  size?: "lg";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const btn = root.querySelector<HTMLButtonElement>("button.on");
      if (!btn) return setPill(null);
      setPill({ x: btn.offsetLeft, w: btn.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [value, options.length]);

  useEffect(() => {
    const t = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation();
    const enabled = options.filter((o) => !o.disabled);
    const i = enabled.findIndex((o) => o.value === value);
    const next = enabled[(i + dir + enabled.length) % enabled.length];
    if (next) {
      onChange(next.value);
      focusNextFrame(() =>
        ref.current?.querySelector<HTMLButtonElement>(`button[data-v="${next.value}"]`),
      );
    }
  };

  const itemRole = role === "tablist" ? "tab" : "radio";
  return (
    <div
      ref={ref}
      className={`seg${size === "lg" ? " lg" : ""}${className ? ` ${className}` : ""}`}
      role={role}
      aria-label={label}
      onKeyDown={onKey}
      style={style}
    >
      {pill && (
        <span
          className="pill"
          aria-hidden="true"
          style={{
            width: pill.w,
            transform: `translateX(${pill.x}px)`,
            transition: animate ? undefined : "none",
          }}
        />
      )}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            data-v={o.value}
            role={itemRole}
            className={on ? "on" : undefined}
            aria-checked={itemRole === "radio" ? on : undefined}
            aria-selected={itemRole === "tab" ? on : undefined}
            tabIndex={on || (value === null && o === options[0]) ? 0 : -1}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

export function Switch({
  checked,
  onChange,
  label,
  id,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

// ---------------------------------------------------------------------------
// Popover: fixed-position, anchored, portal; Esc and outside click close it.
// ---------------------------------------------------------------------------

export function Popover({
  open,
  anchor,
  onClose,
  children,
  className,
  align = "center",
  label,
  role = "dialog",
  offset = 10,
  width,
  arrow = true,
  initialFocus = true,
  side = "below",
}: {
  open: boolean;
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  align?: "center" | "end" | "start";
  label: string;
  role?: "dialog" | "menu";
  offset?: number;
  width?: number;
  arrow?: boolean;
  initialFocus?: boolean;
  /** Where it opens when it fits there ("above": menus of controls at the bottom). */
  side?: "below" | "above";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  const [pos, setPos] = useState<{ left: number; top: number; arrowX: number } | null>(null);
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const t = setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, 120);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  useLayoutEffect(() => {
    if (!mounted) return;
    const place = () => {
      const el = ref.current;
      const anchorEl = anchor.current;
      if (!el || !anchorEl) return;
      const a = anchorEl.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left =
        align === "center" ? a.left + a.width / 2 - w / 2 : align === "end" ? a.right - w : a.left;
      left = Math.max(12, Math.min(vw - w - 12, left));
      let top = a.bottom + offset;
      if (side === "above" && a.top - offset - h > 12) top = a.top - offset - h;
      else if (top + h > vh - 12 && a.top - offset - h > 12) top = a.top - offset - h;
      const arrowX = Math.max(18, Math.min(w - 18, a.left + a.width / 2 - left));
      setPos({ left, top, arrowX });
    };
    place();
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [mounted, anchor, align, offset, side]);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // Focus goes in on the first frame, unless the popover closed before it came.
    const first = !initialFocus
      ? 0
      : requestAnimationFrame(() => {
          const el = ref.current;
          // Already inside (a key or a click got there first): leave focus where it went.
          if (!el || el.contains(document.activeElement)) return;
          const target =
            el.querySelector<HTMLElement>("[data-autofocus]") ??
            el.querySelector<HTMLElement>(
              '.current, [aria-checked="true"], button:not(:disabled), input, [tabindex="0"]',
            );
          target?.focus();
        });
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      // Clicks inside a nested popover (portal) must not close its parent.
      if ((t as Element).closest?.(".popover")) return;
      closeRef.current();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        anchor.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    const el = ref.current;
    return () => {
      cancelAnimationFrame(first);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      if (prev && document.activeElement && el?.contains(document.activeElement)) prev.focus?.();
    };
  }, [open, anchor, initialFocus]);

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      role={role}
      aria-label={label}
      className={`popover fixed${arrow ? "" : " no-arrow"}${closing ? " closing" : ""}${className ? ` ${className}` : ""}`}
      style={
        {
          left: pos?.left ?? -9999,
          top: pos?.top ?? -9999,
          width,
          "--arrow-x": pos ? `${pos.arrowX}px` : "50%",
          visibility: pos ? "visible" : "hidden",
        } as CSSProperties
      }
    >
      {children}
    </div>,
    document.body,
  );
}

/** Roving focus for menus: ↑/↓ move between items. */
export function menuKeys(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
  const items = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>(".menu-item:not(:disabled)"),
  );
  if (!items.length) return;
  e.preventDefault();
  const i = items.indexOf(document.activeElement as HTMLElement);
  let n = 0;
  if (e.key === "ArrowDown") n = (i + 1) % items.length;
  else if (e.key === "ArrowUp") n = (i - 1 + items.length) % items.length;
  else if (e.key === "End") n = items.length - 1;
  items[n]!.focus();
}
