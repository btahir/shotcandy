#!/usr/bin/env node
/**
 * Minimal zero-dependency static file server for the exported site (`out/`).
 * Proves the build needs no Next.js server: plain files only.
 *
 *   node scripts/serve-static.mjs [dir=out] [port=4173]
 */
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "out");
const port = Number(process.env.PORT ?? process.argv[3] ?? 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".webmanifest": "application/manifest+json",
  ".map": "application/json",
};

function fileFor(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  let p = join(root, clean);
  if (!p.startsWith(root)) return null;
  try {
    const st = statSync(p);
    if (st.isDirectory()) p = join(p, "index.html");
    statSync(p);
    return p;
  } catch {
    try {
      statSync(`${p}.html`);
      return `${p}.html`;
    } catch {
      return null;
    }
  }
}

createServer((req, res) => {
  const path = fileFor(req.url ?? "/");
  if (!path) {
    const nf = fileFor("/404.html");
    res.writeHead(404, { "content-type": TYPES[".html"] });
    if (nf) createReadStream(nf).pipe(res);
    else res.end("Not found");
    return;
  }
  res.writeHead(200, {
    "content-type": TYPES[extname(path)] ?? "application/octet-stream",
    "cache-control": "no-cache",
  });
  createReadStream(path).pipe(res);
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}`);
});
