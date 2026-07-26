# Mobile UI/UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve mobile touch accessibility, supporting-text readability, output density, destructive-action clarity, and browser-chrome color without changing application behavior.

**Architecture:** Keep the existing HTML structure and TypeScript application untouched. Express the changes through one metadata edit and scoped CSS rules, protected by static UI contract tests and real-browser responsive smoke checks.

**Tech Stack:** HTML, CSS, TypeScript, Vitest, Vite, in-app browser smoke testing

---

## File map

- Modify `tests/ui-contract.test.ts`: encode the approved visual and responsive contracts.
- Modify `index.html`: align browser theme color with the CSS background token.
- Modify `src/style.css`: implement persistent danger styling, mobile/coarse touch sizing, readable supporting type, and shorter mobile output surfaces.
- Modify `docs/superpowers/specs/2026-07-10-mobile-ui-ux-polish-design.md`: mark the approved design implemented after all verification passes.

### Task 1: Add failing UI contracts

**Files:**

- Test: `tests/ui-contract.test.ts`

- [x] **Step 1: Update the browser-chrome assertion and add mobile polish assertions**

```ts
expect(html).toContain('<meta name="theme-color" content="#020201" />');
expect(css).toMatch(
  /\.row-action\.delete\s*\{[^}]*border-color:\s*#9d4b4b;[^}]*color:\s*var\(--danger\);/su,
);
expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.button,[\s\S]*?min-height:\s*44px;/u);
expect(css).toMatch(/@media \(pointer: coarse\)[\s\S]*?\.button,[\s\S]*?min-height:\s*44px;/u);
expect(css).toContain('@media (max-width: 640px), (max-width: 980px) and (max-height: 500px)');
expect(css).toMatch(/\.dropdown-meta,[\s\S]*?font-size:\s*0\.68rem;/u);
expect(css).toMatch(/\.preview-frame\s*\{[^}]*min-height:\s*240px;/u);
expect(css).toMatch(
  /#output\s*\{[^}]*min-height:\s*min\(180px, 42dvh\);[^}]*max-height:\s*42dvh;/u,
);
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run tests/ui-contract.test.ts`

Expected: failures for the old `#080a0d` theme color, missing persistent delete rule, missing 44-pixel target groups, and old 300-pixel mobile output heights.

### Task 2: Implement the approved HTML/CSS polish

**Files:**

- Modify: `index.html:6`
- Modify: `src/style.css:360-370`
- Modify: `src/style.css:978-1051`

- [x] **Step 1: Align browser chrome**

```html
<meta name="theme-color" content="#020201" />
```

- [x] **Step 2: Make Delete persistently destructive**

```css
.row-action.delete {
  border-color: #9d4b4b;
  color: var(--danger);
}

.row-action.delete:hover,
.row-action.delete:focus-visible {
  border-color: var(--danger);
  color: #ffaaa3;
}
```

- [x] **Step 3: Add mobile touch, type, and output-density rules**

Inside `@media (max-width: 640px)` add the touch-target rules. Apply the typography and output-density rules in a combined `@media (max-width: 640px), (max-width: 980px) and (max-height: 500px)` block so compact phone landscape receives the same treatment:

```css
.button,
.row-action,
.preset-select,
.tab,
input[type='text'],
input[type='color'],
input[type='range'],
.switch-field {
  min-height: 44px;
}

.button,
.row-action,
.tab,
.field > span,
.field small,
.preset-notice,
.status-pill,
.format-hint,
.result-meta {
  font-size: 0.75rem;
}

.dropdown-meta,
.dropdown-value small,
.dropdown-option-copy small,
.dropdown-option-state,
.preset-state {
  font-size: 0.68rem;
}

.preview-frame {
  min-height: 240px;
}

#output {
  min-height: min(180px, 42dvh);
  max-height: 42dvh;
}
```

Inside `@media (pointer: coarse)` add the same touch-target selector group with `min-height: 44px` so touch-sized controls do not depend on viewport width.

- [x] **Step 4: Run focused verification and verify GREEN**

Run: `npx prettier --write index.html src/style.css tests/ui-contract.test.ts && npx vitest run tests/ui-contract.test.ts && npm run typecheck && npm run lint`

Expected: the UI contract suite passes, TypeScript reports no errors, and Oxlint reports no warnings.

### Task 3: Validate release and responsive behavior

**Files:**

- Modify: `docs/superpowers/specs/2026-07-10-mobile-ui-ux-polish-design.md`
- Modify: `docs/superpowers/plans/2026-07-10-mobile-ui-ux-polish.md`

- [x] **Step 1: Run the full release gate**

Run: `npm run release:check`

Expected: lockfile, typecheck, lint, format, unit/DOM tests, coverage, web/CLI builds, compiled CLI tests, and golden examples all pass.

- [x] **Step 2: Run browser smoke checks**

Run `npm run preview -- --host 127.0.0.1 --port 4174 --strictPort`, then inspect 375x812 and 812x375 viewports.

Expected:

- document scroll width does not exceed viewport width;
- targeted buttons, preset actions, tabs, inputs, switches, and ranges are at least 44 pixels tall at 375 pixels;
- preview minimum height is 240 pixels; selected output is 180 pixels in portrait and resolves `min(180px, 42dvh)` in compact landscape (157.5 pixels at 812×375);
- dropdown bounds remain within the viewport;
- browser console contains no errors or warnings.

- [x] **Step 3: Mark documents complete**

Change the design status to `Implemented and verified` and check every completed plan item.

- [x] **Step 4: Run the final formatting check**

Run: `npm run format:check`

Expected: every tracked source and documentation file matches Prettier formatting.

## Repository note

This workspace has no `.git` metadata, so commit steps are intentionally omitted. Do not initialize a repository or claim commit/push/PR completion.
