"use client";
/** Ink-pill toasts: the wrapper "wrap" toast, info, error and undo variants. */
import { useEffect, useRef, useState } from "react";
import { Icon, WrapperEnd } from "../icons";
import type { Toast } from "./app";
import { useApp, useUi } from "./context";

function ToastItem({ t }: { t: Toast }) {
  const app = useApp();
  const [leaving, setLeaving] = useState(false);
  const hover = useRef(false);
  const remaining = useRef(t.duration ?? 2600);
  const started = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const start = () => {
      started.current = Date.now();
      timer = setTimeout(() => {
        if (hover.current) return;
        setLeaving(true);
        setTimeout(() => app.dismissToast(t.id), 160);
      }, remaining.current);
    };
    start();
    const el = ref.current;
    const pause = () => {
      hover.current = true;
      clearTimeout(timer);
      remaining.current = Math.max(800, remaining.current - (Date.now() - started.current));
    };
    const resume = () => {
      hover.current = false;
      start();
    };
    el?.addEventListener("pointerenter", pause);
    el?.addEventListener("pointerleave", resume);
    el?.addEventListener("focusin", pause);
    el?.addEventListener("focusout", resume);
    return () => {
      clearTimeout(timer);
      el?.removeEventListener("pointerenter", pause);
      el?.removeEventListener("pointerleave", resume);
      el?.removeEventListener("focusin", pause);
      el?.removeEventListener("focusout", resume);
    };
  }, [app, t.id]);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className={`toast${t.kind === "error" ? " error" : ""}${t.kind !== "wrap" && t.kind !== "error" ? " plain" : ""}${leaving ? " leaving" : ""}`}
      data-testid="toast"
      data-kind={t.kind}
    >
      {t.kind === "wrap" && (
        <div className="wrap-thumb" aria-hidden="true">
          <WrapperEnd className="end-l" />
          <div className="body">{t.thumb && <img src={t.thumb} alt="" decoding="async" />}</div>
          <WrapperEnd className="end-r" />
        </div>
      )}
      {t.kind === "error" && (
        <span className="ico" aria-hidden="true">
          <Icon name="alert" size="sm" />
        </span>
      )}
      <div style={{ minWidth: 0 }}>
        <div className="t1">{t.title}</div>
        {t.detail && <div className={`t2${t.prose ? " prose" : ""}`}>{t.detail}</div>}
      </div>
      {t.action && (
        <button
          type="button"
          className="act"
          onClick={() => {
            t.action!.run();
            app.dismissToast(t.id);
          }}
        >
          {t.action.label}
        </button>
      )}
    </div>
  );
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toast-layer" role="status" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
}
