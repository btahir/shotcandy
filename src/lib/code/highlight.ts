/**
 * Syntax highlighting with Shiki (MIT), loaded lazily on the first code image
 * and one grammar at a time. Shiki's JavaScript regex engine avoids shipping
 * the Oniguruma WASM.
 *
 * Instead of colours we ask Shiki for token *categories*: a sentinel theme
 * maps TextMate scopes to encoded colours (#0000NN = category NN). The engine
 * then paints categories with any code theme, so theme changes are instant.
 */
import {
  type CodeTokens,
  CODE_CATEGORIES,
  codeTokensKey,
  resolveLanguage,
} from "@/engine";
import type { HighlighterCore, LanguageRegistration, ThemeRegistration } from "shiki/core";

type LangModule = { default: LanguageRegistration[] };

/** The curated grammars (each a separate lazy chunk). */
const GRAMMARS: Record<string, () => Promise<LangModule>> = {
  typescript: () => import("@shikijs/langs/typescript"),
  tsx: () => import("@shikijs/langs/tsx"),
  javascript: () => import("@shikijs/langs/javascript"),
  jsx: () => import("@shikijs/langs/jsx"),
  python: () => import("@shikijs/langs/python"),
  rust: () => import("@shikijs/langs/rust"),
  go: () => import("@shikijs/langs/go"),
  java: () => import("@shikijs/langs/java"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  swift: () => import("@shikijs/langs/swift"),
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  php: () => import("@shikijs/langs/php"),
  ruby: () => import("@shikijs/langs/ruby"),
  html: () => import("@shikijs/langs/html"),
  css: () => import("@shikijs/langs/css"),
  json: () => import("@shikijs/langs/json"),
  yaml: () => import("@shikijs/langs/yaml"),
  toml: () => import("@shikijs/langs/toml"),
  markdown: () => import("@shikijs/langs/markdown"),
  sql: () => import("@shikijs/langs/sql"),
  bash: () => import("@shikijs/langs/bash"),
  dockerfile: () => import("@shikijs/langs/dockerfile"),
  graphql: () => import("@shikijs/langs/graphql"),
  diff: () => import("@shikijs/langs/diff"),
};

const cat = (name: (typeof CODE_CATEGORIES)[number]) =>
  `#0000${CODE_CATEGORIES.indexOf(name).toString(16).padStart(2, "0")}`;

/** TextMate scope → category. More specific selectors win (Shiki resolves). */
const SCOPES: [string[], (typeof CODE_CATEGORIES)[number]][] = [
  [["comment", "punctuation.definition.comment", "string.comment"], "comment"],
  [
    [
      "string",
      "string.quoted",
      "string.template",
      "punctuation.definition.string",
      "markup.inline.raw",
      "markup.fenced_code",
    ],
    "string",
  ],
  [["constant.numeric", "keyword.other.unit"], "number"],
  [
    [
      "constant.language",
      "constant.character",
      "support.constant",
      "variable.other.constant",
      "constant.other",
      "variable.other.enummember",
    ],
    "constant",
  ],
  [
    [
      "keyword",
      "storage",
      "storage.type",
      "storage.modifier",
      "keyword.control",
      "variable.language",
      "keyword.other",
    ],
    "keyword",
  ],
  [
    [
      "keyword.operator",
      "punctuation",
      "meta.brace",
      "punctuation.separator",
      "punctuation.terminator",
      "punctuation.accessor",
    ],
    "operator",
  ],
  [
    [
      "entity.name.function",
      "support.function",
      "variable.function",
      "meta.function-call.generic",
      "entity.name.function.macro",
    ],
    "function",
  ],
  [
    [
      "entity.name.type",
      "entity.name.class",
      "support.type",
      "support.class",
      "entity.other.inherited-class",
      "storage.type.primitive",
      "entity.name.namespace",
      "support.type.primitive",
      "entity.name.type.class",
    ],
    "type",
  ],
  [["variable", "variable.parameter", "variable.other", "meta.definition.variable"], "variable"],
  [
    [
      "variable.other.property",
      "support.type.property-name",
      "entity.other.attribute-name",
      "meta.object-literal.key",
      "variable.other.object.property",
      "support.variable.property",
      "entity.name.tag.yaml",
      "keyword.key.toml",
      "support.type.property-name.json",
    ],
    "property",
  ],
  [["entity.name.tag", "punctuation.definition.tag", "support.class.component"], "tag"],
  [["string.regexp", "constant.character.escape", "constant.other.placeholder"], "regexp"],
  [["markup.heading", "entity.name.section", "markup.bold", "punctuation.definition.heading"], "heading"],
  [["markup.inserted", "punctuation.definition.inserted"], "inserted"],
  [["markup.deleted", "punctuation.definition.deleted"], "deleted"],
];

const SENTINEL: ThemeRegistration = {
  name: "shotcandy-categories",
  type: "dark",
  colors: { "editor.foreground": "#000000", "editor.background": "#ffffff" },
  settings: [
    { settings: { foreground: "#000000" } },
    ...SCOPES.map(([scope, name]) => ({ scope, settings: { foreground: cat(name) } })),
  ],
};

let highlighter: Promise<HighlighterCore> | null = null;
const loaded = new Set<string>();

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= Promise.all([import("shiki/core"), import("shiki/engine/javascript")]).then(
    ([core, js]) =>
      core.createHighlighterCore({
        themes: [SENTINEL],
        langs: [],
        engine: js.createJavaScriptRegexEngine({ forgiving: true }),
      }),
  );
  return highlighter;
}

async function ensureLanguage(h: HighlighterCore, lang: string): Promise<boolean> {
  if (loaded.has(lang)) return true;
  const load = GRAMMARS[lang];
  if (!load) return false;
  const mod = await load();
  await h.loadLanguage(...mod.default);
  loaded.add(lang);
  return true;
}

function categoryOf(color: string | undefined): number {
  if (!color) return 0;
  const n = parseInt(color.slice(-2), 16);
  return Number.isFinite(n) && n < CODE_CATEGORIES.length ? n : 0;
}

/**
 * Tokens for `code` in `language` (an id or "auto"). Resolves with plain text
 * tokens when the language has no grammar.
 */
export async function highlightCode(code: string, language: string): Promise<CodeTokens> {
  const resolved = resolveLanguage(language, code);
  const key = codeTokensKey(code, language);
  const plain = (): CodeTokens => ({
    key,
    language: resolved,
    lines: code.split(/\r?\n/).map((l) => (l ? [[l, 0] as [string, number]] : [])),
  });
  if (resolved === "text" || !GRAMMARS[resolved]) return plain();
  const h = await getHighlighter();
  if (!(await ensureLanguage(h, resolved))) return plain();
  const lines = h.codeToTokensBase(code, {
    lang: resolved,
    theme: SENTINEL.name!,
    includeExplanation: false,
  });
  return {
    key,
    language: resolved,
    lines: lines.map((line) =>
      line.map((t) => [t.content, categoryOf(t.color)] as [string, number]),
    ),
  };
}

/** Load Shiki and a grammar ahead of time (e.g. when the user opens Code mode). */
export function prewarmHighlighter(language = "typescript"): void {
  void getHighlighter()
    .then((h) => ensureLanguage(h, language))
    .catch(() => undefined);
}
