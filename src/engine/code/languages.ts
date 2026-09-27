/**
 * The curated code languages and a small, deterministic language detector.
 * The detector scores each language by weighted patterns (keywords, syntax
 * shapes, shebangs) and picks the best; it runs in microseconds and needs no
 * highlighter, so "auto" resolves before Shiki has even loaded.
 */

export interface CodeLanguage {
  id: string;
  label: string;
  /** Default file extension (for window titles). */
  ext: string;
}

export const CODE_LANGUAGES: CodeLanguage[] = [
  { id: "typescript", label: "TypeScript", ext: "ts" },
  { id: "tsx", label: "TSX", ext: "tsx" },
  { id: "javascript", label: "JavaScript", ext: "js" },
  { id: "jsx", label: "JSX", ext: "jsx" },
  { id: "python", label: "Python", ext: "py" },
  { id: "rust", label: "Rust", ext: "rs" },
  { id: "go", label: "Go", ext: "go" },
  { id: "java", label: "Java", ext: "java" },
  { id: "kotlin", label: "Kotlin", ext: "kt" },
  { id: "swift", label: "Swift", ext: "swift" },
  { id: "c", label: "C", ext: "c" },
  { id: "cpp", label: "C++", ext: "cpp" },
  { id: "csharp", label: "C#", ext: "cs" },
  { id: "php", label: "PHP", ext: "php" },
  { id: "ruby", label: "Ruby", ext: "rb" },
  { id: "html", label: "HTML", ext: "html" },
  { id: "css", label: "CSS", ext: "css" },
  { id: "json", label: "JSON", ext: "json" },
  { id: "yaml", label: "YAML", ext: "yml" },
  { id: "toml", label: "TOML", ext: "toml" },
  { id: "markdown", label: "Markdown", ext: "md" },
  { id: "sql", label: "SQL", ext: "sql" },
  { id: "bash", label: "Shell", ext: "sh" },
  { id: "dockerfile", label: "Dockerfile", ext: "Dockerfile" },
  { id: "graphql", label: "GraphQL", ext: "graphql" },
  { id: "diff", label: "Diff", ext: "diff" },
  { id: "text", label: "Plain text", ext: "txt" },
];

const byId = new Map(CODE_LANGUAGES.map((l) => [l.id, l]));

export function getCodeLanguage(id: string): CodeLanguage | undefined {
  return byId.get(id);
}

type Rule = [RegExp, number];

/** Weighted patterns per language. Multiline flags where line anchors matter. */
const RULES: Record<string, Rule[]> = {
  typescript: [
    [/\b(interface|type)\s+[A-Z]\w*\s*(=|\{|<)/, 4],
    [/:\s*(string|number|boolean|void|unknown|never|any)\b/, 3],
    [/\b(implements|readonly|enum|namespace|declare)\b/, 2],
    [/\bas\s+(const|string|number|unknown)\b/, 3],
    [/<[A-Z]\w*(\[\])?>\(/, 1],
    [/\b(import|export)\b.*\bfrom\s+['"]/, 1],
    [/\bconst\s+\w+\s*:\s*\w+/, 2],
    [/\)\s*:\s*[A-Z\w<>[\]|]+\s*(=>|\{)/, 3],
  ],
  tsx: [
    [/<[A-Z]\w*[\s/>]/, 2],
    [/return\s*\(\s*</, 2],
    [/\bclassName=/, 2],
    [/:\s*(React\.)?(FC|ReactNode|JSX\.Element)\b/, 4],
    [/\b(interface|type)\s+\w*Props\b/, 4],
  ],
  javascript: [
    [/\b(const|let|var)\s+\w+\s*=/, 1],
    [/\bfunction\s*\w*\s*\(/, 1],
    [/=>\s*[{(]?/, 1],
    [/\b(console\.log|document\.|window\.|require\()/, 3],
    [/\bmodule\.exports\b/, 4],
    [/\b(import|export)\b.*\bfrom\s+['"]/, 1],
    [/\bawait\b|\basync\s+function\b/, 1],
  ],
  jsx: [
    [/<[A-Z]\w*[\s/>]/, 2],
    [/return\s*\(\s*</, 2],
    [/\bclassName=/, 2],
    [/\buse(State|Effect|Memo|Ref)\(/, 2],
  ],
  python: [
    [/^\s*def\s+\w+\s*\(.*\)\s*(->\s*[\w[\], .]+)?:\s*$/m, 5],
    [/^\s*(from\s+[\w.]+\s+)?import\s+[\w.]+(\s+as\s+\w+)?\s*$/m, 3],
    [/^\s*class\s+\w+(\(.*\))?:\s*$/m, 4],
    [/\bself\b/, 2],
    [/\b(elif|None|True|False|lambda|print\()/, 2],
    [/^\s*@\w+/m, 1],
    [/f"[^"]*\{/, 2],
    [/:\s*$/m, 1],
  ],
  rust: [
    [/\bfn\s+\w+\s*(<[^>]*>)?\s*\(/, 4],
    [/\blet\s+mut\b/, 5],
    [/\b(impl|pub\s+fn|pub\s+struct|use\s+std::|::new\(|&mut\b|&str\b)/, 4],
    [/\b(Some|None|Ok|Err)\(/, 2],
    [/\w+!\(/, 2],
    [/->\s*(Result|Option|Self|i32|u32|usize|String)\b/, 3],
  ],
  go: [
    [/^package\s+\w+\s*$/m, 6],
    [/\bfunc\s+(\(\w+\s+\*?\w+\)\s*)?\w+\s*\(/, 4],
    [/:=/, 2],
    [/\bfmt\.\w+\(/, 4],
    [/\b(chan|defer|go\s+func)\b/, 3],
    [/^import\s+\(/m, 3],
  ],
  java: [
    [/\bpublic\s+(static\s+)?(final\s+)?(class|void|interface)\b/, 4],
    [/\bSystem\.out\.println\(/, 6],
    [/\b(private|protected)\s+(final\s+)?\w+(<[\w, ]+>)?\s+\w+\s*[;=]/, 3],
    [/@Override\b/, 4],
    [/^import\s+java\./m, 5],
    [/\bnew\s+[A-Z]\w*(<.*>)?\(/, 1],
  ],
  kotlin: [
    [/\bfun\s+\w+\s*\(/, 5],
    [/\bval\s+\w+(\s*:\s*\w+)?\s*=/, 3],
    [/\b(data class|companion object|when\s*\(|println\()/, 4],
    [/\?\.|!!/, 1],
  ],
  swift: [
    [/\bfunc\s+\w+\s*\(.*\)\s*(->\s*\w+)?\s*\{/, 3],
    [/\b(import\s+(SwiftUI|UIKit|Foundation))\b/, 6],
    [/\bguard\s+let\b|\bif\s+let\b/, 4],
    [/\b(struct|class)\s+\w+\s*:\s*(View|ObservableObject)\b/, 5],
    [/\bvar\s+body\s*:\s*some\s+View\b/, 6],
    [/\blet\s+\w+\s*:\s*[A-Z]\w*/, 1],
  ],
  c: [
    [/^#include\s*<(stdio|stdlib|string|math)\.h>/m, 6],
    [/\bint\s+main\s*\(/, 3],
    [/\b(printf|malloc|free|sizeof)\s*\(/, 3],
    [/\bstruct\s+\w+\s*\{/, 1],
  ],
  cpp: [
    [/^#include\s*<(iostream|vector|string|memory|map|algorithm)>/m, 6],
    [/\bstd::/, 5],
    [/\b(template\s*<|namespace\s+\w+|using\s+namespace)\b/, 4],
    [/\bcout\s*<</, 5],
    [/\b(class|public:|private:)\b/, 1],
  ],
  csharp: [
    [/^using\s+System(\.\w+)*;/m, 6],
    [/\bnamespace\s+[\w.]+/, 2],
    [/\bpublic\s+(async\s+)?(Task|void|string|int|bool)\s+\w+\s*\(/, 3],
    [/\bConsole\.WriteLine\(/, 6],
    [/\{\s*get;\s*(set;)?\s*\}/, 6],
    [/\bvar\s+\w+\s*=\s*new\b/, 2],
  ],
  php: [
    [/<\?php/, 10],
    [/\$\w+\s*=/, 2],
    [/\bfunction\s+\w+\s*\(\s*\$/, 4],
    [/->\w+\(/, 1],
    [/\becho\s/, 2],
  ],
  ruby: [
    [/^\s*def\s+\w+[?!]?(\(.*\))?\s*$/m, 4],
    [/^\s*end\s*$/m, 3],
    [/\b(puts|require|attr_accessor|do\s*\|)\b/, 3],
    [/:\w+\s*=>/, 2],
    [/^\s*class\s+\w+\s*(<\s*\w+)?\s*$/m, 2],
  ],
  html: [
    [/<!DOCTYPE html>/i, 10],
    [/<(html|head|body|div|span|meta|link|script)[\s>]/i, 3],
    [/<\/\w+>/, 1],
    [/\s(class|href|src)="/, 1],
  ],
  css: [
    [/^\s*[.#]?[\w-][^{};\n]{0,80}\{\s*$/m, 3],
    [/^\s*[\w-]+\s*:\s*[^;{}]+;\s*$/m, 3],
    [/@(media|import|keyframes|font-face)\b/, 4],
    [/\b(px|rem|em|vh|vw)\b|#[0-9a-f]{3,8}\b/i, 1],
    [/var\(--[\w-]+\)/, 3],
  ],
  json: [
    [/^\s*[{[]/, 2],
    [/"[\w-]+"\s*:/, 3],
    [/^\s*[}\]],?\s*$/m, 1],
  ],
  yaml: [
    [/^[\w-]+:\s*$/m, 3],
    [/^\s*[\w-]+:\s+\S/m, 2],
    [/^\s*-\s+[\w"']/m, 2],
    [/^---\s*$/m, 3],
  ],
  toml: [
    [/^\[[\w.-]+\]\s*$/m, 5],
    [/^\s*[\w-]+\s*=\s*("|\d|true|false|\[)/m, 3],
  ],
  markdown: [
    [/^#{1,6}\s+\S/m, 4],
    [/^\s*[-*]\s+\S/m, 1],
    [/\[[^\]]+\]\([^)]+\)/, 3],
    [/^```/m, 3],
    [/\*\*[^*]+\*\*/, 2],
  ],
  sql: [
    [/\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\b/i, 5],
    [/\b(FROM|WHERE|JOIN|GROUP\s+BY|ORDER\s+BY|LIMIT|VALUES)\b/i, 2],
    [/\b(VARCHAR|INTEGER|PRIMARY\s+KEY|NOT\s+NULL)\b/i, 3],
  ],
  bash: [
    [/^#!\s*\/(usr\/)?bin\/(env\s+)?(ba|z)?sh/m, 10],
    [/^\s*\$\s+\w+/m, 3],
    [/\b(echo|export|sudo|apt(-get)?|brew|npm|pnpm|yarn|npx|curl|chmod|mkdir|cd)\s/, 3],
    [/\$\{?\w+\}?/, 1],
    [/\b(fi|then|esac|done)\b/, 3],
    [/\s(&&|\|\|)\s/, 1],
  ],
  dockerfile: [
    [/^FROM\s+[\w./:-]+(\s+AS\s+\w+)?\s*$/im, 6],
    [/^(RUN|COPY|WORKDIR|ENV|EXPOSE|CMD|ENTRYPOINT|ARG)\s/m, 4],
  ],
  graphql: [
    [/^\s*(query|mutation|subscription|fragment)\s+\w*\s*(\(|\{|on\b)/m, 6],
    [/^\s*type\s+\w+\s*(implements\s+\w+\s*)?\{/m, 3],
    [/\w+:\s*\[?\w+!?\]?!?\s*$/m, 1],
  ],
  diff: [
    [/^(---|\+\+\+)\s/m, 5],
    [/^@@\s.*\s@@/m, 8],
    [/^[+-](?![+-])/m, 1],
  ],
};

/**
 * Best-guess language for a snippet ("text" when nothing is convincing).
 * Deterministic: ties resolve by the order of CODE_LANGUAGES.
 */
export function detectLanguage(code: string): string {
  const src = code.slice(0, 8000);
  if (!src.trim()) return "text";
  const trimmed = src.trim();
  // JSON is strict enough to test directly.
  if (/^[{[]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      /* not JSON */
    }
  }
  let best = "text";
  let bestScore = 2.5;
  for (const lang of CODE_LANGUAGES) {
    const rules = RULES[lang.id];
    if (!rules) continue;
    let score = 0;
    for (const [re, w] of rules) if (re.test(src)) score += w;
    if (score > bestScore) {
      best = lang.id;
      bestScore = score;
    }
  }
  // TSX/JSX only when there is markup; otherwise prefer TS/JS.
  const markup = /<[A-Za-z][\w.]*(\s[^>]*)?\/?>/.test(src) && /return\s*\(?\s*</.test(src);
  if ((best === "tsx" || best === "jsx") && !markup)
    best = best === "tsx" ? "typescript" : "javascript";
  if (best === "javascript" && markup) best = "jsx";
  if (best === "typescript" && markup) best = "tsx";
  if (best === "jsx" && scoreOf("typescript", src) >= 3) best = "tsx";
  return best;
}

function scoreOf(id: string, src: string): number {
  let s = 0;
  for (const [re, w] of RULES[id] ?? []) if (re.test(src)) s += w;
  return s;
}

/** The language to highlight with (resolves "auto"). */
export function resolveLanguage(language: string, code: string): string {
  if (language === "auto") return detectLanguage(code);
  return getCodeLanguage(language) ? language : "text";
}
