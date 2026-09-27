"use client";
/** The keyboard shortcut sheet (a box of keycaps) and the recent designs dialog. */
import { useEffect, useMemo, useState } from "react";
import { isApple } from "@/lib/platform";
import { Icon } from "../icons";
import { Modal } from "../ui/Modal";
import { useApp, useUi } from "./context";

type Row = [string, string[]];

function groups(mod: string): { title: string; rows: Row[] }[] {
  return [
    {
      title: "Global",
      rows: [
        ["Paste a screenshot", [mod, "V"]],
        ["Choose a file", [mod, "O"]],
        ["Copy image", [mod, "C"]],
        ["Download", [mod, "S"]],
        ["Export options", [mod, "⇧", "S"]],
        ["Undo / redo", [mod, "Z", "·", mod, "⇧", "Z"]],
        ["This sheet", ["?"]],
        ["Close or deselect", ["Esc"]],
      ],
    },
    {
      title: "Styles and canvas",
      rows: [
        ["Candy Jar (all styles)", ["G"]],
        ["Previous / next style", ["[", "]"]],
        ["Surprise me", ["S"]],
        ["Inspector styles", ["1", "–", "6"]],
        ["Cycle frames", ["F"]],
        ["Frame light / dark", ["⇧", "F"]],
        ["Cycle padding", ["P"]],
        ["Size menu", ["K"]],
        ["Play or pause motion", ["M"]],
        ["Zoom to fit / 100%", [mod, "0", "·", mod, "1"]],
        ["Zoom in / out", [mod, "+", "·", mod, "−"]],
        ["Pan", ["Space", "drag"]],
      ],
    },
    {
      title: "Annotations",
      rows: [
        ["Select", ["V"]],
        ["Text · Arrow · Highlight · Blur", ["T", "A", "R", "B"]],
        ["Edit text / commit", ["↵"]],
        ["Delete", ["⌫"]],
        ["Nudge (×10 with ⇧)", ["←", "→", "↑", "↓"]],
        ["Duplicate", [mod, "D"]],
        ["Next / previous annotation", ["Tab", "⇧", "Tab"]],
        ["Constrain while dragging", ["⇧"]],
        ["Resize from centre", [isApple() ? "⌥" : "Alt"]],
      ],
    },
    {
      title: "Controls",
      rows: [
        ["Slider ±1 (±10 with ⇧)", ["←", "→"]],
        ["Next / previous stop", ["PgUp", "PgDn"]],
        ["Minimum / maximum", ["Home", "End"]],
        ["Type an exact value", ["↵"]],
        ["Fine drag", ["⇧", "drag"]],
        ["Drag without snapping", [isApple() ? "⌥" : "Alt", "drag"]],
        ["Quick copy", ["double-click stage"]],
      ],
    },
  ];
}

export function ShortcutsSheet() {
  const app = useApp();
  const open = useUi((s) => s.modal === "shortcuts");
  const [mod, setMod] = useState("⌘");
  useEffect(() => setMod(isApple() ? "⌘" : "Ctrl"), []);
  const data = useMemo(() => groups(mod), [mod]);
  return (
    <Modal
      open={open}
      onClose={() => app.ui.set({ modal: null })}
      labelledBy="kb-title"
      className="dialog"
    >
      <div className="dialog-head">
        <div style={{ flex: 1 }}>
          <h2 id="kb-title">Keyboard shortcuts</h2>
          <p>Single keys work whenever you’re not typing in a field.</p>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close (Esc)"
          onClick={() => app.ui.set({ modal: null })}
        >
          <Icon name="x" />
        </button>
      </div>
      <div className="dialog-body" style={{ background: "var(--sc-stage)", paddingTop: 20 }}>
        <div className="kb-grid">
          {data.map((g) => (
            <section key={g.title} className="tray" aria-labelledby={`kb-${g.title}`}>
              <div className="tray-head">
                <h3 id={`kb-${g.title}`}>{g.title}</h3>
              </div>
              {g.rows.map(([label, keys]) => (
                <div className="kb-row" key={label}>
                  <span>{label}</span>
                  <span className="keys">
                    {keys.map((k, i) =>
                      k === "·" || k === "–" || k === "drag" || k === "double-click stage" ? (
                        <span
                          key={i}
                          className="muted"
                          style={{ fontSize: 12, alignSelf: "center" }}
                        >
                          {k}
                        </span>
                      ) : (
                        <kbd key={i} className="kbd">
                          {k}
                        </kbd>
                      ),
                    )}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function timeAgo(t: number): string {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function RecentsDialog() {
  const app = useApp();
  const open = useUi((s) => s.modal === "recents");
  const recents = useUi((s) => s.recents);
  const persistent = useUi((s) => s.persistent);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const d of recents) if (d.thumbnail) next[d.id] = URL.createObjectURL(d.thumbnail);
    setUrls(next);
    return () => Object.values(next).forEach((u) => URL.revokeObjectURL(u));
  }, [open, recents]);
  return (
    <Modal
      open={open}
      onClose={() => app.ui.set({ modal: null })}
      labelledBy="recent-title"
      className="dialog"
    >
      <div className="dialog-head">
        <div style={{ flex: 1 }}>
          <h2 id="recent-title">Recent designs</h2>
          <p>
            {persistent
              ? "Saved automatically in this browser as you work."
              : "This browser isn't keeping data, so recents last until you close the tab."}
          </p>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close (Esc)"
          onClick={() => app.ui.set({ modal: null })}
        >
          <Icon name="x" />
        </button>
      </div>
      <div className="dialog-body">
        {recents.length === 0 ? (
          <p className="jar-empty">Nothing here yet. Paste a screenshot to start.</p>
        ) : (
          <ul
            className="recent-grid"
            aria-label="Saved designs"
            style={{ listStyle: "none", padding: 0, margin: 0 }}
          >
            {recents.map((d) => (
              <li key={d.id} className="recent-card">
                <button
                  type="button"
                  className="card-btn"
                  aria-label={`Open ${d.name}, edited ${timeAgo(d.updatedAt)}`}
                  onClick={() => void app.openRecent(d.id)}
                >
                  {urls[d.id] ? (
                    <img src={urls[d.id]} alt="" />
                  ) : (
                    <span
                      style={{
                        display: "block",
                        aspectRatio: "16/10",
                        borderRadius: 12,
                        background: "var(--sc-well)",
                      }}
                    />
                  )}
                  <span className="lbl">
                    {d.name}
                    <span>{timeAgo(d.updatedAt)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-btn sm del"
                  aria-label={`Remove ${d.name} from recents`}
                  onClick={() => void app.deleteRecent(d.id)}
                >
                  <Icon name="trash" size="sm" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
