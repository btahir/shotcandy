import type { Metadata } from "next";
import { Editor } from "@/components/editor/Editor";

export const metadata: Metadata = {
  title: { absolute: "Shotcandy — make your screenshots look lovely" },
};

export default function Home() {
  return <Editor />;
}
