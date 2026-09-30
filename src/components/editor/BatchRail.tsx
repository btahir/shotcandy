"use client";
/**
 * The images rail (wide layout, batches only): styled thumbnails of every
 * image, in export order. A multi-select listbox: click, Cmd/Ctrl-click and
 * Shift-click select like Finder; arrows move, ⌥↑/⌥↓ reorder, Delete
 * removes, Cmd/Ctrl-A selects all (only while the rail has focus, so the
 * canvas keeps its own keys). Drag to reorder, with a drop line; every drag
 * has a menu and a key.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Scene, ACCEPT_IMAGES, layoutScene } from "@/engine";
import { type BatchItem, activeIndex, itemScene } from "@/engine/batch/batch";
import { overrideGroups } from "@/engine/batch/style";
import { thumbScale } from "@/lib/thumbs/service";
import { Icon } from "../icons";
import { Popover, focusNextFrame, menuKeys } from "../ui/controls";
import { RAIL_MAX, RAIL_MIN } from "./batch";
import {
  groupsText,
  isMac,
  middleTruncate,
  useBatch,
  useBatchUi,
  useRailCollapsed,
} from "./batch-ui";
import { useApp, useUi } from "./context";
import { openFilesPicker } from "./EmptyState";
import { hashString } from "./SceneThumb";

/** Output-shaped box: the export's aspect, but never taller than 4:5 or wider than 3:1. */
function boxRatio(ratio: number): number {
  return Math.max(0.8, Math.min(3, ratio));
}

/**
 * A styled thumbnail, rendered by the thumbnail worker while it is (nearly)
 * visible. Style edits re-render it at most every 150 ms; the previous
 * picture stays up meanwhile.
 */
export const BatchThumb = memo(function BatchThumb({
  scene,
  target,
  priority = 5,
}: {
  scene: Scene;
  /** Longest side in CSS px. */
  target: number;
  priority?: number;
}) {
  const app = useApp();
  const fonts = useUi((s) => s.fontsReady);
  const assetsVersion = useUi((s) => s.assetsVersion);
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const drawn = useRef(false);

  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), {
      rootMargin: "240px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const thumbs = app.thumbs;
    const id = scene.content.kind === "image" ? scene.content.assetId : null;
    if (!visible || !thumbs || !id || !app.library.has(id)) return;
    // Every screen of a multi-screen design must be loaded first (the thumbnail is cached).
    if (scene.slots?.some((s) => s.assetId && !app.library.has(s.assetId))) return;
    let alive = true;
    const run = () => {
      const layout = layoutScene(scene, app.resolver);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const scale = thumbScale(Math.max(layout.canvas.width, layout.canvas.height), target * dpr);
      const key = `batch|${hashString(JSON.stringify(scene))}|${scale.toFixed(4)}|${fonts}`;
      const draw = (bmp: ImageBitmap) => {
        const c = ref.current;
        if (!alive || !c) return;
        if (c.width !== bmp.width) c.width = bmp.width;
        if (c.height !== bmp.height) c.height = bmp.height;
        const g = c.getContext("2d");
        g?.clearRect(0, 0, c.width, c.height);
        g?.drawImage(bmp, 0, 0);
        drawn.current = true;
        setReady(true);
      };
      const hit = thumbs.get(key);
      if (hit) draw(hit);
      else thumbs.request(key, scene, scale, priority).then(draw, () => undefined);
    };
    // First paint right away; later changes (a slider being dragged) at most every 150 ms.
    const t = drawn.current ? setTimeout(run, 150) : null;
    if (!t) run();
    return () => {
      alive = false;
      if (t) clearTimeout(t);
    };
  }, [app, scene, target, priority, fonts, assetsVersion, visible]);

  return (
    <>
      {!ready && <span className="skeleton" aria-hidden="true" />}
      <canvas
        ref={ref}
        width={4}
        height={3}
        aria-hidden="true"
        data-ready={ready ? "" : undefined}
        style={{ opacity: ready ? 1 : 0 }}
      />
    </>
  );
});

// ---------------------------------------------------------------------------
// Menu (right-click, Shift+F10, the phone strip's "…")
// ---------------------------------------------------------------------------

export function BatchMenu({
  at,
  onClose,
  horizontal = false,
}: {
  at: { x: number; y: number; id: string } | null;
  onClose: () => void;
  /** Phones: the strip runs left to right, and the menu opens up from its "…" button. */
  horizontal?: boolean;
}) {
  const app = useApp();
  const batch = useBatch();
  const anchor = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  // What the menu acts on, kept while it animates closed (so nothing under focus changes).
  const [shown, setShown] = useState<string[]>([]);
  useLayoutEffect(() => {
    if (!at) return;
    setPos({ x: at.x, y: at.y });
    setShown(app.batch.targets(at.id));
  }, [at, app]);
  if (!batch) return null;
  const ids = at ? app.batch.targets(at.id) : shown;
  const n = ids.length;
  const items = batch.items.filter((x) => ids.includes(x.id));
  const custom = items.filter((x) => x.overrides).length;
  const first = batch.items.findIndex((x) => x.id === items[0]?.id);
  const last = batch.items.findIndex((x) => x.id === items[items.length - 1]?.id);
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const mod = isMac() ? "⌘" : "Ctrl ";
  return (
    <>
      <span
        ref={anchor}
        aria-hidden="true"
        style={{ position: "fixed", left: pos.x, top: pos.y, width: 1, height: 1 }}
      />
      <Popover
        open={!!at}
        anchor={anchor}
        onClose={onClose}
        label={n > 1 ? `${n} images` : "Image"}
        role="menu"
        align={horizontal ? "end" : "start"}
        side={horizontal ? "above" : "below"}
        arrow={false}
        offset={4}
        className="menu batch-menu"
      >
        <div onKeyDown={menuKeys} data-testid="batch-menu">
          {n === 1 && custom === 1 && (
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={run(() => app.batch.useForAll(ids[0]!))}
            >
              <Icon name="sparkle" size="sm" /> Use this style for all
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            disabled={!custom}
            onClick={run(() => app.batch.reset(ids))}
          >
            <Icon name="undo" size="sm" />
            {n > 1 ? `Reset ${n} to shared style` : "Reset to shared style"}
          </button>
          <div className="menu-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            disabled={first <= 0}
            onClick={run(() => app.batch.nudge(-1, ids))}
          >
            <Icon name={horizontal ? "chevronLeft" : "chevronUp"} size="sm" />
            {horizontal ? "Move left" : "Move up"}
            {!horizontal && <span className="meta mono">⌥↑</span>}
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            disabled={last < 0 || last >= batch.items.length - 1}
            onClick={run(() => app.batch.nudge(1, ids))}
          >
            <Icon name={horizontal ? "chevronRight" : "chevronDown"} size="sm" />
            {horizontal ? "Move right" : "Move down"}
            {!horizontal && <span className="meta mono">⌥↓</span>}
          </button>
          {app.batch.canCombine(ids) && (
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              data-testid="combine"
              onClick={run(() => app.batch.combine(ids))}
            >
              <Icon name="phones" size="sm" /> Combine into one design
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={run(() => app.batch.duplicate(ids))}
          >
            <Icon name="duplicate" size="sm" /> {n > 1 ? `Duplicate ${n}` : "Duplicate"}
            {!horizontal && <span className="meta mono">{mod}D</span>}
          </button>
          <div className="menu-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="menu-item danger"
            onClick={run(() => app.batch.remove(ids))}
          >
            <Icon name="trash" size="sm" /> {n > 1 ? `Remove ${n} images` : "Remove"}
            {!horizontal && <span className="meta mono">⌫</span>}
          </button>
        </div>
      </Popover>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tile
// ---------------------------------------------------------------------------

const Tile = memo(function Tile({
  item,
  scene,
  index,
  n,
  selected,
  active,
  dragging,
  flash,
  width,
  onPointerDown,
  onClick,
  onContextMenu,
}: {
  item: BatchItem;
  scene: Scene;
  index: number;
  n: number;
  selected: boolean;
  active: boolean;
  dragging: boolean;
  flash: boolean;
  width: number;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  onClick: (e: React.MouseEvent, id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}) {
  const app = useApp();
  useUi((s) => s.assetsVersion);
  const layout = layoutScene(scene, app.resolver);
  const ratio = layout.canvas.width / Math.max(1, layout.canvas.height);
  const box = boxRatio(ratio);
  // The picture's width in the tile; its long side sets the thumbnail's resolution.
  const pw = ratio < box ? (width * ratio) / box : width;
  const groups = overrideGroups(item.overrides);
  const name = item.name || "Untitled";
  const custom = groupsText(groups);
  return (
    <div
      role="option"
      id={`bt-${item.id}`}
      aria-selected={selected}
      aria-label={`Image ${index + 1} of ${n}, ${name}${custom ? `. ${custom}` : ""}`}
      className={`btile${active ? " on" : ""}${selected ? " sel" : ""}${dragging ? " drag-src" : ""}${flash ? " flash" : ""}`}
      data-testid="batch-tile"
      data-id={item.id}
      title={name}
      onPointerDown={(e) => onPointerDown(e, item.id)}
      onClick={(e) => onClick(e, item.id)}
      onContextMenu={(e) => onContextMenu(e, item.id)}
    >
      <div className="bt-thumb" style={{ aspectRatio: box }}>
        {/* The picture itself keeps the export's shape inside the box (tall shots letterbox). */}
        <div
          className="bt-img"
          style={{
            aspectRatio: ratio,
            width: ratio < box ? `${(ratio / box) * 100}%` : "100%",
          }}
        >
          <BatchThumb scene={scene} target={Math.max(pw, pw / ratio)} priority={active ? 8 : 5} />
          {custom && <span className="bt-dot" title={custom} data-testid="batch-dot" />}
        </div>
      </div>
      <div className="bt-cap">
        <span className="bt-n mono">{index + 1}</span>
        <span className="bt-name">{middleTruncate(name)}</span>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Rail
// ---------------------------------------------------------------------------

interface Drag {
  id: string;
  x0: number;
  y0: number;
  started: boolean;
  ids: string[];
  index: number;
  ghost: HTMLElement | null;
  y: number;
  /** A screen of the multi-screen design on stage under the pointer (drop fills it). */
  slot: number | null;
  /** The pointer is away from the rail: letting go cancels. */
  away: boolean;
}

export function BatchRail() {
  const app = useApp();
  const batch = useBatch();
  const width = useBatchUi((s) => s.railWidth);
  const collapsed = useRailCollapsed();
  const pending = useBatchUi((s) => s.pending);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [dropY, setDropY] = useState<number | null>(null);
  const [flash, setFlash] = useState<string[]>([]);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const active = batch?.active;

  // Keep the image on stage in view (keyboard, imports, undo).
  useEffect(() => {
    if (!active) return;
    const el = document.getElementById(`bt-${active}`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const tiles = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLElement>("[role=option]") ?? []);

  /** Insertion index and drop-line position (in list coordinates) for a pointer y. */
  const dropAt = useCallback((clientY: number): { index: number; y: number } => {
    const els = tiles();
    const list = listRef.current!;
    const top = list.getBoundingClientRect().top;
    let index = els.length;
    for (let i = 0; i < els.length; i++) {
      const r = els[i]!.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) {
        index = i;
        break;
      }
    }
    const gap = 6;
    let y: number;
    if (!els.length) y = 0;
    else if (index === 0) y = els[0]!.getBoundingClientRect().top - top - gap;
    else y = els[index - 1]!.getBoundingClientRect().bottom - top + gap;
    return { index, y };
  }, []);

  const endDrag = useCallback(
    (commit: boolean) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      d.ghost?.remove();
      setDragIds(null);
      setDropY(null);
      app.screens.endDrag();
      if (!d.started) return;
      suppressClick.current = true;
      const release = () => setTimeout(() => (suppressClick.current = false), 0);
      // Escape ends the drag before the button is let go: keep the coming click away too.
      if (commit) release();
      else window.addEventListener("pointerup", release, { once: true, capture: true });
      if (commit && d.slot !== null) {
        // Onto a screen of the design on stage: the image goes in (it stays in the batch too).
        app.screens.placeItems(d.slot, d.ids);
      } else if (commit && d.index >= 0) {
        app.batch.moveTo(d.ids, d.index);
        setFlash(d.ids);
        setTimeout(() => setFlash([]), 700);
      } else app.announce("Move cancelled");
    },
    [app],
  );

  useEffect(() => {
    let raf = 0;
    const scrollTick = () => {
      const d = drag.current;
      const sc = scrollRef.current;
      if (!d?.started || !sc) return;
      const r = sc.getBoundingClientRect();
      const edge = 48;
      const dy =
        d.y < r.top + edge
          ? -Math.ceil((r.top + edge - d.y) / 4)
          : d.y > r.bottom - edge
            ? Math.ceil((d.y - (r.bottom - edge)) / 4)
            : 0;
      if (dy && d.slot === null && !d.away) {
        sc.scrollTop += dy;
        const at = dropAt(d.y);
        d.index = at.index;
        setDropY(at.y);
      }
      raf = requestAnimationFrame(scrollTick);
    };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      d.y = e.clientY;
      if (!d.started) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return;
        d.started = true;
        d.ids = app.batch.targets(d.id);
        setDragIds(d.ids);
        d.ghost = makeGhost(d.id, d.ids.length);
        raf = requestAnimationFrame(scrollTick);
        app.announce(
          `Picked up ${d.ids.length > 1 ? `${d.ids.length} images` : "the image"}. Release to drop, Escape to cancel.`,
        );
      }
      if (d.ghost) d.ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 8}px)`;
      // Over a screen of a multi-screen design: fill it instead of reordering.
      const slot = app.screens.at(e.clientX, e.clientY);
      d.slot = slot;
      app.screens.hover(slot, slot === null ? null : "image");
      // Away from the rail (over the stage or the inspector): letting go puts the images back.
      const r = scrollRef.current?.getBoundingClientRect();
      const away = !!r && (e.clientX < r.left - 24 || e.clientX > r.right + 24);
      d.away = away && slot === null;
      if (slot !== null || away) {
        d.index = -1;
        setDropY(null);
        return;
      }
      const at = dropAt(e.clientY);
      d.index = at.index;
      setDropY(at.y);
    };
    const up = () => endDrag(true);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drag.current?.started) {
        e.preventDefault();
        e.stopPropagation();
        endDrag(false);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key, true);
    };
  }, [app, dropAt, endDrag]);

  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      if (e.button !== 0) return;
      const b = app.batch.batch;
      if (!b) return;
      if (e.pointerType === "touch") {
        // Touch scrolls the rail; a long press opens the menu (Move up/down live there).
        const x = e.clientX;
        const y = e.clientY;
        if (press.current) clearTimeout(press.current);
        press.current = setTimeout(() => {
          press.current = null;
          suppressClick.current = true;
          setTimeout(() => (suppressClick.current = false), 400);
          if (!app.batch.batch?.selected.includes(id)) app.batch.select(id, "only");
          setMenu({ x, y, id });
        }, 500);
        const cancel = () => {
          if (press.current) clearTimeout(press.current);
          press.current = null;
          window.removeEventListener("pointerup", cancel);
          window.removeEventListener("pointercancel", cancel);
        };
        window.addEventListener("pointerup", cancel);
        window.addEventListener("pointercancel", cancel);
        return;
      }
      const mods = e.metaKey || e.ctrlKey || e.shiftKey;
      // With a multi-screen design on stage, a press doesn't switch images yet: the
      // image may be on its way into one of the screens (a click still selects it).
      if (!mods && !b.selected.includes(id) && !app.screens.active()) app.batch.select(id, "only");
      drag.current = {
        id,
        x0: e.clientX,
        y0: e.clientY,
        started: false,
        ids: [],
        index: -1,
        ghost: null,
        y: e.clientY,
        slot: null,
        away: false,
      };
    },
    [app],
  );

  const onClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (suppressClick.current) return;
      listRef.current?.focus({ preventScroll: true });
      // Cmd-click on Macs (Ctrl-click there is a right click), Ctrl-click elsewhere.
      const toggle = isMac() ? e.metaKey : e.ctrlKey || e.metaKey;
      if (e.shiftKey) app.batch.select(id, "range");
      else if (toggle) app.batch.select(id, "toggle");
      else if (!(isMac() && e.ctrlKey)) app.batch.select(id, "only");
    },
    [app],
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      const b = app.batch.batch;
      if (b && !b.selected.includes(id)) app.batch.select(id, "only");
      setMenu({ x: e.clientX, y: e.clientY, id });
    },
    [app],
  );

  if (!batch) return null;

  const openMenuAtActive = () => {
    const el = document.getElementById(`bt-${batch.active}`);
    const r = el?.getBoundingClientRect();
    setMenu({ x: (r?.left ?? 0) + 24, y: (r?.top ?? 0) + 24, id: batch.active });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key;
    // An annotation picked on the stage (focus can stay here) keeps Delete, arrows and Tab.
    if (
      app.store.getState().selection &&
      !mod &&
      (k === "Delete" || k === "Backspace" || k === "Tab" || k.startsWith("Arrow"))
    )
      return;
    let handled = true;
    if (k === "ArrowUp" || k === "ArrowDown") {
      const dir = k === "ArrowUp" ? -1 : 1;
      if (e.altKey) app.batch.nudge(dir);
      else app.batch.step(dir, e.shiftKey);
    } else if (k === "Home" || k === "End") app.batch.jump(k === "Home" ? "first" : "last");
    else if (mod && k.toLowerCase() === "a") app.batch.selectAll();
    else if (mod && k.toLowerCase() === "d") app.batch.duplicate();
    else if (k === "Delete" || k === "Backspace") app.batch.remove();
    else if (k === "Escape" && batch.selected.length > 1) app.batch.collapseSelection();
    else if (k === "Enter")
      document.querySelector<HTMLElement>("[data-layout=wide] [data-testid=stage]")?.focus();
    else if (k === "ContextMenu" || (k === "F10" && e.shiftKey)) openMenuAtActive();
    else if (k === " ") {
      /* Space would pan the canvas: the rail keeps it. */
    } else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const n = batch.items.length;
  const ai = activeIndex(batch);
  const tileW = width - 28;

  if (collapsed)
    return (
      <nav className="brail collapsed" aria-label="Images" data-testid="batch-rail">
        <button
          type="button"
          className="icon-btn"
          aria-label={`Show images (${n})`}
          title="Show images"
          data-testid="rail-expand"
          onClick={() => {
            app.batch.setRail({ collapsed: false });
            // This button goes away with the collapsed rail: keep the keyboard on the images.
            focusNextFrame(() => document.querySelector<HTMLElement>("[data-testid=batch-list]"));
          }}
        >
          <Icon name="chevronRight" />
        </button>
        <span className="brail-pos mono">
          {ai + 1}/{n}
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Previous image"
          disabled={ai === 0}
          onClick={() => app.batch.step(-1)}
        >
          <Icon name="chevronUp" />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Next image"
          disabled={ai === n - 1}
          onClick={() => app.batch.step(1)}
        >
          <Icon name="chevronDown" />
        </button>
      </nav>
    );

  return (
    <nav className="brail" aria-label="Images" data-testid="batch-rail">
      <div className="brail-head">
        <h2 id="brail-title">
          Images <span className="mono">{n}</span>
        </h2>
        <button
          type="button"
          className="icon-btn sm"
          aria-label="Collapse images"
          title="Collapse"
          data-testid="rail-collapse"
          onClick={() => {
            app.batch.setRail({ collapsed: true });
            focusNextFrame(() => document.querySelector<HTMLElement>("[data-testid=rail-expand]"));
          }}
        >
          <Icon name="chevronLeft" size="sm" />
        </button>
      </div>
      <div className="brail-scroll" ref={scrollRef}>
        <div
          ref={listRef}
          role="listbox"
          aria-labelledby="brail-title"
          aria-multiselectable="true"
          aria-activedescendant={`bt-${batch.active}`}
          aria-describedby="brail-help"
          tabIndex={0}
          className="brail-list"
          data-testid="batch-list"
          onKeyDown={onKeyDown}
          onFocus={(e) => {
            // Keys go to the images now, not to an annotation picked earlier.
            if (e.target === e.currentTarget && app.store.getState().selection)
              app.store.select(null);
          }}
        >
          {batch.items.map((x, i) => (
            <Tile
              key={x.id}
              item={x}
              scene={itemScene(batch, x)}
              index={i}
              n={n}
              selected={batch.selected.includes(x.id)}
              active={x.id === batch.active}
              dragging={!!dragIds?.includes(x.id)}
              flash={flash.includes(x.id)}
              width={tileW}
              onPointerDown={onPointerDown}
              onClick={onClick}
              onContextMenu={onContextMenu}
            />
          ))}
          {dropY !== null && (
            <div
              className="bt-drop"
              style={{ top: dropY }}
              aria-hidden="true"
              data-testid="batch-drop"
            />
          )}
        </div>
        {pending.map((p) => (
          <div key={p.key} className="btile pending" aria-hidden="true" data-testid="batch-pending">
            <div className="bt-thumb" style={{ aspectRatio: 1.6 }}>
              <div className="bt-img" style={{ aspectRatio: 1.6, width: "100%" }}>
                <span className="skeleton" />
              </div>
            </div>
            <div className="bt-cap">
              <span className="bt-name">{middleTruncate(p.name)}</span>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="brail-add"
          data-testid="batch-add"
          onClick={() =>
            openFilesPicker(
              (f) => void app.importFiles(f, { source: "file", add: true }),
              ACCEPT_IMAGES,
            )
          }
        >
          <Icon name="plus" size="sm" /> Add images
        </button>
        <p id="brail-help" className="sr-only">
          Arrow keys move between images. Shift with arrows selects several. Option with arrows
          reorders. Delete removes. Shift F10 opens the menu.
        </p>
      </div>
      <RailResizer width={width} />
      <BatchMenu
        at={menu}
        onClose={() => {
          setMenu(null);
          listRef.current?.focus({ preventScroll: true });
        }}
      />
    </nav>
  );
}

/** A picture of the dragged tile (and a count for several) that follows the pointer. */
function makeGhost(id: string, count: number): HTMLElement {
  const src = document.querySelector<HTMLCanvasElement>(`#bt-${id} canvas`);
  const g = document.createElement("div");
  g.className = "bt-ghost";
  g.setAttribute("aria-hidden", "true");
  if (src && src.width > 4) {
    const s = Math.min(1, 150 / Math.max(src.width, src.height));
    const c = document.createElement("canvas");
    c.width = Math.round(src.width * s);
    c.height = Math.round(src.height * s);
    c.getContext("2d")?.drawImage(src, 0, 0, c.width, c.height);
    g.appendChild(c);
  }
  if (count > 1) {
    const b = document.createElement("span");
    b.className = "bt-count mono";
    b.textContent = String(count);
    g.appendChild(b);
  }
  document.body.appendChild(g);
  return g;
}

function RailResizer({ width }: { width: number }) {
  const app = useApp();
  const start = useRef<{ x: number; w: number } | null>(null);
  return (
    <div
      className="brail-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize images panel"
      aria-valuenow={width}
      aria-valuemin={RAIL_MIN}
      aria-valuemax={RAIL_MAX}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, w: width };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        app.batch.setRail({ width: start.current.w + e.clientX - start.current.x });
      }}
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
      onDoubleClick={() => app.batch.setRail({ width: 208 })}
      onKeyDown={(e) => {
        const d = e.key === "ArrowRight" ? 16 : e.key === "ArrowLeft" ? -16 : 0;
        if (!d) return;
        e.preventDefault();
        e.stopPropagation();
        app.batch.setRail({ width: width + d });
      }}
    />
  );
}
