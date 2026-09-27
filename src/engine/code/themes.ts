/**
 * Code themes: palettes over a small set of token categories. Tokens carry a
 * category (not a colour), so switching theme is instant and synchronous.
 * Each theme is tuned to sit on one of our backgrounds (`background`).
 */

/** Token categories, indexed by the numbers stored in CodeTokens. */
export const CODE_CATEGORIES = [
  "plain",
  "comment",
  "keyword",
  "string",
  "number",
  "constant",
  "function",
  "type",
  "variable",
  "property",
  "tag",
  "operator",
  "regexp",
  "heading",
  "inserted",
  "deleted",
] as const;
export type CodeCategory = (typeof CODE_CATEGORIES)[number];

export interface CodeTheme {
  id: string;
  label: string;
  dark: boolean;
  /** Window/background colour. */
  bg: string;
  /** Default text colour. */
  fg: string;
  /** Line numbers. */
  gutter: string;
  /** Title bar text. */
  title: string;
  /** Band behind highlighted lines, and its left bar. */
  highlight: string;
  highlightBar: string;
  /** Hairline under the title bar and around the window. */
  line: string;
  /** Colours by category (missing = fg). */
  colors: Partial<Record<CodeCategory, string>>;
  /** Background preset (presets/backgrounds.json) it is designed to sit on. */
  background: string;
}

export const CODE_THEMES: CodeTheme[] = [
  {
    id: "midnight-candy",
    label: "Midnight Candy",
    dark: true,
    bg: "#1d1628",
    fg: "#efe6f7",
    gutter: "#5f5270",
    title: "#a497b4",
    highlight: "#ff6a8f1f",
    highlightBar: "#ff6a8f",
    line: "#ffffff14",
    colors: {
      comment: "#7d6f91",
      keyword: "#ff7aa2",
      string: "#8ee6be",
      number: "#ffb86b",
      constant: "#ffb86b",
      function: "#ffd86b",
      type: "#b9a1ff",
      variable: "#efe6f7",
      property: "#9fd0ff",
      tag: "#ff7aa2",
      operator: "#c7b8d8",
      regexp: "#ffd86b",
      heading: "#ff7aa2",
      inserted: "#8ee6be",
      deleted: "#ff8a8a",
    },
    background: "grape-soda",
  },
  {
    id: "sherbet",
    label: "Sherbet",
    dark: false,
    bg: "#fffaf6",
    fg: "#3a2b24",
    gutter: "#c9b4a6",
    title: "#8a7568",
    highlight: "#ff4f7b14",
    highlightBar: "#ff4f7b",
    line: "#3a2b2412",
    colors: {
      comment: "#a8948a",
      keyword: "#d42a5f",
      string: "#1a7a57",
      number: "#c25a0a",
      constant: "#c25a0a",
      function: "#9a4f00",
      type: "#5b3fd6",
      variable: "#3a2b24",
      property: "#2459c9",
      tag: "#d42a5f",
      operator: "#8a7568",
      regexp: "#b85a0a",
      heading: "#d42a5f",
      inserted: "#1a7a57",
      deleted: "#c0214f",
    },
    background: "sherbet",
  },
  {
    id: "licorice",
    label: "Licorice",
    dark: true,
    bg: "#141213",
    fg: "#f2ecea",
    gutter: "#4d4547",
    title: "#8e8486",
    highlight: "#ffffff12",
    highlightBar: "#ffd84d",
    line: "#ffffff12",
    colors: {
      comment: "#6f6567",
      keyword: "#ff6a8f",
      string: "#ffd84d",
      number: "#a6ebcf",
      constant: "#a6ebcf",
      function: "#f2ecea",
      type: "#a9c8ff",
      variable: "#d8cfcc",
      property: "#ffc08a",
      tag: "#ff6a8f",
      operator: "#9d9294",
      regexp: "#ffc08a",
      heading: "#ffd84d",
      inserted: "#a6ebcf",
      deleted: "#ff6a8f",
    },
    background: "licorice-gradient",
  },
  {
    id: "mint-julep",
    label: "Mint Julep",
    dark: false,
    bg: "#f4fcf8",
    fg: "#1f3a31",
    gutter: "#a7c9bb",
    title: "#5d7f72",
    highlight: "#5fd4a826",
    highlightBar: "#1a9a6f",
    line: "#1f3a3112",
    colors: {
      comment: "#86a89a",
      keyword: "#0f7a64",
      string: "#b3541e",
      number: "#7a4fd6",
      constant: "#7a4fd6",
      function: "#1c5fb8",
      type: "#0f7a64",
      variable: "#1f3a31",
      property: "#9a4f00",
      tag: "#0f7a64",
      operator: "#5d7f72",
      regexp: "#b3541e",
      heading: "#0f7a64",
      inserted: "#1a7a57",
      deleted: "#c0214f",
    },
    background: "mint-julep",
  },
  {
    id: "blueberry",
    label: "Blueberry",
    dark: true,
    bg: "#121a2f",
    fg: "#e3ebff",
    gutter: "#46557a",
    title: "#8d9bc2",
    highlight: "#4f8bff24",
    highlightBar: "#7fb0ff",
    line: "#ffffff12",
    colors: {
      comment: "#63739c",
      keyword: "#c9a0ff",
      string: "#a6ebcf",
      number: "#ffc08a",
      constant: "#ffc08a",
      function: "#7fb8ff",
      type: "#ffe991",
      variable: "#e3ebff",
      property: "#9fe3ff",
      tag: "#ff8fab",
      operator: "#a8b6db",
      regexp: "#ffe991",
      heading: "#7fb8ff",
      inserted: "#a6ebcf",
      deleted: "#ff8fab",
    },
    background: "blueberry-soda",
  },
  {
    id: "paper",
    label: "Paper",
    dark: false,
    bg: "#fbf7ef",
    fg: "#2a241f",
    gutter: "#c4b8a8",
    title: "#857866",
    highlight: "#ffd84d40",
    highlightBar: "#e0a800",
    line: "#2a241f12",
    colors: {
      comment: "#9d9281",
      keyword: "#2a241f",
      string: "#8a5a1c",
      number: "#2459c9",
      constant: "#2459c9",
      function: "#5b3fd6",
      type: "#1a7a57",
      variable: "#2a241f",
      property: "#6b5a4e",
      tag: "#c0214f",
      operator: "#857866",
      regexp: "#8a5a1c",
      heading: "#2a241f",
      inserted: "#1a7a57",
      deleted: "#c0214f",
    },
    background: "paper",
  },
  {
    id: "cotton-candy",
    label: "Cotton Candy",
    dark: false,
    bg: "#fdf5ff",
    fg: "#3b2a4a",
    gutter: "#cdb6dc",
    title: "#8a74a0",
    highlight: "#8b6cff1c",
    highlightBar: "#8b6cff",
    line: "#3b2a4a12",
    colors: {
      comment: "#a894b8",
      keyword: "#c0216f",
      string: "#0f7a8a",
      number: "#b85a0a",
      constant: "#b85a0a",
      function: "#5b3fd6",
      type: "#a0368f",
      variable: "#3b2a4a",
      property: "#2459c9",
      tag: "#c0216f",
      operator: "#8a74a0",
      regexp: "#b85a0a",
      heading: "#c0216f",
      inserted: "#1a7a57",
      deleted: "#c0214f",
    },
    background: "cotton-candy",
  },
  {
    id: "cocoa",
    label: "Cocoa",
    dark: true,
    bg: "#231a15",
    fg: "#f4e7d8",
    gutter: "#5e4b3e",
    title: "#a8907d",
    highlight: "#ffc08a1c",
    highlightBar: "#ffc08a",
    line: "#ffffff12",
    colors: {
      comment: "#86705f",
      keyword: "#ff9a6a",
      string: "#d6e59a",
      number: "#ffd27a",
      constant: "#ffd27a",
      function: "#ffc08a",
      type: "#e6b3ff",
      variable: "#f4e7d8",
      property: "#9ed8d0",
      tag: "#ff9a6a",
      operator: "#c4ab97",
      regexp: "#ffd27a",
      heading: "#ff9a6a",
      inserted: "#d6e59a",
      deleted: "#ff8a8a",
    },
    background: "caramel",
  },
];

const byId = new Map(CODE_THEMES.map((t) => [t.id, t]));

export function getCodeTheme(id: string): CodeTheme {
  return byId.get(id) ?? CODE_THEMES[0]!;
}

export function categoryColor(theme: CodeTheme, category: number): string {
  const name = CODE_CATEGORIES[category] ?? "plain";
  return theme.colors[name] ?? theme.fg;
}
