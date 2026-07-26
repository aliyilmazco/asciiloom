# README ASCII Studio Custom Dropdown Design

**Design status:** Implemented and verified on 2026-07-10 after the user's explicit request to replace native dropdowns with designed controls in the real application.

## Context and root cause

The browser interface currently uses three native `<select>` elements for built-in presets, character ramps, and dithering. CSS can style the closed control, but macOS renders the open option popup as operating-system UI. That is why the open preset menu becomes the large light-gray panel shown in the user's screenshot.

The fix is to remove the native select surfaces and introduce one reusable, accessible custom select-only combobox/listbox controller. The change applies to all three selectors so the interface remains visually and behaviorally consistent.

## Goals

1. Replace every native select popup with a fully designed terminal-style dropdown in the real application.
2. Preserve the existing preset, ramp, dither, live-render, dirty-preset, form-name, and saved-preset behavior.
3. Provide complete pointer and keyboard operation without adding a framework or dependency.
4. Keep the control compact in the closed state while making open options easier to scan.
5. Prevent long ramp strings from stretching the trigger or popup.

## Non-goals

- Redesigning the surrounding control panel, buttons, sliders, or saved-preset rows.
- Adding search inputs; each list contains only four or five selectable values, so typeahead is sufficient.
- Changing conversion output, preset settings, or persistence schema.
- Adding a UI framework or third-party dropdown package.

## Visual design

The approved direction is **Command Panel**:

- 44px closed trigger on desktop and 48px on narrow/coarse-pointer layouts.
- Square corners to match the current terminal panels.
- Dark raised surface, stronger gold border, and a 3px yellow leading rail.
- Primary selected label plus a short secondary description where useful.
- A separate chevron cell with a divider; the chevron rotates when open.
- Popup anchored below the trigger and opened above it when viewport space is tighter below.
- Popup width matches the trigger; maximum height is bounded and scrollable.
- Option rows use a green prompt marker, concise label, optional description/preview, and a yellow check for the selected value.
- Active keyboard/hover row uses the raised surface and yellow leading accent.
- Visible yellow focus ring remains consistent with the rest of the application.
- Motion is limited to short border, background, and chevron transitions and is suppressed by the existing reduced-motion rule.

The built-in preset list uses preset descriptions. Character ramps use concise names with glyph previews instead of putting the entire ramp in the accessible label. Dithering options use concise explanatory descriptions.

## Markup and accessibility contract

Each control consists of:

1. a visible text label;
2. a hidden input preserving the existing `id`, `name`, and current value;
3. a button with `role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls`, and `aria-activedescendant` while open;
4. a popup containing a `role="listbox"` container;
5. generated `role="option"` rows with stable IDs and `aria-selected`.

Focus remains on the combobox trigger while the popup is open. Arrow Down/Up moves the active option, Home/End jumps, Enter/Space commits, Escape closes without committing, Tab commits the active option and continues normal navigation, and printable keys perform prefix typeahead. Clicking outside closes the popup. Opening one dropdown closes any other open dropdown.

The non-selectable `custom` preset state remains valid programmatic display state but is omitted from the listbox, so users never see a disabled “Custom / modified settings” option.

## State and data flow

```text
Pointer or keyboard selection
  -> custom dropdown controller commits value
  -> hidden input value is updated
  -> bubbling input event is emitted
  -> existing preset or render listener runs
  -> dropdown display and ASCII output remain synchronized
```

Programmatic preset application calls `setValue()` without emitting another input event. Changing any tuning control calls one `markPresetCustom()` path that updates both the preset dropdown display and its helper text, avoiding stale preset descriptions.

## File boundaries

- `src/browser/dropdown.ts`: reusable dropdown controller, DOM rendering, keyboard behavior, typeahead, outside-click closing, and teardown.
- `src/browser/controls.ts`: ramp/dither option definitions and conversion-control integration.
- `src/main.ts`: built-in preset dropdown composition and existing application event wiring.
- `index.html`: custom-dropdown shells and hidden form inputs for the three selectors.
- `src/style.css`: Command Panel trigger, popup, option, open-above, responsive, and state styles.
- `tests/dropdown.test.ts`: behavior-level custom-dropdown tests.
- `tests/browser-controls.test.ts`: conversion integration with hidden values and programmatic updates.
- `tests/ui-contract.test.ts`: static assertion that native selects are absent and accessible custom shells remain present.

## Error and lifecycle handling

- Unknown programmatic values throw instead of silently displaying an inconsistent state.
- A non-selectable programmatic state may be displayed but cannot be committed by the user.
- Destroying a controller removes document listeners and closes its popup.
- Page teardown disposes all three controllers.
- Empty option collections are rejected during construction.

## Acceptance criteria

- The real application contains no native `<select>` element and opening a selector never invokes the macOS popup.
- Preset, ramp, and dither selectors share the approved Command Panel design.
- Mouse, touch, keyboard, typeahead, outside click, and one-open-dropdown behavior work.
- Selected values, helper text, hidden form values, dirty preset state, and live rendering stay synchronized.
- The popup remains usable at desktop and mobile widths without horizontal overflow.
- Focus is visible and ARIA state accurately tracks open, active, and selected states.
- Focused DOM tests, TypeScript checks, production build, and browser verification pass.
