#!/usr/bin/env node
/**
 * Copy runtime brand assets into public/ before dev/build (the copies are
 * gitignored; brand/ stays the single committed source).
 *   brand/backgrounds/*.webp        -> public/backgrounds/
 *   brand/backgrounds/thumbs/*.webp -> public/backgrounds/thumbs/
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";

const pairs = [
  ["brand/backgrounds", "public/backgrounds"],
  ["brand/backgrounds/thumbs", "public/backgrounds/thumbs"],
];
let n = 0;
for (const [from, to] of pairs) {
  if (!existsSync(from)) continue;
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) {
    if (!f.endsWith(".webp")) continue;
    cpSync(`${from}/${f}`, `${to}/${f}`);
    n++;
  }
}
console.log(`copied ${n} brand assets into public/`);
