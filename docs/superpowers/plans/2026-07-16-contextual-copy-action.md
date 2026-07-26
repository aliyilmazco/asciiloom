# Contextual Copy Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute this plan task-by-task in the current session. Git commits and worktrees are intentionally excluded by the user's scope.

**Goal:** Replace the duplicate README and selected-output copy actions with one accessible button whose label follows the selected output format.

**Architecture:** Keep the existing output controller as the single owner of selected-format UI state. Add a copy label to the existing format metadata, remove the Markdown-only copy path, and reset transient copied feedback whenever a refresh changes the canonical button label.

**Tech Stack:** TypeScript, DOM APIs, Vitest with happy-dom, Playwright, Vite.

---

### Task 1: Lock the single-action UI contract

**Files:**

- Modify: `tests/ui-contract.test.ts`
- Modify: `tests/output-controller.test.ts`
- Modify: `tests/copied-feedback.test.ts`

- [x] **Step 1: Replace the duplicate-button assertions**

Assert that `#copyReadmeButton` is absent, `#copyButton` is the primary action, and its initial label is `Copy Markdown`.

- [x] **Step 2: Add contextual-label coverage**

Exercise the ASCII, Markdown, and SVG selectors and assert `Copy ASCII`, `Copy Markdown`, and `Copy SVG` respectively.

- [x] **Step 3: Replace two-button concurrency coverage**

Start a Markdown copy, switch to SVG before it resolves, and verify that copied feedback cannot restore the stale Markdown label after the SVG selection.

- [x] **Step 4: Run the focused tests and confirm the old implementation fails**

Run:

```bash
npx vitest run tests/ui-contract.test.ts tests/output-controller.test.ts tests/copied-feedback.test.ts
```

Expected: failures for the still-present `#copyReadmeButton`, `Copy Selected`, missing feedback reset behavior, and README-specific copy tests.

### Task 2: Implement one contextual copy action

**Files:**

- Modify: `index.html`
- Modify: `src/browser/output-controller.ts`
- Modify: `src/browser/copied-feedback.ts`

- [x] **Step 1: Remove the redundant HTML action**

Keep only this primary copy action beside Download:

```html
<button id="copyButton" class="button primary" type="button">Copy Markdown</button>
```

- [x] **Step 2: Add canonical copy labels to format metadata**

Use these labels:

```text
text     -> Copy ASCII
markdown -> Copy Markdown
svg      -> Copy SVG
```

- [x] **Step 3: Remove the Markdown-only copy function and listener**

Retain one handler that captures the selected format, copies `generated[format]`, and reports `Copied <format> output to clipboard.` on success.

- [x] **Step 4: Make transient feedback resettable**

Add `reset(button)` to the copied-feedback controller. It must cancel a pending timer, restore the saved canonical label, and do nothing when no feedback is active.

- [x] **Step 5: Reset copied feedback before every output UI refresh**

Call `copiedFeedback.reset(copyButton)` before applying the selected format's canonical label so output invalidation, regeneration, error display, collapsible refresh, and format switches cannot restore stale text later.

- [x] **Step 6: Run the focused tests**

Run:

```bash
npx vitest run tests/ui-contract.test.ts tests/output-controller.test.ts tests/copied-feedback.test.ts
```

Expected: all focused tests pass.

### Task 3: Verify the browser and release contracts

**Files:**

- Modify: `e2e/studio.e2e.ts`

- [x] **Step 1: Update the browser status assertion**

Expect `Copied markdown output to clipboard.` after the default Markdown copy action.

- [x] **Step 2: Check for obsolete references**

Run:

```bash
rg -n "copyReadmeButton|Copy README Markdown|Copy Selected|README-ready Markdown copied|README Markdown copy failed" index.html src e2e README.md
```

Expected: no matches.

- [x] **Step 3: Run static and unit verification**

Run:

```bash
npm run check
```

Expected: lockfile, typecheck, lint, formatting, and unit tests all pass.

- [x] **Step 4: Run the complete release gate**

Run:

```bash
npm run release:check
```

Expected: coverage, web and CLI builds, Chromium E2E, compiled CLI tests, example verification, dependency audit, and installed-tarball verification all pass without publishing.

## Self-review

- The plan preserves ASCII, Markdown, and SVG generation, copying, and downloads.
- It removes only the approved duplicate action and its unreachable special-case behavior.
- It covers the dynamic-label race caused by transient copied feedback.
- It introduces no programmatic API, package-content change, Git operation, or registry write.
