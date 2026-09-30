"use client";
/**
 * The screens of a multi-screen design on the stage: hover and drop
 * highlights drawn along each screen's real (rotated, tilted) outline, a
 * click on an empty screen to choose its image, a small × to empty screens
 * 2+, drag a screen onto another to swap, and a menu. Each screen is also a
 * focusable button (Tab reaches it): Enter chooses an image, Delete empties
 * it, Alt+←/→ swaps it with its neighbour, Shift+F10 opens the menu.
 *
 * Mouse hits go through the engine's slotAt (the exact quads, topmost
 * first); the buttons only carry focus and names. Annotations sit above
 * this layer, so they keep their clicks and drags.
 */
import {
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Point, type Scene, type SlotRect, screenContent, slotAt, slotRects } from "@/engine";
import { useStore } from "@/lib/store";
import { Icon } from "../icons";
import { Popover, focusNextFrame, menuKeys } from "../ui/controls";
import { isBatch, itemScene } from "@/engine/batch/batch";
import { BatchThumb } from "./BatchRail";
import { useApp, useScene, useUi } from "./context";

const pts = (q: readonly Point[], z: number) => q.map((p) => `${p.x * z},${p.y * z}`).join(" ");

function centre(q: readonly Point[]): Point {
  return {
    x: q.reduce((a, p) => a + p.x, 0) / q.length,
    y: q.reduce((a, p) => a + p.y, 0) / q.length,
  };
}

interface Press {
  index: number | null;
  x: number;
  y: number;
  touch: boolean;
  moved: boolean;
}

export function ScreensLayer({
  scene,
  zoom,
  compRef,
  spaceDown,
}: {
  scene: Scene;
  zoom: number;
  compRef: RefObject<HTMLDivElement | null>;
  spaceDown: boolean;
}) {
  const app = useApp();
  const assetsVersion = useUi((s) => s.assetsVersion);
  const tool = useUi((s) => s.tool);
  const target = useStore(app.screens.ui, (s) => s.target);
  const carrying = useStore(app.screens.ui, (s) => s.carrying);
  const moving = useStore(app.screens.ui, (s) => s.moving);
  const flash = useStore(app.screens.ui, (s) => s.flash);
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const uid = useId().replace(/:/g, "");
  const press = useRef<Press | null>(null);
  const suppressClick = useRef(false);
  const layerRef = useRef<HTMLDivElement>(null);

  const rects = useMemo(
    () => slotRects(scene, app.library),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, app, assetsVersion],
  );
  const byIndex = (i: number | null) => (i === null ? undefined : rects.find((r) => r.index === i));
  const n = rects.length;

  // Drops and rail drags find the screen under the pointer through the controller.
  const live = useRef({ scene, zoom });
  useLayoutEffect(() => {
    live.current = { scene, zoom };
  });
  useEffect(() => {
    const locate = (x: number, y: number) => {
      const r = compRef.current?.getBoundingClientRect();
      if (!r) return null;
      const { scene: s, zoom: z } = live.current;
      return slotAt(s, app.library, (x - r.left) / z, (y - r.top) / z);
    };
    return app.screens.setLocator(locate);
  }, [app, compRef]);

  // A screen being dragged: Escape puts it back.
  useEffect(() => {
    if (moving === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      press.current = null;
      app.screens.endDrag();
      app.announce("Swap cancelled");
      // The click that ends this press must not choose an image for the screen under it.
      suppressClick.current = true;
      const release = () => setTimeout(() => (suppressClick.current = false), 0);
      window.addEventListener("pointerup", release, { once: true, capture: true });
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [app, moving]);

  const hit = (e: { clientX: number; clientY: number }) => {
    const r = layerRef.current?.getBoundingClientRect();
    if (!r) return null;
    return slotAt(scene, app.library, (e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom);
  };
  const empty = (i: number) => !!byIndex(i)?.empty;
  const active = tool === "select" && !spaceDown;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !active) return;
    press.current = {
      index: hit(e),
      x: e.clientX,
      y: e.clientY,
      touch: e.pointerType === "touch",
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (p && p.index !== null && !p.moved && !p.touch && !empty(p.index)) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 5) {
        p.moved = true;
        layerRef.current?.setPointerCapture(e.pointerId);
        setHover(null);
        app.screens.ui.set({ moving: p.index, carrying: "screen", target: null });
        app.announce(
          `Picked up screen ${p.index + 1}. Release on another screen to swap, Escape to cancel.`,
        );
      }
    }
    if (p?.moved) {
      const t = hit(e);
      // Screen 1 never trades places with an empty screen.
      const ok = t !== null && p.index !== null && app.screens.canSwap(p.index, t);
      app.screens.hover(ok ? t : null, "screen");
      return;
    }
    if (!p) {
      const i = active ? hit(e) : null;
      setHover(i);
      // Where the hint goes when the middle of an empty screen is hidden behind another.
      const r = layerRef.current?.getBoundingClientRect();
      if (i !== null && byIndex(i)?.empty && r)
        setPointer({ x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom });
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.moved) {
      const t = app.screens.ui.get().target;
      app.screens.endDrag();
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      if (t !== null && p.index !== null && t !== p.index) app.screens.swap(p.index, t);
      else app.announce("Swap cancelled");
      return;
    }
    // A tap on a filled screen (phones have no hover or right-click): its menu.
    if (p.touch && p.index !== null && !empty(p.index)) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 10)
        app.screens.openMenu(p.index, e.clientX, e.clientY);
    }
  };

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current || !active) return;
    const i = hit(e);
    if (i !== null && empty(i)) app.screens.pick(i);
  };

  const onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const i = hit(e);
    if (i === null) return;
    e.preventDefault();
    app.screens.openMenu(i, e.clientX, e.clientY);
  };

  const focusScreen = (i: number) =>
    focusNextFrame(() =>
      layerRef.current?.querySelector<HTMLButtonElement>(`[data-screen="${i}"]`),
    );

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    let handled = true;
    if ((e.key === "Delete" || e.key === "Backspace") && !e.altKey) {
      if (i > 0 && !empty(i)) app.screens.clear(i);
      else app.announce(i === 0 ? "Screen 1 is the design's own screenshot" : "Already empty");
    } else if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowUp")) {
      const j = app.screens.move(i, -1);
      if (j !== null) focusScreen(j);
    } else if (e.altKey && (e.key === "ArrowRight" || e.key === "ArrowDown")) {
      const j = app.screens.move(i, 1);
      if (j !== null) focusScreen(j);
    } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      const r = e.currentTarget.getBoundingClientRect();
      app.screens.openMenu(i, r.left + r.width / 2, r.top + r.height / 2);
    } else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const hovered = moving === null && carrying === null ? byIndex(hover) : undefined;
  const cursor =
    moving !== null
      ? "grabbing"
      : hover === null || !active
        ? undefined
        : empty(hover)
          ? "pointer"
          : "grab";

  return (
    <div
      ref={layerRef}
      className="screens-layer"
      data-testid="screens-layer"
      style={cursor ? { cursor } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        press.current = null;
        app.screens.endDrag();
      }}
      onPointerLeave={() => setHover(null)}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <svg className="screens-svg" aria-hidden="true">
        {/* Screens in front hide the outlines of the ones behind them. */}
        <defs>
          {rects.map((r) => {
            const front = rects.filter((f) => f.depth > r.depth);
            if (!front.length) return null;
            return (
              <mask
                key={r.index}
                id={`${uid}-${r.index}`}
                maskUnits="userSpaceOnUse"
                x="-100%"
                y="-100%"
                width="300%"
                height="300%"
              >
                <rect x="-100%" y="-100%" width="300%" height="300%" fill="#fff" />
                {front.map((f) => (
                  <polygon
                    key={f.index}
                    points={pts(f.quad, zoom)}
                    fill="#000"
                    stroke="#000"
                    strokeWidth={4}
                    strokeLinejoin="round"
                  />
                ))}
              </mask>
            );
          })}
        </defs>
        {rects.map((r) => {
          const masked = rects.some((f) => f.depth > r.depth);
          const cls = [
            "screen-shape",
            r.index === target ? "target" : "",
            r.index === moving ? "moving" : "",
            r.index === hovered?.index ? (r.empty ? "hover-empty" : "hover") : "",
            r.index === focused ? "focus" : "",
            flash.includes(r.index) ? "flash" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <polygon
              key={r.index}
              className={cls}
              points={pts(r.quad, zoom)}
              mask={masked ? `url(#${uid}-${r.index})` : undefined}
            />
          );
        })}
      </svg>
      {hovered?.empty && <Hint rect={hovered} zoom={zoom} text="Add image" at={pointer} />}
      {target !== null && (carrying === "screen" || carrying === "image") && byIndex(target) && (
        <Hint
          rect={byIndex(target)!}
          zoom={zoom}
          strong
          text={carrying === "screen" ? "Swap" : byIndex(target)!.empty ? "Add here" : "Replace"}
        />
      )}
      {hovered && !hovered.empty && hovered.index > 0 && active && (
        <RemoveButton
          rect={hovered}
          zoom={zoom}
          onRemove={() => app.screens.clear(hovered.index)}
        />
      )}
      {rects.map((r) => {
        const b = r.bounds;
        return (
          <button
            key={r.index}
            type="button"
            className="screen-hit"
            data-screen={r.index}
            data-testid="screen"
            data-empty={r.empty ? "" : undefined}
            aria-label={app.screens.label(r.index, scene)}
            aria-keyshortcuts={r.index > 0 ? "Delete Alt+ArrowLeft Alt+ArrowRight" : undefined}
            style={{
              left: b.x * zoom,
              top: b.y * zoom,
              width: b.width * zoom,
              height: b.height * zoom,
              zIndex: n + r.depth,
            }}
            onFocus={(e) => setFocused(e.currentTarget.matches(":focus-visible") ? r.index : null)}
            onBlur={() => setFocused(null)}
            onClick={(e) => {
              // Keyboard only: the layer handles pointer clicks by the screens' real shapes.
              e.stopPropagation();
              app.screens.pick(r.index);
            }}
            onKeyDown={(e) => onKeyDown(e, r.index)}
          />
        );
      })}
    </div>
  );
}

/**
 * A small label in the middle of a screen, under the engine's plus (or by the
 * pointer when the middle is hidden behind another screen).
 */
function Hint({
  rect,
  zoom,
  text,
  strong,
  at,
}: {
  rect: SlotRect;
  zoom: number;
  text: string;
  strong?: boolean;
  at?: Point | null;
}) {
  const app = useApp();
  const mid = centre(rect.contentQuad);
  const hidden = at && slotAt(app.scene, app.library, mid.x, mid.y) !== rect.index;
  const c = hidden ? { x: at.x, y: at.y + 28 / zoom } : mid;
  const h = Math.hypot(
    rect.contentQuad[3].x - rect.contentQuad[0].x,
    rect.contentQuad[3].y - rect.contentQuad[0].y,
  );
  // Below the plus when there's room; on it when the screen is small.
  const dy = strong || hidden ? 0 : Math.min(0.2 * h * zoom, 44);
  return (
    <span
      className={`screen-hint${strong ? " strong" : ""}`}
      style={{ left: c.x * zoom, top: c.y * zoom + dy }}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}

/** × at a filled screen's top-right corner (screens 2+). */
function RemoveButton({
  rect,
  zoom,
  onRemove,
}: {
  rect: SlotRect;
  zoom: number;
  onRemove: () => void;
}) {
  const c = centre(rect.contentQuad);
  const tr = rect.contentQuad[1];
  // Pull the corner in toward the middle so the button sits on the screen.
  const d = Math.hypot(tr.x - c.x, tr.y - c.y) * zoom;
  const k = d > 0 ? Math.max(0, (d - 18) / d) : 0;
  const x = (c.x + (tr.x - c.x) * k) * zoom;
  const y = (c.y + (tr.y - c.y) * k) * zoom;
  return (
    <button
      type="button"
      className="screen-x"
      tabIndex={-1}
      aria-label={`Remove screen ${rect.index + 1} from the design`}
      title="Remove from design"
      data-testid="screen-remove"
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
    >
      <Icon name="x" size="xs" />
    </button>
  );
}

/**
 * A screen's menu: Replace…, From your images…, Swap with previous / next,
 * Remove from design. Rendered at the editor's root, outside the stage, so
 * its clicks never reach the stage's own pointer handling.
 */
export function ScreenMenu() {
  const app = useApp();
  const menu = useStore(app.screens.ui, (s) => s.menu);
  const doc = useScene((s) => s.doc);
  const anchor = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<{ index: number; x: number; y: number } | null>(null);
  // "From your images…" swaps the menu for a list of the batch's other images.
  const [picking, setPicking] = useState(false);
  useLayoutEffect(() => {
    if (menu) setShown(menu);
    setPicking(false);
  }, [menu]);
  useEffect(() => {
    if (picking)
      requestAnimationFrame(() =>
        listRef.current?.querySelector<HTMLButtonElement>(".menu-item")?.focus(),
      );
  }, [picking]);
  const lay = app.screens.active();
  const at = menu ?? shown;
  if (!lay || !at) return null;
  const i = at.index;
  const batch = isBatch(doc) ? doc : null;
  const others = batch ? batch.items.filter((x) => x.id !== batch.active) : [];
  const filled = !!screenContent(app.scene, i)?.assetId;
  const close = (refocus = true) => {
    app.screens.closeMenu();
    if (refocus)
      requestAnimationFrame(() => {
        // A click elsewhere (a field in the inspector, say) keeps the focus it gave.
        const now = document.activeElement;
        if (now && now !== document.body && !now.closest(".screen-menu")) return;
        document
          .querySelector<HTMLButtonElement>(`[data-testid=screens-layer] [data-screen="${i}"]`)
          ?.focus();
      });
  };
  const run = (fn: () => void) => () => {
    close(false);
    fn();
  };
  return (
    <>
      <span
        ref={anchor}
        aria-hidden="true"
        style={{
          position: "fixed",
          left: at.x,
          top: at.y,
          width: 1,
          height: 1,
          pointerEvents: "none",
        }}
      />
      <Popover
        open={!!menu}
        anchor={anchor}
        onClose={() => close()}
        label={picking ? `Put an image in screen ${i + 1}` : `Screen ${i + 1}`}
        role="menu"
        align="start"
        arrow={false}
        offset={4}
        className="menu screen-menu"
      >
        {picking && batch ? (
          <div ref={listRef} className="screen-pick" onKeyDown={menuKeys} data-testid="screen-pick">
            {others.map((x) => (
              <button
                key={x.id}
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={run(() => app.screens.placeItems(i, [x.id]))}
              >
                <span className="screen-pick-thumb" aria-hidden="true">
                  <BatchThumb scene={itemScene(batch, x)} target={44} priority={6} />
                </span>
                <span className="screen-pick-name">
                  <span className="mono">{batch.items.indexOf(x) + 1}</span>
                  {x.name || "Untitled"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div onKeyDown={menuKeys} data-testid="screen-menu">
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={run(() => app.screens.pick(i))}
            >
              <Icon name="upload" size="sm" /> {filled ? "Replace…" : "Choose image…"}
            </button>
            {others.length > 0 && (
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => setPicking(true)}
              >
                <Icon name="image" size="sm" /> From your images…
              </button>
            )}
            <div className="menu-sep" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              disabled={!app.screens.canSwap(i, i - 1)}
              onClick={run(() => app.screens.move(i, -1))}
            >
              <Icon name="arrowLeft" size="sm" /> Swap with previous
              <span className="meta mono">⌥←</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              disabled={!app.screens.canSwap(i, i + 1)}
              onClick={run(() => app.screens.move(i, 1))}
            >
              <Icon name="arrowRight" size="sm" /> Swap with next
              <span className="meta mono">⌥→</span>
            </button>
            {i > 0 && filled && (
              <>
                <div className="menu-sep" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item danger"
                  onClick={run(() => app.screens.clear(i))}
                >
                  <Icon name="x" size="sm" /> Remove from design
                  <span className="meta mono">⌫</span>
                </button>
              </>
            )}
          </div>
        )}
      </Popover>
    </>
  );
}
