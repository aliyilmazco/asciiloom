# Custom Dropdown Implementation Plan

**Implementation status:** Completed and verified on 2026-07-10.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all native selects with an accessible Command Panel custom dropdown while preserving the existing conversion and preset behavior.

**Architecture:** Add one framework-free controller that owns select-only combobox DOM, value synchronization, keyboard navigation, typeahead, popup placement, and teardown. Keep current values in hidden named inputs so existing render listeners and form contracts remain stable; wire preset composition in `main.ts` and ramp/dither composition in `controls.ts`.

**Tech Stack:** TypeScript 7, Vite 8, semantic HTML/ARIA, CSS, Vitest 4, happy-dom.

---

## File map

- Create `src/browser/dropdown.ts`: reusable dropdown behavior and rendering.
- Create `tests/dropdown.test.ts`: pointer, keyboard, ARIA, typeahead, and teardown tests.
- Modify `index.html`: three custom dropdown shells and hidden named inputs.
- Modify `src/browser/controls.ts`: ramp/dither controllers and value integration.
- Modify `src/main.ts`: preset controller integration and custom-state synchronization.
- Modify `src/style.css`: Command Panel visual states and responsive popup sizing.
- Modify `tests/browser-controls.test.ts`: conversion-control integration fixtures.
- Modify `tests/ui-contract.test.ts`: no-native-select and ARIA shell contracts.

### Task 1: Lock the non-native and accessible markup contract

**Files:**

- Modify: `tests/ui-contract.test.ts`
- Create: `tests/dropdown.test.ts`

- [x] **Step 1: Add failing static markup assertions**

```ts
expect(html).not.toMatch(/<select\b/u);
for (const id of ['preset', 'ramp', 'dither']) {
  expect(html).toContain(`id="${id}"`);
  expect(html).toContain(`data-dropdown="${id}"`);
  expect(html).toContain(`aria-controls="${id}Listbox"`);
}
expect(html.match(/role="combobox"/gu)).toHaveLength(3);
expect(html.match(/role="listbox"/gu)).toHaveLength(3);
```

- [x] **Step 2: Add failing controller behavior tests**

Create a happy-dom fixture containing one hidden input, trigger, value elements, popup, and listbox. Assert initial ARIA state, click open, ArrowDown movement, Enter commit and bubbling input, Escape close, Home/End, prefix typeahead, outside-click close, and programmatic non-selectable display state.

- [x] **Step 3: Confirm the red state**

Run: `npx vitest run tests/dropdown.test.ts tests/ui-contract.test.ts`

Expected: failure because native selects remain and `src/browser/dropdown.ts` does not exist.

### Task 2: Implement the reusable dropdown controller

**Files:**

- Create: `src/browser/dropdown.ts`
- Test: `tests/dropdown.test.ts`

- [x] **Step 1: Define focused public types**

```ts
export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
  preview?: string;
  selectable?: boolean;
}

export interface DropdownController {
  readonly input: HTMLInputElement;
  readonly trigger: HTMLButtonElement;
  get value(): string;
  setValue(value: string): void;
  open(): void;
  close(options?: { restoreFocus?: boolean }): void;
  destroy(): void;
}

export function createDropdown(
  document: Document,
  id: string,
  options: readonly DropdownOption[],
): DropdownController;
```

- [x] **Step 2: Render and synchronize options**

Resolve the static shell by stable IDs, reject empty/duplicate options, render selectable rows as `role="option"`, keep the hidden input authoritative, update trigger label/description/preview, and set `aria-selected`/`aria-activedescendant`.

- [x] **Step 3: Implement interaction**

Click toggles the popup. Arrow keys, Home/End, Enter/Space, Escape, Tab, and prefix typeahead follow the design spec. Commit updates the hidden input and dispatches `new Event('input', { bubbles: true })`. Document `pointerdown` closes outside and naturally closes another open instance.

- [x] **Step 4: Implement placement and teardown**

On open, measure the trigger and popup and toggle `opens-up` when the available space above is greater than below and below is insufficient. `destroy()` removes listeners and leaves the controller closed.

- [x] **Step 5: Pass controller tests**

Run: `npx vitest run tests/dropdown.test.ts`

Expected: all custom-dropdown tests pass.

### Task 3: Replace HTML select surfaces and add Command Panel styling

**Files:**

- Modify: `index.html`
- Modify: `src/style.css`
- Test: `tests/ui-contract.test.ts`

- [x] **Step 1: Replace each select with the static shell**

Each field keeps its existing label text and hidden form contract:

```html
<div class="dropdown" data-dropdown="preset">
  <input id="preset" name="builtInPreset" type="hidden" value="readme" />
  <button
    id="presetTrigger"
    class="dropdown-trigger"
    type="button"
    role="combobox"
    aria-haspopup="listbox"
    aria-expanded="false"
    aria-controls="presetListbox"
  >
    <span class="dropdown-rail" aria-hidden="true"></span>
    <span class="dropdown-value"
      ><strong id="presetValue"></strong><small id="presetValueDescription"></small
    ></span>
    <span class="dropdown-chevron" aria-hidden="true"></span>
  </button>
  <div id="presetPopover" class="dropdown-popover" hidden>
    <div id="presetListbox" class="dropdown-listbox" role="listbox"></div>
  </div>
</div>
```

Use matching shells and existing names for `ramp`/`characterRamp` and `dither`/`dither`.

- [x] **Step 2: Add the approved visual system**

Implement the 44px desktop/48px mobile trigger, yellow rail, divided chevron cell, stronger border, dark popup, selected/active option accents, prompt/check markers, bounded scrolling, `opens-up`, mobile width, and reduced-motion-compatible transitions. Remove the obsolete global select styling.

- [x] **Step 3: Pass static contract tests**

Run: `npx vitest run tests/ui-contract.test.ts`

Expected: no native select markup remains and three combobox/listbox shells are present.

### Task 4: Integrate ramp and dither values with conversion controls

**Files:**

- Modify: `src/browser/controls.ts`
- Modify: `tests/browser-controls.test.ts`

- [x] **Step 1: Convert the happy-dom fixture to hidden inputs and shells**

The fixture uses `#ramp` and `#dither` hidden inputs plus matching dropdown shells, then asserts `apply()` changes both the hidden value and visible controller label.

- [x] **Step 2: Define concise option metadata**

```ts
export const RAMP_ENTRIES = [
  {
    value: 'readme',
    label: 'README safe',
    description: 'Portable punctuation set',
    preview: RAMPS.readme,
  },
  {
    value: 'detailed',
    label: 'Detailed',
    description: 'Smoother tonal steps',
    preview: RAMPS.detailed,
  },
  { value: 'soft', label: 'Soft', description: 'Gentle gradients', preview: RAMPS.soft },
  { value: 'minimal', label: 'Minimal', description: 'Bold silhouettes', preview: RAMPS.minimal },
  {
    value: 'blocks',
    label: 'Unicode blocks',
    description: 'Compact high contrast',
    preview: RAMPS.blocks,
  },
] as const;
```

Add equivalent metadata for none, Atkinson, Floyd-Steinberg, and Bayer.

- [x] **Step 3: Integrate controllers**

Create ramp/dither dropdowns inside `createConversionControls`, expose their hidden inputs in `renderInputs`, read from those inputs, call controller `setValue()` from `apply()`, and expose `dispose()` to destroy both controllers.

- [x] **Step 4: Pass conversion tests**

Run: `npx vitest run tests/browser-controls.test.ts tests/dropdown.test.ts`

Expected: option reads/writes and render event targets remain correct.

### Task 5: Integrate built-in presets and custom state

**Files:**

- Modify: `src/main.ts`
- Modify: `tests/ui-contract.test.ts`

- [x] **Step 1: Compose preset options**

Create the preset dropdown from one non-selectable `custom` display state plus `PRESETS.map(({ id, label, description }) => ({ value: id, label, description }))`.

- [x] **Step 2: Replace direct select mutations**

Use `presetDropdown.setValue(id)` in `applyPreset()` and `presetDropdown.setValue('custom')` in one `markPresetCustom()` helper. The helper also sets `presetDescription.textContent = 'Custom settings. Adjusted from a built-in or saved preset.'`.

- [x] **Step 3: Preserve event behavior and teardown**

Listen for `input` on the hidden preset input, keep conversion inputs on their existing bubbling input path, and destroy preset plus conversion dropdown controllers on `pagehide`.

- [x] **Step 4: Verify focused integration**

Run: `npx vitest run tests/ui-contract.test.ts tests/browser-controls.test.ts tests/preset-controller.test.ts tests/dropdown.test.ts`

Expected: all focused tests pass.

### Task 6: Format, type-check, build, and visually verify

**Files:**

- Modify as needed only within the custom-dropdown scope.

- [x] **Step 1: Format changed source and tests**

Run: `npx prettier --write index.html src/style.css src/main.ts src/browser/controls.ts src/browser/dropdown.ts tests/ui-contract.test.ts tests/browser-controls.test.ts tests/dropdown.test.ts docs/superpowers/specs/2026-07-10-custom-dropdown-design.md docs/superpowers/plans/2026-07-10-custom-dropdown.md`

- [x] **Step 2: Run objective gates**

Run: `npm run typecheck && npx vitest run tests/dropdown.test.ts tests/browser-controls.test.ts tests/ui-contract.test.ts tests/preset-controller.test.ts && npm run build:web`

Expected: all commands pass.

Run: `npm run check`

Expected: the complete repository check passes without lint failures.

- [x] **Step 3: Verify the real browser UI**

At desktop and mobile widths, open all three dropdowns and verify custom dark popup rendering, above/below placement, mouse selection, keyboard selection, outside click, no horizontal overflow, correct live rendering, and no console errors.

- [x] **Step 4: Record the checkpoint when Git metadata is restored**

```bash
git add index.html src/style.css src/main.ts src/browser/controls.ts src/browser/dropdown.ts tests/dropdown.test.ts tests/browser-controls.test.ts tests/ui-contract.test.ts docs/superpowers/specs/2026-07-10-custom-dropdown-design.md docs/superpowers/plans/2026-07-10-custom-dropdown.md
git commit -m "feat: replace native selects with custom dropdowns"
```

Current checkout behavior: skip only the commit because `.git` is absent.
