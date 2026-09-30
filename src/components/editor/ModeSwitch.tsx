"use client";
/**
 * The mode switcher: Screenshot · Code · Post · App Store, as a candy
 * segmented pill in the header. Each mode keeps its own design.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../icons";
import { Popover, focusNextFrame, menuKeys } from "../ui/controls";
import { useApp, useUi } from "./context";
import { MODES } from "./modes";

export function ModeSwitch({ compact = false }: { compact?: boolean }) {
  const app = useApp();
  const mode = useUi((s) => s.mode);
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const b = root.querySelector<HTMLElement>("button.on");
      if (b) setPill({ x: b.offsetLeft, w: b.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [mode]);
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = MODES.findIndex((m) => m.id === mode);
    const next = MODES[(i + d + MODES.length) % MODES.length]!;
    const root = e.currentTarget;
    app.setMode(next.id);
    focusNextFrame(() => root.querySelector<HTMLButtonElement>(`[data-mode="${next.id}"]`));
  };
  return (
    <div
      ref={ref}
      className={`mode-switch${compact ? " compact" : ""}`}
      role="tablist"
      aria-label="What are you making?"
      data-testid="mode-switch"
      onKeyDown={onKey}
    >
      {pill && (
        <span
          className="ms-pill"
          aria-hidden="true"
          style={{ width: pill.w, transform: `translateX(${pill.x}px)` }}
        />
      )}
      {MODES.map((m) => {
        const on = m.id === mode;
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            data-mode={m.id}
            aria-label={m.label}
            className={`has-tip${on ? " on" : ""}`}
            onClick={() => app.setMode(m.id)}
          >
            <Icon name={m.icon} size="sm" />
            <span className="lbl">{compact ? m.short : m.label}</span>
            {!compact && (
              <span className="tip mode-tip" aria-hidden="true">
                <b>{m.label}</b> {m.blurb}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Narrow layout: the current mode as a small chip that opens a menu. */
export function MobileModeButton() {
  const app = useApp();
  const mode = useUi((s) => s.mode);
  const open = useUi((s) => s.popover === "mode");
  const ref = useRef<HTMLButtonElement>(null);
  const cur = MODES.find((m) => m.id === mode)!;
  const close = () => app.ui.set({ popover: null });
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`chip mode-chip${open ? " on" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Mode: ${cur.label}. Change mode`}
        data-testid="mode-chip"
        onClick={() => app.ui.set({ popover: open ? null : "mode" })}
      >
        <Icon name={cur.icon} size="sm" />
        <Icon name="chevronDown" size="xs" />
      </button>
      <Popover
        open={open}
        anchor={ref}
        onClose={close}
        label="Mode"
        role="menu"
        className="menu"
        width={260}
      >
        <div onKeyDown={menuKeys}>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="menuitemradio"
              aria-checked={m.id === mode}
              className={`menu-item mode-item${m.id === mode ? " current" : ""}`}
              onClick={() => {
                close();
                app.setMode(m.id);
              }}
            >
              <Icon name={m.icon} size="sm" />
              <span>
                <b>{m.label}</b>
                <small>{m.blurb}</small>
              </span>
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}
