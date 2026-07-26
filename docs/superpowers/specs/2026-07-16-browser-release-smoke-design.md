# Browser Release Smoke Design

## Goal

Protect the production browser studio with a real Chromium smoke test that runs inside the existing release gate without changing the converter, CLI, or published npm contents.

## Approach

Use `@playwright/test` with a dedicated `playwright.config.ts` and `e2e/` suite. Playwright will start `vite preview` against the already-built `dist` directory, use the configured `BASE_PATH`, and run one Chromium project with a single worker for deterministic release behavior.

The release gate will install the matching Chromium build idempotently before the test. GitHub Actions release and Pages jobs will install Chromium plus Linux system dependencies explicitly before invoking the same gate.

## Smoke Contract

The suite will verify:

- the production page reaches its first successful ASCII render without console or page errors;
- the logo preset updates width, dithering, edge controls, and structural output;
- ASCII, Markdown, and SVG output selection exposes the expected serialized content;
- clipboard and download actions reach their successful browser states;
- a 390 by 844 viewport has no page-level or preview-level horizontal overflow;
- normal root builds and GitHub Pages repository subpaths use the same test logic.

## Tooling Boundaries

- Playwright files use `*.e2e.ts`, so Vitest does not collect them.
- A dedicated TypeScript config checks the Playwright config and suite.
- Browser reports and test results are ignored by Git and Prettier.
- The npm tarball remains CLI-only; Playwright stays a development dependency.
- No Git commit or live publish is part of this change.

## Failure Behavior

Any browser launch, preview startup, console error, render timeout, interaction failure, download failure, or overflow assertion fails `npm run release:check`, which also blocks `prepack`.
