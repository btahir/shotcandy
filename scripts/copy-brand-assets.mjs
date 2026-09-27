#!/usr/bin/env node
/**
 * Copy runtime assets into public/ before dev/build. The copies are gitignored;
 * brand/ and the Fontsource packages stay the single sources of truth.
 *
 *   brand/backgrounds/*.webp          -> public/backgrounds/
 *   brand/backgrounds/thumbs/*.webp   -> public/backgrounds/thumbs/
 *   brand/samples/*.webp              -> public/samples/
 *   brand/samples/thumbs/*.webp       -> public/samples/thumbs/
 *   brand/empty/*.webp                -> public/empty/        (empty-state fan art)
 *   brand/icons/*                     -> public/icons/
 *   brand/og-image.png, brand/og/*    -> public/og/
 *   brand/logo-mark.svg               -> public/logo-mark.svg
 *   @fontsource* woff2 (latin, latin-ext) -> public/fonts/
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

const dirs = [
  ["brand/backgrounds", "public/backgrounds", /\.webp$/],
  ["brand/backgrounds/thumbs", "public/backgrounds/thumbs", /\.webp$/],
  ["brand/samples", "public/samples", /\.webp$/],
  ["brand/samples/thumbs", "public/samples/thumbs", /\.webp$/],
  ["brand/empty", "public/empty", /\.webp$/],
  ["brand/icons", "public/icons", /\.(png|svg|ico)$/],
  ["brand/og", "public/og", /\.png$/],
];

let n = 0;
for (const [from, to, re] of dirs) {
  if (!existsSync(from)) continue;
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) {
    if (!re.test(f)) continue;
    cpSync(join(from, f), join(to, f));
    n++;
  }
}

const files = [
  ["brand/og-image.png", "public/og/default.png"],
  ["brand/logo-mark.svg", "public/logo-mark.svg"],
];
for (const [from, to] of files) {
  if (!existsSync(from)) continue;
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
  n++;
}

// Self-hosted fonts (Fontsource, SIL OFL 1.1). Only latin + latin-ext subsets.
const fonts = [
  ["@fontsource-variable/figtree", ["figtree-latin-wght-normal", "figtree-latin-ext-wght-normal"]],
  [
    "@fontsource-variable/bricolage-grotesque",
    ["bricolage-grotesque-latin-opsz-normal", "bricolage-grotesque-latin-ext-opsz-normal"],
  ],
  [
    "@fontsource/geist-mono",
    [
      "geist-mono-latin-400-normal",
      "geist-mono-latin-500-normal",
      "geist-mono-latin-ext-400-normal",
      "geist-mono-latin-ext-500-normal",
    ],
  ],
];
mkdirSync("public/fonts", { recursive: true });
for (const [pkg, names] of fonts) {
  let root;
  try {
    root = dirname(require.resolve(`${pkg}/package.json`));
  } catch {
    console.warn(`font package ${pkg} not installed`);
    continue;
  }
  for (const name of names) {
    const src = join(root, "files", `${name}.woff2`);
    if (!existsSync(src)) {
      console.warn(`missing font file ${src}`);
      continue;
    }
    cpSync(src, join("public/fonts", `${name}.woff2`));
    n++;
  }
}

console.log(`copied ${n} runtime assets into public/`);
