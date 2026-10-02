# Changelog

All notable changes to AsciiLoom are recorded here.

## [Unreleased]

### Added

- `shape` strict-ASCII style: each character cell is sampled as a 3×4 grid and matched against the measured ink layout of all 95 printable ASCII glyphs, so outlines, diagonals, and curves follow the source image instead of only its average tone.
- `calibrated` (14 levels) and `alphanumeric` strict-ASCII styles built from glyph ink coverage measured in Menlo, SF Mono, and Courier New, plus a Unicode `bars` style.
- Popular community styles and named ramps: `classic` (Paul Bourke 10-level), `jp2a`, `bubbles`, `matrix` (binary digits), and `silhouette` (two-level `#` stencil).

### Changed

- Project renamed from Charosaic to AsciiLoom: the npm package and CLI executable are now `asciiloom`, the repository moved to `aliyilmazco/asciiloom`, the Cloudflare Worker is named `asciiloom`, and browser presets are stored under `asciiloom.custom-presets.v1` (presets saved under the old `charosaic.custom-presets.v1` key are not carried over).
- Cells are quantized in perceptual lightness (CIE L\*) instead of linear luminance, so midtones no longer collapse onto dark glyphs and output tracks the source image more closely. Rendered output differs from 1.0.0.
- `readme`, `soft`, and `minimal` ramps reorder glyph pairs (`%#`, `+=`, `-:`) that were inverted in every measured font.
- Node.js 20 is no longer supported; the minimum is now Node.js 22.12. Vitest 5 and `@vitest/coverage-v8` 5 require it.

### Fixed

- Every style now keeps the source image's proportions: the browser preview and SVG export space rows one em apart and size each cell to the configured cell aspect, and SVG rows are pinned to that grid with `textLength`. Previously the preview squashed art to ~60% of its height (the 960×600 demo showed at 0.39 height/width instead of 0.63) and row gaps split block glyphs into stripes. `SvgOptions.lineHeight` is replaced by `cellAspectRatio`.
- Braille output uses U+2800 for empty cells instead of ASCII spaces, which rendered in a different-width font and shifted dots out of column on every row.
- `bars` and `blocks-fine` place partial blocks from where ink sits inside each cell (8 sub-strips), not the cell average alone, so edges no longer stair-step or appear on the wrong side of the cell.
- Tone ramps quantize against each glyph's measured ink instead of its ramp position, so uneven or non-monotonic ramps (`classic`, `jp2a`, `bubbles`, `matrix`) render the same tones as the source.
- `shape` diffuses tone error between cells, so smooth gradients render as texture instead of flat bands.
- Wide Braille renders in the browser no longer fail the prepared-canvas pixel limit.
- Text files, including the golden example outputs, are checked out with LF line endings on every platform via `.gitattributes`, so Windows checkouts match the CLI's byte-for-byte output.
- Dependency audit: `sharp` 0.35.4 and `vitest` 4.1.11.

## [1.0.0] - 2026-08-25

### Added

- Local-first browser studio for converting images into README-safe ASCII, Markdown, and accessible SVG.
- Shared TypeScript conversion core and scriptable `charosaic` CLI.
- Strict ASCII presets plus opt-in Fine Blocks, Braille, and Structural Unicode styles.
- Deterministic dithering, alpha-safe compositing, bounded image processing, safe Markdown fences, and atomic CLI output writes.
- Browser-local saved presets with versioned import/export and no analytics, uploads, or remote image API.
- Reproducible unit, browser, CLI, package, example, coverage, dependency-audit, and Chromium release checks.
