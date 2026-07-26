# Mobile UI/UX Polish Design

Status: Implemented and verified

## Context

README ASCII Studio is functionally stable and already passes its desktop and mobile smoke checks. The remaining UI/UX issues are narrow: sub-44-pixel mobile targets, very small supporting text, excessive vertical output height on phones, a destructive action that depends on hover for emphasis, and a browser theme color that does not match the page background.

## Considered approaches

### A. CSS-first responsive polish (selected)

Keep the existing DOM, controls, keyboard behavior, and output workflow. Add mobile/coarse-pointer sizing rules, raise the smallest supporting type, reduce the mobile output surfaces, give Delete a persistent danger treatment, and align the theme color.

Trade-off: this materially improves usability with the lowest regression risk, but it does not introduce richer mobile-only controls.

### B. Collapsible selected-output surface

Wrap the generated textarea in a disclosure control on mobile so the preview is primary and the raw output is opened on demand.

Trade-off: shorter pages, but adds state, focus behavior, copy-flow questions, and more accessibility/testing surface.

### C. Dedicated mobile workspace redesign

Replace the stacked layout with a mobile stepper or sticky output/action navigation.

Trade-off: potentially stronger phone UX, but it changes the product workflow and is disproportionate to the current findings.

## Selected design

Implement approach A without changing application state or TypeScript behavior.

### Touch targets

- At widths up to 640 pixels and on coarse pointers, make buttons, preset-row actions, output-format tabs, text/color inputs, switch rows, and range controls at least 44 pixels tall.
- Preserve the existing 8-pixel action gaps where present and avoid widening compact actions unnecessarily.
- Keep desktop density unchanged.

### Typography

- Raise the smallest mobile interface labels and dropdown supporting copy to at least 0.68rem in phone portrait and compact landscape layouts.
- Raise button, field-label, notice, status, and helper copy to at least 0.75rem in those layouts.
- Keep ASCII-art glyph sizing compact because it is content, not interface copy, and the preview remains horizontally scrollable.

### Mobile output density

- Reduce the mobile preview minimum height from 300 to 240 pixels.
- Reduce the mobile raw-output minimum height from 300 to `min(180px, 42dvh)` and cap it at 42dvh while preserving manual resize and scrolling.
- Apply the compact type and output-density rules both below 640 pixels and at up to 980 pixels when viewport height is at most 500 pixels, covering phone landscape.
- Do not hide either surface or add new state.

### Destructive action

- Give `.row-action.delete` a persistent danger-colored border and text.
- Keep the stronger hover/focus treatment and the existing eight-second Undo behavior.

### Browser chrome

- Change the document theme color to the actual `--bg` value, `#020201`.

## Verification

- Add static UI contract assertions before implementation for theme color, persistent delete styling, the 44-pixel mobile/coarse rules, readable mobile type, and reduced mobile output heights.
- Run the focused UI contract suite, formatting, lint, typecheck, and full `release:check` on Node 22.
- Smoke test 375x812 portrait and 812x375 landscape: no horizontal overflow, all targeted controls at least 44 pixels tall, dropdown remains in viewport, output surfaces use the intended heights, and browser logs remain clean.

## Non-goals

- No new components or JavaScript state.
- No color palette, typography-family, or desktop layout redesign.
- No changes to conversion, preset persistence, CLI, or export behavior.
