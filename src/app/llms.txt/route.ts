import { COMPARE_PAGES, GITHUB_URL, SITE_URL, TOOL_PAGES } from "@/config/site";
import { STYLE_PRESETS } from "@/engine/presets/styles";
import { CODE_LANGUAGE_COUNT } from "@/lib/jsonld";

export const dynamic = "force-static";

/** /llms.txt (llmstxt.org): a plain summary with links to every page that exists. */
export function GET() {
  const link = (p: { href: string; label: string; blurb: string }) =>
    `- [${p.label}](${SITE_URL}${p.href}): ${p.blurb}`;
  const body = `# Shotcandy

> Shotcandy is a free, open-source (MIT) screenshot beautifier that runs entirely in the browser. Nothing is uploaded and there are no accounts.

It turns screenshots and screen recordings into share-ready images and videos: ${STYLE_PRESETS.length} one-click styles, gradient, mesh and wallpaper backgrounds, macOS window, browser, phone, tablet, laptop and design canvas frames, shadows, 3D tilt, annotations, and blur, pixelate or solid-box redaction. It also makes code screenshots (${CODE_LANGUAGE_COUNT} languages), social post images and App Store screenshot sets at Apple's sizes. Batch mode styles up to 100 screenshots at once (30 on a phone) and exports a ZIP or writes into a folder. Multi-screen designs put 2 to 6 screenshots in one image (side by side, overlap, hero, cascade, fan, grid). Exports: PNG, JPEG or WebP at 1x to 4x; MP4, WebM or GIF.

## Tools
${TOOL_PAGES.map(link).join("\n")}

## Comparisons
${COMPARE_PAGES.map(link).join("\n")}

## Project
- [About and FAQ](${SITE_URL}/about/)
- [All tools](${SITE_URL}/tools/)
- [Source code (MIT)](${GITHUB_URL})
- [Changelog](${GITHUB_URL}/blob/main/CHANGELOG.md)
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
