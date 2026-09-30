"use client";
/**
 * Batches on phones: a horizontal strip of styled thumbnails between the
 * canvas and the bottom sheet. Tap to show an image; "Select" switches to
 * multi-select; the menu moves, duplicates, resets and removes. No dragging
 * from the strip (it scrolls sideways instead).
 */
import { useEffect, useRef, useState } from "react";
import { ACCEPT_IMAGES, layoutScene } from "@/engine";
import { activeIndex, itemScene } from "@/engine/batch/batch";
import { overrideGroups } from "@/engine/batch/style";
import { Icon } from "../icons";
import { BatchMenu, BatchThumb } from "./BatchRail";
import { groupsText, useBatch, useBatchUi } from "./batch-ui";
import { useApp, useUi } from "./context";
import { openFilesPicker } from "./EmptyState";

const H = 56;

export function BatchStrip() {
  const app = useApp();
  const batch = useBatch();
  const selecting = useBatchUi((s) => s.selecting);
  const pending = useBatchUi((s) => s.pending);
  useUi((s) => s.assetsVersion);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const active = batch?.active;

  useEffect(() => {
    if (!active) return;
    document
      .getElementById(`bs-${active}`)
      ?.scrollIntoView?.({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [active]);

  if (!batch) return null;
  const n = batch.items.length;
  const ai = activeIndex(batch);

  const tap = (id: string) => {
    if (selecting) {
      if (batch.selected.includes(id) && batch.selected.length === 1) return;
      app.batch.select(id, "toggle");
    } else app.batch.select(id, "only");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      app.batch.step(e.key === "ArrowLeft" ? -1 : 1);
    }
  };

  return (
    <div className="bstrip" data-testid="batch-strip">
      <div className="bstrip-scroll">
        <div
          role="listbox"
          aria-label={`Images, ${ai + 1} of ${n}`}
          aria-orientation="horizontal"
          aria-multiselectable={selecting || undefined}
          aria-activedescendant={`bs-${batch.active}`}
          tabIndex={0}
          className="bstrip-list"
          onKeyDown={onKeyDown}
        >
          {batch.items.map((x, i) => {
            const scene = itemScene(batch, x);
            const l = layoutScene(scene, app.resolver);
            const ratio = Math.max(
              0.56,
              Math.min(1.8, l.canvas.width / Math.max(1, l.canvas.height)),
            );
            const groups = overrideGroups(x.overrides);
            const sel = batch.selected.includes(x.id);
            return (
              <div
                key={x.id}
                id={`bs-${x.id}`}
                role="option"
                aria-selected={selecting ? sel : x.id === batch.active}
                aria-label={`Image ${i + 1} of ${n}, ${x.name || "Untitled"}${groups.length ? `. ${groupsText(groups)}` : ""}`}
                className={`bst${x.id === batch.active ? " on" : ""}${selecting && sel ? " sel" : ""}`}
                data-testid="batch-strip-tile"
                style={{ width: Math.round(H * ratio) }}
                onClick={() => tap(x.id)}
              >
                <BatchThumb
                  scene={scene}
                  target={Math.max(H, H * ratio)}
                  priority={x.id === batch.active ? 8 : 5}
                />
                {groups.length > 0 && <span className="bt-dot" aria-hidden="true" />}
                {selecting && (
                  <span className={`bst-check${sel ? " on" : ""}`} aria-hidden="true">
                    {sel && <Icon name="check" size="xs" />}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {pending.map((p) => (
          <div key={p.key} className="bst pending" aria-hidden="true" style={{ width: H * 1.4 }}>
            <span className="skeleton" />
          </div>
        ))}
        <button
          type="button"
          className="bst-add"
          aria-label="Add images"
          onClick={() =>
            openFilesPicker(
              (f) => void app.importFiles(f, { source: "file", add: true }),
              ACCEPT_IMAGES,
            )
          }
        >
          <Icon name="plus" />
        </button>
      </div>
      <div className="bstrip-bar">
        <span className="mono bstrip-pos">
          {selecting && batch.selected.length > 1
            ? `${batch.selected.length} selected`
            : `${ai + 1} of ${n}`}
        </span>
        <button
          type="button"
          className={`chip soft bstrip-select${selecting ? " on" : ""}`}
          aria-pressed={selecting}
          data-testid="batch-select"
          onClick={() => {
            if (selecting) app.batch.collapseSelection();
            app.batch.ui.set({ selecting: !selecting });
          }}
        >
          {selecting ? "Done" : "Select"}
        </button>
        <button
          ref={menuBtn}
          type="button"
          className="icon-btn"
          aria-label={
            batch.selected.length > 1 ? `${batch.selected.length} images: more` : "Image: more"
          }
          aria-haspopup="menu"
          aria-expanded={!!menu}
          data-testid="batch-strip-menu"
          onClick={() => {
            const r = menuBtn.current!.getBoundingClientRect();
            setMenu(menu ? null : { x: r.right - 230, y: r.top - 8, id: batch.active });
          }}
        >
          <Icon name="more" />
        </button>
      </div>
      <BatchMenu
        at={menu}
        onClose={() => {
          setMenu(null);
          menuBtn.current?.focus({ preventScroll: true });
        }}
        horizontal
      />
    </div>
  );
}
