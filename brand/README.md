# Shotcandy brand assets

Everything here is original work for Shotcandy and released under the project's MIT license.

## Logo

| File | Use |
|---|---|
| `logo.svg` | Horizontal lockup (mark + wordmark) on light backgrounds |
| `logo-dark-bg.svg` | Same lockup with cream wordmark, for dark backgrounds |
| `logo-mark.svg` | The wrapped-sweet mark alone, full colour |
| `logo-mark-mono.svg` | One-colour mark (`currentColor`) for stamps, favicons in monochrome contexts |
| `wordmark.svg` / `wordmark-light.svg` | "shotcandy" in Bricolage Grotesque ExtraBold, outlined to paths (ink / cream) |

The mark is a boiled sweet whose body is a tiny window (three dots = window controls), wrapped in tangerine paper. The wordmark is always lowercase.

- **Clear space**: at least the height of the mark's body (≈ half the mark height) on every side.
- **Minimum size**: mark 16 px (favicon); lockup 96 px wide.
- **Colours**: strawberry body `#FF6A8F → #E23A66`, tangerine wrapper `#FF9A3C → #E07A22`, ink wordmark `#2A1F1A`, cream wordmark `#FBEFE4`.
- **Don't** recolour the mark with other candy colours, add outlines or drop shadows to the lockup, set the wordmark in another font, or put the full-colour mark on busy photos without a cream plate.

## Icons (`icons/`)

`favicon.svg`, `favicon.ico` (16/32/48), `favicon-{16,32,48}.png`, `apple-touch-icon.png` (180, full-bleed cream), `icon-192.png`, `icon-512.png` (cream squircle), `icon-dark-512.png` (cocoa squircle), `icon-maskable-512.png` (safe-zone padded for Android masks). SVG sources: `app-icon*.svg`, `apple-touch-icon.svg`.

## Open Graph

`og-image.png` (1200 × 630) is the default social card: cream dotted paper, lockup, "Make your screenshots look lovely", and two sample compositions. Per-page cards follow the same template with a different headline and preset.

## Other folders

- `backgrounds/`: 12 wallpapers (2560 × 1440 WebP) plus thumbnails; see its README.
- `frames/`: our own vector window and device frames plus `frames.json`, the drawing constants the renderer follows.
- `samples/`: fictional app screenshots for demos, built in HTML (`samples/src/`).
