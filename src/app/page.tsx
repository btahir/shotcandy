import type { Metadata } from "next";
import { preload } from "react-dom";
import { Editor } from "@/components/editor/Editor";

export const metadata: Metadata = {
  title: { absolute: "Shotcandy — make your screenshots look lovely" },
};

export default function Home() {
  // The empty-state fan is the first large paint: fetch it ahead of the scripts.
  for (const f of ["mint", "midnight"])
    preload(`/empty/fan-${f}.webp`, { as: "image", fetchPriority: "high" });
  preload("/empty/fan-sherbet.webp", { as: "image", fetchPriority: "high", media: "(min-width: 768px)" });
  preload("/empty/fan-phone.webp", { as: "image", fetchPriority: "high", media: "(max-width: 767px)" });
  return <Editor />;
}
