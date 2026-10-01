# Changelog

All notable changes to Shotcandy. The live site at [shotcandy.app](https://shotcandy.app) always runs the latest version.

## v0.2.0 (2026-09-30)

### Added

- **Batch mode.** Drop, paste or add several screenshots, or a whole folder: up to 100 on a computer, 30 on a phone. They share one style, and the All / This image switch changes one image without touching the rest. Export all saves a ZIP, writes into a folder in Chrome and Edge on a computer, or goes to the share sheet on a phone. Files keep their original names, and the batch survives a reload.
- **Multi-screen designs.** Put 2 to 6 screenshots in one image in six layouts: Side by side, Overlap, Hero, Cascade, Fan and Grid. Drag images onto screens to fill, replace or swap them, or select 2 to 6 images in a batch and choose Combine into one design.
- **New pages** on the site: a batch screenshot editor, multi-screen mockups, redaction, App Store screenshots (with Apple's size table), a tools index, and fair comparisons with Shots.so, Screely and other tools. Their drop zones open the editor in the right mode.
- Site links can now open several images at once, pick a layout (`?layout=`), or arm the blur tool (`?tool=redact`).

### Fixed

- Blur, pixelate and other marks stay on the part of the image they were drawn on when that image sits in a grid cell, and new marks start on the part of the cell that shows.
- Keyboard focus, screen reader announcements and phone layout details across the new batch and screens controls.

### Also since v0.1.0

- Screen recordings: style MP4, MOV and WebM recordings like screenshots, trim them and export MP4, WebM or GIF (2026-09-28).
- A design canvas frame and a Minimal style family (2026-09-28).
- The caption card for tall canvases (2026-09-27).
- Our own support page (2026-09-27).

## v0.1.0 (2026-09-26)

The first public release.

- Paste, drop or pick a screenshot and it lands already styled. 36 one-click styles (42 by v0.2.0), gradient, mesh and wallpaper backgrounds, colours picked from your own screenshot, and Candy Shuffle.
- Our own vector frames: macOS window, browser, phone, tablet and laptop.
- Annotations: text, arrows, highlights, blur and pixelate.
- Motion presets exported as MP4, WebM or GIF, rendered frame by frame by the same engine as the stills.
- Code images, post and testimonial cards, and App Store screenshot sets at Apple's sizes.
- Export by destination (X, LinkedIn, Instagram, Product Hunt and more) at 1× to 4×, or copy to the clipboard.
- Everything runs in the browser: no account, no upload, no watermark. MIT licensed.
