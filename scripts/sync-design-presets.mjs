#!/usr/bin/env node
/**
 * Copy the design team's preset library (docs/design/presets/*.json, internal)
 * into committed engine data (src/engine/presets/data/*.json). Run after the
 * design changes: `node scripts/sync-design-presets.mjs`. Only engine-relevant
 * fields are kept; the output is sorted and stable so diffs stay readable.
 */
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "docs/design/presets";
const OUT = "src/engine/presets/data";
const read = (f) => JSON.parse(readFileSync(`${SRC}/${f}`, "utf8"));
const write = (f, data) => writeFileSync(`${OUT}/${f}`, JSON.stringify(data, null, 2) + "\n");

const shadows = read("shadows.json").shadows.map(({ id, name, description, layers }) => ({
  id,
  name,
  ...(description ? { description } : {}),
  layers: layers.map(({ x, y, blur, spread, opacity }) => ({ x, y, blur, spread, opacity })),
}));

const bg = read("backgrounds.json");
const backgrounds = {
  groups: bg.groups,
  backgrounds: bg.backgrounds.map(({ id, name, group, tone, fill, grain }) => ({
    id,
    name,
    group,
    tone,
    fill,
    grain,
  })),
};

const presets = read("presets.json");
const styles = {
  default: presets.default,
  families: presets.families,
  presets: presets.presets.map(({ id, name, family, description, suits, patch }) => ({
    id,
    name,
    family,
    ...(description ? { description } : {}),
    ...(suits ? { suits } : {}),
    patch,
  })),
};

write("shadows.json", { shadows });
write("backgrounds.json", backgrounds);
write("styles.json", styles);
console.log(
  `synced ${shadows.length} shadows, ${backgrounds.backgrounds.length} backgrounds, ${styles.presets.length} styles`,
);
