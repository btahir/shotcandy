"use client";
/** The Candy Jar: every style rendered on the user's own screenshot, plus saved styles. */
import { useEffect, useMemo, useRef, useState } from "react";
import { type PresetRecord, type StylePatch, STYLE_FAMILIES } from "@/engine";
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
  const bodyRef = useRef<HTMLDivElement>(null);
  const [searching, setSearching] = useState(false);
  const close = () => app.ui.set({ modal: null });

  const fam = (id: string) => STYLE_FAMILIES.find((f) => f.id === id)?.label ?? id;
  // Styles that suit the screenshot's shape come first (device styles last for landscape shots).
  const assets = useUi((u) => u.assetsVersion);
  const contentId = useScene((sc) =>
    sc.scene.content.kind === "image" ? sc.scene.content.assetId : null,
  );
  const builtins: Item[] = useMemo(
    () =>
      app.orderedStyles().map((p) => ({
        id: p.id,
        name: p.name,
        family: p.family,
        familyLabel: fam(p.family),
        patch: p.patch,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app, assets, contentId],
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
  const showYoursSection = (filter === "all" && yours.length > 0) || filter === "yours";
  const shown = [
    ...(showYoursSection ? shownYours : []),
    ...(filter !== "yours" ? shownBuiltins : []),
  ];
  const shownIds = shown.map((it) => it.id).join(",");

  // The highlighted style: Enter applies it, arrow keys move it (also from search).
  const [hl, setHl] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      setQ("");
      setRenaming(null);
      setHl(null);
      return;
    }
    setHl((h) => {
      const ids = shownIds.split(",");
      if (h && ids.includes(h)) return h;
      return current && ids.includes(current) && !q ? current : (ids[0] ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shownIds]);
  const autofocusId = current && shown.some((s) => s.id === current) ? current : shown[0]?.id;

  const cardEls = (root: ParentNode) => Array.from(root.querySelectorAll<HTMLElement>(".card-btn"));
  const columns = (cards: HTMLElement[]) => {
    const top0 = cards[0]?.getBoundingClientRect().top ?? 0;
    return Math.max(
      1,
      cards.filter((c) => Math.abs(c.getBoundingClientRect().top - top0) < 4).length,
    );
  };
  const moveHl = (d: number | "row+" | "row-") => {
    const body = bodyRef.current;
    if (!body || !shown.length) return;
    const cards = cardEls(body);
    const cols = columns(cards);
    const step = d === "row+" ? cols : d === "row-" ? -cols : d;
    const i = Math.max(
      0,
      shown.findIndex((s) => s.id === hl),
    );
    const next = shown[Math.max(0, Math.min(shown.length - 1, i + step))]!;
    setHl(next.id);
    app.announce(`${next.name}, ${next.familyLabel}. Enter to apply.`);
    body
      .querySelector<HTMLElement>(`[data-style="${CSS.escape(next.id)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };
  const applyAndClose = (id: string) => {
    const it = shown.find((s) => s.id === id);
    if (!it) return;
    app.applyStyle(it.id);
    app.ui.set({ modal: null });
    app.announce(`Style: ${it.name}`);
  };

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
    const cards = cardEls(e.currentTarget);
    const i = cards.indexOf(t);
    const cols = columns(cards);
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
      hl={searching && hl === it.id}
      autofocus={it.id === autofocusId}
      onFocus={() => setHl(it.id)}
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
      <div
        className="jar-head"
        style={narrow ? { flexWrap: "wrap", padding: "18px 16px 12px" } : undefined}
      >
        <div style={{ minWidth: 0 }}>
          <h2 id="jar-title">Candy Jar</h2>
          <p>
            Every style, shown on your own screenshot. Click to apply,{" "}
            <span aria-hidden="true">↵</span>
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
            aria-describedby="jar-search-hint"
            onFocus={() => setSearching(true)}
            onBlur={() => setSearching(false)}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              const el = e.currentTarget;
              const empty = el.value.length === 0;
              if (e.key === "Enter") {
                e.preventDefault();
                if (hl) applyAndClose(hl);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                moveHl("row+");
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                moveHl("row-");
              } else if (
                e.key === "ArrowRight" &&
                (empty || el.selectionStart === el.value.length)
              ) {
                e.preventDefault();
                moveHl(1);
              } else if (e.key === "ArrowLeft" && (empty || el.selectionEnd === 0)) {
                e.preventDefault();
                moveHl(-1);
              }
            }}
          />
          <span className="kbd" aria-hidden="true">
            /
          </span>
          <span className="sr-only" id="jar-search-hint">
            Arrow keys pick a style, Enter applies it.
          </span>
        </label>
        <button
          type="button"
          className={`btn btn-secondary btn-sm${spin ? " spin-once" : ""}`}
          key={spin}
          title="Re-roll a whole composition (S)"
          onClick={() => {
            app.shuffle();
            setSpin((n) => n + 1);
          }}
        >
          <Icon name="shuffle" size="sm" /> Candy Shuffle
        </button>
        {!showYoursSection && filter === "all" && (
          <button
            type="button"
            className="btn btn-ghost btn-sm save-chip"
            onClick={() => void saveCurrent()}
          >
            <Icon name="plus" size="sm" /> Save current style
          </button>
        )}
        <button
          type="button"
          className="icon-btn jar-close"
          aria-label="Close (Esc)"
          onClick={close}
        >
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
      <div className="jar-body" ref={bodyRef} onKeyDown={onKeyDown} id="jar-results">
        {showYoursSection && (
          <>
            <div className="jar-sec">
              Your styles <span className="meta">saved in this browser</span>
            </div>
            <div className="jar-grid">
              <button type="button" className="save-tile" onClick={() => void saveCurrent()}>
                <div>
                  <div className="plus">
                    <Icon name="plus" />
                  </div>
                  Save current style
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--sc-ink-3)",
                      fontWeight: 500,
                      marginTop: 2,
                    }}
                  >
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
              Built-in <span className="meta">{shownBuiltins.length} styles</span>
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
            <span className="kbd">→</span>
            <span className="kbd">↑</span>
            <span className="kbd">↓</span>browse
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
  hl,
  autofocus,
  onFocus,
  renaming,
  onRename,
  onStartRename,
  target,
}: {
  it: Item;
  i: number;
  on: boolean;
  hl: boolean;
  autofocus: boolean;
  onFocus: () => void;
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
      className={`jar-card${on ? " on" : ""}${hl ? " hl" : ""}`}
      style={{ animationDelay: `${Math.min(300, i * 20)}ms` }}
      data-style={it.id}
    >
      <button
        type="button"
        className="card-btn"
        id={`jar-${it.id}`}
        data-autofocus={autofocus || undefined}
        onFocus={onFocus}
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
          <StyleThumb
            styleKey={it.id}
            patch={it.patch}
            aspect={[16, 10]}
            target={target}
            priority={1}
          />
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
