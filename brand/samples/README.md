# Sample screenshots

Demo input images for Shotcandy mocks, the README and the launch video. Each one is a
standalone HTML/CSS page in `src/`, rendered with Playwright at `deviceScaleFactor: 2`.
There is a PNG and a WebP (`cwebp -q 90`) of each.

| File | App (fictional) | CSS viewport | Pixel size |
| --- | --- | --- | --- |
| `sample-dashboard-light.png` / `.webp` | Quokka, product analytics dashboard, light | 1440×900 | 2880×1800 |
| `sample-editor-dark.png` / `.webp` | Fernleaf, notes and docs editor, dark | 1440×900 | 2880×1800 |
| `sample-mobile-habits.png` / `.webp` | Habitlane, habit tracker, phone portrait | 393×852 | 786×1704 |
| `sample-landing-hero.png` / `.webp` | Brightpond, SaaS landing page hero | 1440×900 | 2880×1800 |
| `sample-terminal-code.png` / `.webp` | Tidewater, code editor with terminal, dark | 1200×760 | 2400×1520 |
| `sample-kanban-light.png` / `.webp` | Marmalade, project board, light | 1440×900 | 2880×1800 |
| `sample-tablet-reader.png` / `.webp` | Inkwell, reading app, tablet landscape | 1180×820 | 2360×1640 |
| `sample-settings-dark.png` / `.webp` | Orbitkit, settings panel, dark | 1100×720 | 2200×1440 |

Everything here is made up. The product names, customer wordmarks, people, domains, numbers and
copy are invented, and no real brand, logo or UI is copied. Icons and illustrations are drawn inline
as SVG, and fonts load from Google Fonts. These samples are licensed MIT along with the rest of the project.

To re-render, open a file from `src/` in Playwright with the viewport listed above and
`deviceScaleFactor: 2`, then take a screenshot of the viewport.
