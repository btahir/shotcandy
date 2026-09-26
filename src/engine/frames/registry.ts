/**
 * Pluggable frame registry. Specs (data) and kinds (drawing code) register
 * independently; `resolveFrame` pairs them. Frame id "none" means no frame.
 */
import { BUILTIN_KINDS } from "./kinds";
import { BUILTIN_FRAMES } from "./specs";
import type { FrameKind, FrameSpec } from "./types";

const kinds = new Map<string, FrameKind>();
const specs = new Map<string, FrameSpec>();

export function registerFrameKind<S extends FrameSpec>(kind: FrameKind<S>): void {
  kinds.set(kind.kind, kind as unknown as FrameKind);
}

/** Register or replace a frame spec (the design team can override built-ins). */
export function registerFrame(spec: FrameSpec): void {
  if (spec.id === "none") throw new Error('"none" is reserved');
  specs.set(spec.id, spec);
}

export function getFrameSpec(id: string): FrameSpec | undefined {
  return specs.get(id);
}

export interface ResolvedFrame {
  spec: FrameSpec;
  kind: FrameKind;
}

/** Look up a frame; unknown ids resolve to null (rendered without a frame). */
export function resolveFrame(id: string): ResolvedFrame | null {
  if (id === "none") return null;
  const spec = specs.get(id);
  if (!spec) return null;
  const kind = kinds.get(spec.kind);
  if (!kind) return null;
  return { spec, kind };
}

export function listFrames(): { id: string; label: string; kind: FrameSpec["kind"] }[] {
  return [...specs.values()].map((s) => ({ id: s.id, label: s.label, kind: s.kind }));
}

for (const k of BUILTIN_KINDS) registerFrameKind(k as FrameKind<never>);
for (const s of BUILTIN_FRAMES) registerFrame(s);
