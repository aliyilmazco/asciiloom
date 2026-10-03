# Changelog

All notable changes to AsciiLoom are recorded here.

## [Unreleased]

### Added

- README screenshots of the browser studio and output-result gallery (`readme`, `shape`, `braille`, `structure`, CLI text, and SVG) under `docs/images/`.

## [1.0.0] - 2026-10-03

First public release of AsciiLoom (developed under the working name Charosaic).

### Added

- Local-first browser studio for converting images into README-safe ASCII, Markdown, and accessible SVG, live at <https://asciiloom.aliyilmaz.co>.
- Shared TypeScript conversion core and scriptable `asciiloom` CLI, with `--version` / `-v` to print the installed version.
- Strict ASCII presets plus opt-in Fine Blocks, Braille, and Structural Unicode styles.
- `shape` strict-ASCII style: each character cell is sampled as a 3×4 grid and matched against the measured ink layout of all 95 printable ASCII glyphs, so outlines, diagonals, and curves follow the source image instead of only its average tone.
- `calibrated` (14 levels) and `alphanumeric` strict-ASCII styles built from glyph ink coverage measured in Menlo, SF Mono, and Courier New, plus a Unicode `bars` style.
- Popular community styles and named ramps: `classic` (Paul Bourke 10-level), `jp2a`, `bubbles`, `matrix` (binary digits), and `silhouette` (two-level `#` stencil).
- Perceptual (CIE L\*) tone quantization against each glyph's measured ink, so midtones and uneven ramps track the source image.
- Aspect-correct preview and SVG export: rows are spaced one em apart, cells follow the configured cell aspect, and SVG rows are pinned to the grid with `textLength`.
- Deterministic dithering, alpha-safe compositing, bounded image processing, safe Markdown fences, and atomic CLI output writes.
- Browser-local saved presets with versioned import/export and no analytics, uploads, or remote image API.
- Reproducible unit, browser, CLI, package, example, coverage, dependency-audit, and Chromium release checks.
- Requires Node.js 22.12 or a later even-numbered release.
