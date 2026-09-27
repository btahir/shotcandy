/** Code images: language detection, line lists, highlighting categories and schema. */
import { describe, expect, it } from "vitest";
import {
  CODE_CATEGORIES,
  CODE_LANGUAGES,
  CODE_STYLES,
  CODE_THEMES,
  codeTokensKey,
  createScene,
  detectLanguage,
  getBackgroundPreset,
  normalizeScene,
  resolveLanguage,
} from "@/engine";
import { highlightCode } from "@/lib/code/highlight";
import { formatLineList, parseLineList } from "@/lib/code/lines";

const SAMPLES: Record<string, string> = {
  typescript: `interface User { id: string; name: string }\nexport function greet(u: User): string {\n  return \`Hi \${u.name}\`;\n}`,
  tsx: `type ButtonProps = { label: string };\nexport function Button({ label }: ButtonProps) {\n  return (\n    <button className="btn">{label}</button>\n  );\n}`,
  javascript: `const items = [1, 2, 3];\nfunction total(list) {\n  return list.reduce((a, b) => a + b, 0);\n}\nconsole.log(total(items));`,
  jsx: `import { useState } from "react";\nexport default function Counter() {\n  const [n, setN] = useState(0);\n  return (\n    <button onClick={() => setN(n + 1)}>{n}</button>\n  );\n}`,
  python: `import os\n\nclass Store:\n    def __init__(self, path):\n        self.path = path\n\n    def load(self) -> dict:\n        return {"ok": True}\n`,
  rust: `use std::collections::HashMap;\n\nfn main() {\n    let mut scores = HashMap::new();\n    scores.insert("candy", 10);\n    println!("{:?}", scores);\n}`,
  go: `package main\n\nimport "fmt"\n\nfunc main() {\n\tname := "candy"\n\tfmt.Println("hello", name)\n}`,
  java: `import java.util.List;\n\npublic class Shop {\n    public static void main(String[] args) {\n        System.out.println("Sweet");\n    }\n}`,
  kotlin: `data class Candy(val name: String)\n\nfun main() {\n    val c = Candy("taffy")\n    println(c.name)\n}`,
  swift: `import SwiftUI\n\nstruct ContentView: View {\n    var body: some View {\n        Text("Sweet")\n    }\n}`,
  c: `#include <stdio.h>\n\nint main(void) {\n    printf("sweet\\n");\n    return 0;\n}`,
  cpp: `#include <iostream>\n#include <vector>\n\nint main() {\n    std::vector<int> v{1, 2, 3};\n    std::cout << v.size() << std::endl;\n}`,
  csharp: `using System;\n\nnamespace Shop {\n    public class Candy {\n        public string Name { get; set; }\n    }\n}`,
  php: `<?php\nfunction sweeten($shot) {\n    $size = strlen($shot);\n    echo $size;\n}`,
  ruby: `class Candy\n  attr_accessor :name\n\n  def initialize(name)\n    @name = name\n  end\nend\nputs Candy.new("taffy").name`,
  html: `<!DOCTYPE html>\n<html>\n  <head><title>Sweet</title></head>\n  <body><div class="app"></div></body>\n</html>`,
  css: `.card {\n  border-radius: 16px;\n  color: var(--ink);\n}\n@media (max-width: 600px) {\n  .card { padding: 8px; }\n}`,
  json: `{\n  "name": "shotcandy",\n  "version": "0.1.0",\n  "private": true\n}`,
  yaml: `name: build\non:\n  push:\n    branches:\n      - main\njobs:\n  test:\n    runs-on: ubuntu-latest`,
  toml: `[package]\nname = "candy"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1"`,
  markdown: `# Shotcandy\n\nMake screenshots **lovely**.\n\n- Paste\n- Export\n\n[Try it](https://example.com)`,
  sql: `SELECT name, COUNT(*) AS total\nFROM orders\nWHERE status = 'paid'\nGROUP BY name\nORDER BY total DESC;`,
  bash: `#!/usr/bin/env bash\nset -e\npnpm install\nif [ -f .env ]; then\n  echo "found"\nfi`,
  dockerfile: `FROM node:24-alpine\nWORKDIR /app\nCOPY . .\nRUN pnpm install\nCMD ["pnpm", "start"]`,
  graphql: `query Candy($id: ID!) {\n  candy(id: $id) {\n    name\n    flavours\n  }\n}`,
  diff: `--- a/app.ts\n+++ b/app.ts\n@@ -1,3 +1,3 @@\n-const a = 1;\n+const a = 2;\n const b = 3;`,
};

describe("language detection", () => {
  it("covers every curated language with a sample", () => {
    const ids = CODE_LANGUAGES.map((l) => l.id).filter((id) => id !== "text");
    expect(ids.length).toBeGreaterThanOrEqual(25);
    expect(Object.keys(SAMPLES).sort()).toEqual(ids.sort());
  });

  for (const [lang, code] of Object.entries(SAMPLES)) {
    it(`detects ${lang}`, () => {
      expect(detectLanguage(code)).toBe(lang);
    });
  }

  it("stays fast on adversarial input (no catastrophic backtracking)", () => {
    const nasty = [
      ".a ".repeat(3000) + "x",
      "def f(" + "(".repeat(4000),
      "a: ".repeat(3000),
      "<div ".repeat(2000),
      "\t".repeat(8000) + "{",
    ];
    for (const s of nasty) {
      const t0 = performance.now();
      detectLanguage(s);
      expect(performance.now() - t0).toBeLessThan(80);
    }
  });

  it("falls back to plain text and resolves explicit choices", () => {
    expect(detectLanguage("")).toBe("text");
    expect(detectLanguage("just some words here")).toBe("text");
    expect(resolveLanguage("python", "const a = 1")).toBe("python");
    expect(resolveLanguage("klingon", "x")).toBe("text");
    expect(resolveLanguage("auto", SAMPLES.go!)).toBe("go");
  });
});

describe("highlighted line lists", () => {
  it("parses ranges and formats them back", () => {
    expect(parseLineList("2, 5-7 ; 9 3–4 x")).toEqual([2, 3, 4, 5, 6, 7, 9]);
    expect(parseLineList("0, -2")).toEqual([]);
    expect(formatLineList([1, 2, 3, 5, 8, 9])).toBe("1-3, 5, 8-9");
    expect(formatLineList([])).toBe("");
  });
});

describe("themes and styles", () => {
  it("ships 8 themes, each paired with an existing background", () => {
    expect(CODE_THEMES).toHaveLength(8);
    expect(new Set(CODE_THEMES.map((t) => t.id)).size).toBe(8);
    for (const t of CODE_THEMES) {
      expect(getBackgroundPreset(t.background), t.id).toBeDefined();
      for (const k of Object.keys(t.colors)) expect(CODE_CATEGORIES).toContain(k);
    }
    expect(CODE_STYLES.map((s) => s.theme)).toEqual(CODE_THEMES.map((t) => t.id));
  });
});

describe("highlightCode (Shiki, lazy)", () => {
  it("returns categories, not colours, keyed to the code and language", async () => {
    const code = `// hi\nconst name: string = "candy";\nexport function go() { return 42; }`;
    const t = await highlightCode(code, "auto");
    expect(t.language).toBe("typescript");
    expect(t.key).toBe(codeTokensKey(code, "auto"));
    expect(t.lines).toHaveLength(3);
    const cats = (line: number) =>
      new Map(t.lines[line]!.map(([text, c]) => [text.trim(), CODE_CATEGORIES[c]]));
    expect(cats(0).get("// hi") ?? cats(0).get("//")).toBe("comment");
    expect(cats(1).get("const")).toBe("keyword");
    expect([...cats(1).entries()].find(([k]) => k.includes("candy"))?.[1]).toBe("string");
    expect(cats(2).get("go")).toBe("function");
    expect(cats(2).get("42")).toBe("number");
    // Every character is kept, in order.
    expect(t.lines.map((l) => l.map(([s]) => s).join("")).join("\n")).toBe(code);
  });

  it("highlights other languages and degrades to plain text", async () => {
    const py = await highlightCode(SAMPLES.python!, "python");
    expect(py.lines.flat().some(([s, c]) => s.trim() === "def" && CODE_CATEGORIES[c] === "keyword")).toBe(true);
    const plain = await highlightCode("hello world", "text");
    expect(plain.lines).toEqual([[["hello world", 0]]]);
  });
});

describe("schema", () => {
  it("normalizes code content, clamping values and dropping bad tokens", () => {
    const { scene } = normalizeScene({
      ...createScene(),
      content: {
        kind: "code",
        code: "x",
        language: "auto",
        theme: "sherbet",
        fontSize: 99,
        lineNumbers: false,
        highlight: [3, 1, 1, "2", -4],
        title: "a.ts",
        chrome: "weird",
        padding: 2,
        tokens: { key: "k", lines: [["bad"]] },
      },
    });
    expect(scene.content).toMatchObject({
      kind: "code",
      fontSize: 32,
      lineNumbers: false,
      highlight: [1, 3],
      chrome: "mac",
      padding: 8,
      tokens: null,
    });
  });
});
