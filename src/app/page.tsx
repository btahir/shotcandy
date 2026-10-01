import type { Metadata } from "next";
import { preload } from "react-dom";
import { Editor } from "@/components/editor/Editor";
import { STYLE_PRESETS } from "@/engine/presets/styles";

export const metadata: Metadata = {
  title: { absolute: "Shotcandy — free screenshot beautifier" },
  description: `Paste a screenshot and get a share-ready image: ${STYLE_PRESETS.length} styles, device frames, batch export and multi-screen mockups. Free, open source, nothing uploaded.`,
};

export default function Home() {
  // The empty-state fan is the first large paint: fetch the two images both
  // layouts show ahead of the scripts. (Media-conditional preloads for the
  // layout-specific third image made Firefox warn on every load: REVIEW r2 N24.)
  for (const f of ["mint", "midnight"])
    preload(`/empty/fan-${f}.webp`, { as: "image", fetchPriority: "high" });
  return <Editor />;
}
