# Browser Release Smoke Implementation Plan

> **For agentic workers:** Implement inline in this workspace. Git steps are intentionally omitted because the user excluded Git operations.

**Goal:** Add a production Chromium smoke test to the existing release gate.

**Architecture:** Playwright serves the built Vite output through `vite preview`, derives its URL from `BASE_PATH`, and exercises the browser studio through accessible locators. Existing unit, CLI, package, and Pages verification remain intact.

**Tech Stack:** TypeScript, Vite, Playwright Test, GitHub Actions

---

### Task 1: Add isolated Playwright tooling

**Files:**

- Create: `playwright.config.ts`
- Create: `tsconfig.e2e.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`
- Modify: `.prettierignore`

- [x] Add `@playwright/test` as a development dependency.
- [x] Add browser-install, standalone E2E, and built-E2E scripts.
- [x] Add the E2E TypeScript project to `npm run typecheck`.
- [x] Configure one Chromium worker, production preview startup, failure artifacts, and `BASE_PATH` support.
- [x] Ignore generated Playwright reports and results.
- [x] Run TypeScript, lint, and format checks.

### Task 2: Write the production browser smoke suite

**Files:**

- Create: `e2e/studio.e2e.ts`

- [x] Write the desktop first-render test and confirm it fails before the browser dependency/configuration is complete.
- [x] Cover the logo preset, structural edge output, output formats, copy, and download actions.
- [x] Add the 390 by 844 overflow test.
- [x] Capture page and console errors as test failures.
- [x] Install Chromium and run `npm run test:e2e` until the suite passes.

### Task 3: Make E2E a release invariant

**Files:**

- Modify: `package.json`
- Modify: `scripts/verify-package.mjs`
- Modify: `tests/package-verification.test.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/pages.yml`
- Modify: `README.md`

- [x] Insert built E2E verification after the production build in `release:check`.
- [x] Update manifest-contract tests to reject a weakened browser release gate.
- [x] Install Chromium system dependencies in the release and Pages CI jobs.
- [x] Document local browser installation behavior and release coverage.
- [x] Run focused package-verification tests.

### Task 4: Verify the complete result

- [x] Run `npm run test:e2e`.
- [x] Run `npm run release:check` on Node 22.23.
- [x] Run `npm run release:check` on Node 20.19.
- [x] Confirm the tarball still contains exactly 13 CLI-only files.
- [x] Confirm no Playwright report, test result, tarball, or preview process remains.
