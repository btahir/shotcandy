import type { Metadata } from "next";
import { preload } from "react-dom";
import { Editor } from "@/components/editor/Editor";

export const metadata: Metadata = {
  title: { absolute: "Shotcandy — make your screenshots look lovely" },
};

export default function Home() {
  // The empty-state fan is the first large paint: fetch the two images both
  // layouts show ahead of the scripts. (Media-conditional preloads for the
  // layout-specific third image made Firefox warn on every load: REVIEW r2 N24.)
  for (const f of ["mint", "midnight"])
    preload(`/empty/fan-${f}.webp`, { as: "image", fetchPriority: "high" });
  return <Editor />;
}
