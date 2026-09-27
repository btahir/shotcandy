"use client";
/** The Candy Jar: every style rendered on the user's own screenshot, plus saved styles. */
import { useEffect, useMemo, useRef, useState } from "react";
import { type PresetRecord, type StylePatch, STYLE_FAMILIES, STYLE_PRESETS } from "@/engine";
import { Icon } from "../icons";
import { Modal } from "../ui/Modal";
import { Popover, menuKeys } from "../ui/controls";
import { styleName } from "./app";
import { useApp, useScene, useUi } from "./context";
import { StyleThumb } from "./StyleThumb";

type Item = {
  id: string;
  name: string;
  family: string;
  familyLabel: string;
  patch: StylePatch;
  custom?: PresetRecord;
};

export function Gallery({ narrow = false }: { narrow?: boolean }) {
  const app = useApp();
  const open = useUi((s) => s.modal === "gallery");
  const custom = useUi((s) => s.customPresets);
  const current = useScene((s) => s.scene.meta.stylePresetId);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [spin, setSpin] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const close = () => app.ui.set({ modal: null });

  const fam = (id: string) => STYLE_FAMILIES.find((f) => f.id === id)?.label ?? id;
  const builtins: Item[] = useMemo(
    () =>
      STYLE_PRESETS.map((p) => ({
        id: p.id,
        name: p.name,
        family: p.family,
        familyLabel: fam(p.family),
        patch: p.patch,
      })),
    [],
  );
  const yours: Item[] = custom.map((p) => ({
    id: p.id,
    name: p.name,
    family: "yours",
    familyLabel: "Yours",
    patch: p.patch,
    custom: p,
  }));

  const match = (it: Item) =>
    (!q || `${it.name} ${it.familyLabel}`.toLowerCase().includes(q.toLowerCase())) &&
    (filter === "all" || filter === it.family || (filter === "yours" && !!it.custom));
  const shownYours = yours.filter(match);
  const shownBuiltins = builtins.filter(match);
  const showYoursSection = filter === "all" || filter === "yours";

  useEffect(() => {
    if (!open) {
      setQ("");
      setRenaming(null);
    }
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "/" && document.activeElement !== searchRef.current) {
      e.preventDefault();
      searchRef.current?.focus();
      return;
    }
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"];
    if (!keys.includes(e.key)) return;
    const t = document.activeElement as HTMLElement;
    if (!t?.classList.contains("card-btn")) return;
    const cards = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(".card-btn"));
    const i = cards.indexOf(t);
    const top0 = cards[0]!.getBoundingClientRect().top;
    const cols = Math.max(1, cards.filter((c) => Math.abs(c.getBoundingClientRect().top - top0) < 4).length);
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key]!;
    e.preventDefault();
    cards[Math.max(0, Math.min(cards.length - 1, i + d))]?.focus();
  };

  const saveCurrent = async () => {
    const rec = await app.savePreset();
    if (rec) setRenaming(rec.id);
  };

  const tile = (it: Item, i: number) => (
    <GalleryCard
      key={it.id}
      it={it}
      i={i}
      on={current === it.id}
      renaming={renaming === it.id}
      onRename={(name) => {
        if (it.custom && name !== null) void app.renamePreset(it.id, name);
        setRenaming(null);
      }}
      onStartRename={() => setRenaming(it.id)}
      target={narrow ? 180 : 260}
    />
  );

  const counts = (f: string) => builtins.filter((b) => b.family === f).length;
  const tweaked = app.isTweaked();

  return (
    <Modal open={open} onClose={close} labelledBy="jar-title" className="jar">
      <div className="jar-head" style={narrow ? { flexWrap: "wrap", padding: "18px 16px 12px" } : undefined}>
        <div style={{ minWidth: 0 }}>
          <h2 id="jar-title">Candy Jar</h2>
          <p>
            Every style, shown on your own screenshot. Click to apply, <span aria-hidden="true">↵</span>
            <span className="sr-only">Enter</span> to apply and close.
          </p>
        </div>
        <div className="grow" />
        <label className="input search" style={narrow ? { width: "100%", order: 3 } : undefined}>
          <Icon name="search" size="sm" />
          <span className="sr-only">Search styles</span>
          <input
            ref={searchRef}
            placeholder="Search styles"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const first = document.querySelector<HTMLElement>(".jar .card-btn");
                first?.focus();
              }
            }}
          />
          <span className="kbd" aria-hidden="true">
            /
          </span>
        </label>
        <button
          type="button"
          className={`btn btn-secondary btn-sm${spin ? " spin-once" : ""}`}
          key={spin}
          onClick={() => {
            app.surprise();
            setSpin((n) => n + 1);
          }}
        >
          <Icon name="shuffle" size="sm" /> Surprise me
        </button>
        <button type="button" className="icon-btn" aria-label="Close (Esc)" onClick={close}>
          <Icon name="x" />
        </button>
      </div>
      <div className="filters" role="tablist" aria-label="Style families">
        {[
          { id: "all", label: "All", n: builtins.length + yours.length },
          { id: "yours", label: "Yours", n: yours.length },
          ...STYLE_FAMILIES.map((f) => ({ id: f.id, label: f.label, n: counts(f.id) })),
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={`chip${filter === f.id ? " on" : " soft"}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label} <span className="n">{f.n}</span>
          </button>
        ))}
      </div>
      <div className="jar-body" onKeyDown={onKeyDown}>
        {showYoursSection && (
          <>
            <div className="jar-sec">
              Your styles <span className="mono">saved in this browser</span>
            </div>
            <div className="jar-grid">
              <button type="button" className="save-tile" onClick={() => void saveCurrent()}>
                <div>
                  <div className="plus">
                    <Icon name="plus" />
                  </div>
                  Save current style
                  <div style={{ fontSize: 12, color: "var(--sc-ink-3)", fontWeight: 500, marginTop: 2 }}>
                    {styleName(current, custom)}
                    {tweaked ? " + your tweaks" : ""}
                  </div>
                </div>
              </button>
              {shownYours.map((it, i) => tile(it, i + 1))}
            </div>
          </>
        )}
        {filter !== "yours" && (
          <>
            <div className="jar-sec">
              Built-in <span className="mono">{shownBuiltins.length} styles</span>
            </div>
            {shownBuiltins.length ? (
              <div className="jar-grid">{shownBuiltins.map((it, i) => tile(it, i))}</div>
            ) : (
              <p className="jar-empty">No styles match “{q}”.</p>
            )}
          </>
        )}
      </div>
      {!narrow && (
        <div className="jar-foot">
          <span>
            <span className="kbd">←</span>
            <span className="kbd">→</span>browse
          </span>
          <span>
            <span className="kbd">↵</span>apply
          </span>
          <span>
            <span className="kbd">Esc</span>close
          </span>
          <span style={{ marginLeft: "auto" }}>
            Saved styles live in this browser. Back up designs with a project file.
          </span>
        </div>
      )}
    </Modal>
  );
}

function GalleryCard({
  it,
  i,
  on,
  renaming,
  onRename,
  onStartRename,
  target,
}: {
  it: Item;
  i: number;
  on: boolean;
  renaming: boolean;
  onRename: (name: string | null) => void;
  onStartRename: () => void;
  target: number;
}) {
  const app = useApp();
  const menuRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const [name, setName] = useState(it.name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renaming) {
      setName(it.name);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [renaming, it.name]);
  return (
    <div
      className={`jar-card${on ? " on" : ""}`}
      style={{ animationDelay: `${Math.min(300, i * 20)}ms` }}
    >
      <button
        type="button"
        className="card-btn"
        aria-label={`${it.name}, ${it.familyLabel}${on ? ", current style" : ""}`}
        aria-pressed={on}
        onClick={() => {
          app.applyStyle(it.id);
          app.announce(`Style: ${it.name}`);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            app.applyStyle(it.id);
            app.ui.set({ modal: null });
            app.announce(`Style: ${it.name}`);
          }
        }}
      >
        <div className="th">
          <StyleThumb styleKey={it.id} patch={it.patch} aspect={[16, 10]} target={target} priority={1} />
          {on && (
            <span className="badge">
              <Icon name="check" size="xs" /> Current
            </span>
          )}
          <span className="btn btn-primary btn-sm apply" aria-hidden="true">
            Apply <span className="tag">↵</span>
          </span>
        </div>
      </button>
      {it.custom && (
        <>
          <button
            ref={menuRef}
            type="button"
            className="icon-btn card-menu"
            aria-label={`Options for ${it.name}`}
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
          >
            <Icon name="more" size="sm" />
          </button>
          <Popover
            open={menu}
            anchor={menuRef}
            onClose={() => setMenu(false)}
            label={`${it.name} options`}
            role="menu"
            align="end"
            className="menu"
          >
            <div onKeyDown={menuKeys}>
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setMenu(false);
                  onStartRename();
                }}
              >
                <Icon name="text" size="sm" /> Rename
              </button>
              <button
                type="button"
                role="menuitem"
                className="menu-item btn-danger"
                onClick={() => {
                  setMenu(false);
                  void app.deletePreset(it.id);
                }}
              >
                <Icon name="trash" size="sm" /> Delete
              </button>
            </div>
          </Popover>
        </>
      )}
      <div className="lbl">
        {renaming ? (
          <input
            ref={inputRef}
            aria-label="Style name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => onRename(name)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") onRename(name);
              if (e.key === "Escape") onRename(null);
            }}
          />
        ) : (
          <b onDoubleClick={it.custom ? onStartRename : undefined}>{it.name}</b>
        )}
        <span>{it.familyLabel}</span>
      </div>
    </div>
  );
}
