"use client";
/**
 * "One style, with exceptions": the inspector's scope switch (All 12 · This
 * image) and the marks on inspector groups where the image on stage differs
 * from the shared style. Nothing here renders without a batch.
 */
import type { ReactNode } from "react";
import { activeIndex, customCount } from "@/engine/batch/batch";
import { type OverrideGroup, GROUP_LABELS, overrideGroups } from "@/engine/batch/style";
import { Icon } from "../icons";
import { Segmented } from "../ui/controls";
import { useBatch, useBatchUi } from "./batch-ui";
import { useApp } from "./context";

/** Groups the image on stage overrides (empty without a batch). */
export function useActiveGroups(): OverrideGroup[] {
  const batch = useBatch();
  if (!batch) return [];
  return overrideGroups(batch.items[activeIndex(batch)]!.overrides);
}

export function BatchScope() {
  const app = useApp();
  const batch = useBatch();
  const scope = useBatchUi((s) => s.scope);
  if (!batch) return null;
  const n = batch.items.length;
  const k = batch.selected.length;
  const custom = customCount(batch);
  return (
    <div className="bscope" data-testid="batch-scope">
      <Segmented
        label="Apply changes to"
        value={scope}
        onChange={(v) => app.batch.setScope(v)}
        options={[
          { value: "all", label: `All ${n}`, title: "Changes apply to every image" },
          {
            value: "some",
            label: k > 1 ? `Selected ${k}` : "This image",
            title:
              k > 1 ? "Changes apply to the selected images" : "Changes apply to this image only",
          },
        ]}
      />
      {scope === "all" && custom > 0 && (
        <p className="bscope-note" data-testid="batch-custom-note">
          {custom === 1 ? "1 image has its" : `${custom} images have their`} own changes.{" "}
          <button type="button" className="link quiet" onClick={() => app.batch.resetAll()}>
            Reset {custom === 1 ? "it" : "them"}
          </button>
        </p>
      )}
    </div>
  );
}

/** A dot after a group's title when the image on stage has its own settings there. */
export function OverrideDot({ group }: { group: OverrideGroup }) {
  const groups = useActiveGroups();
  if (!groups.includes(group)) return null;
  return (
    <>
      <span className="tray-dot" aria-hidden="true" title="This image has its own settings here" />
      <span className="sr-only">, this image only</span>
    </>
  );
}

/** The group's Reset (back to the shared style) when overridden; else `children`. */
export function OverrideReset({ group, children }: { group: OverrideGroup; children?: ReactNode }) {
  const app = useApp();
  const batch = useBatch();
  const groups = useActiveGroups();
  if (!batch || !groups.includes(group)) return <>{children}</>;
  return (
    <button
      type="button"
      className="link quiet"
      title="Match the style all images share"
      aria-label={`Reset ${GROUP_LABELS[group].toLowerCase()} to the shared style`}
      data-testid={`reset-${group}`}
      onClick={() => app.batch.reset([batch.active], [group])}
    >
      Reset
    </button>
  );
}

/** "Exporting 7 of 12" with Cancel, over the stage while Export all runs. */
export function BatchProgress() {
  const app = useApp();
  const job = useBatchUi((s) => s.exporting);
  if (!job) return null;
  const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
  return (
    // Not a live region: a hundred images would be a hundred announcements. The
    // start and the end are announced; the bar reports progress when asked.
    <div className="render-pill" role="group" aria-label="Export all" data-testid="batch-progress">
      <span className="rp-ring" style={{ ["--p" as string]: `${pct}%` }} aria-hidden="true">
        <Icon name="zip" size="xs" />
      </span>
      <span className="rp-txt">
        <b>
          Exporting {Math.min(job.done + 1, job.total)} of {job.total}
        </b>
        <span className="mono">
          {job.target === "folder"
            ? "Into the Shotcandy folder"
            : job.target === "share"
              ? "For sharing"
              : "ZIP"}{" "}
          · {pct}%
        </span>
      </span>
      <span
        className="rp-bar"
        role="progressbar"
        aria-label="Images exported"
        aria-valuemin={0}
        aria-valuemax={job.total}
        aria-valuenow={job.done}
        aria-valuetext={`${job.done} of ${job.total}`}
      >
        <i style={{ width: `${pct}%` }} />
      </span>
      <button
        type="button"
        className="act"
        onClick={() => app.batch.cancelExport()}
        data-testid="cancel-batch-export"
      >
        Cancel
      </button>
    </div>
  );
}
