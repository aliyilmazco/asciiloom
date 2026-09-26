# Changelog

All notable changes to Charosaic are recorded here.

## [Unreleased]

### Fixed

- Wide Braille renders in the browser no longer fail the prepared-canvas pixel limit.
- Dependency audit: `sharp` 0.35.4 and `vitest` 4.1.11.

## [1.0.0] - 2026-08-25

### Added

- Local-first browser studio for converting images into README-safe ASCII, Markdown, and accessible SVG.
- Shared TypeScript conversion core and scriptable `charosaic` CLI.
- Strict ASCII presets plus opt-in Fine Blocks, Braille, and Structural Unicode styles.
- Deterministic dithering, alpha-safe compositing, bounded image processing, safe Markdown fences, and atomic CLI output writes.
- Browser-local saved presets with versioned import/export and no analytics, uploads, or remote image API.
- Reproducible unit, browser, CLI, package, example, coverage, dependency-audit, and Chromium release checks.
