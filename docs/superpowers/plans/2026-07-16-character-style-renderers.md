# Character Style Renderers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Fine Blocks, true 2×4 Braille, and connectivity-aware Structural Unicode character styles to the shared browser/CLI converter without changing any existing preset output.

**Architecture:** Extend `AsciiOptions` with a renderer mode and edge style, then centralize the eight public character styles in one immutable registry. Keep the existing tone renderer as the unchanged default path, dispatch Braille to a dedicated subcell packer, and dispatch Unicode structure to a dedicated connectivity renderer. Browser controls, CLI parsing, saved presets, golden fixtures, and package verification all consume the same registry.

**Tech Stack:** TypeScript 7, Vitest 4, Vite 8, Playwright 1.61, Node.js ESM, Sharp 0.35, HTML/CSS, npm package lifecycle scripts.

---

## Execution constraints

- The approved design is `docs/superpowers/specs/2026-07-16-character-style-renderers-design.md`.
- Do not create a Git worktree, commit, tag, push, or modify GitHub Actions. The user explicitly excluded Git operations.
- Do not publish to npm. Finish with `npm publish --dry-run --foreground-scripts` only.
- Do not add a runtime dependency. The existing `sharp` dependency is sufficient for CLI fixture conversion.
- Preserve `examples/demo.txt`, `examples/demo.md`, and `examples/demo.svg` byte-for-byte.
- Keep the public npm artifact CLI-only. New compiled core modules may increase the tarball entry count; the expected JavaScript list must remain dynamically derived.

## File map

### New focused modules and tests

- `src/core/character-styles.ts` — canonical IDs, UI copy, option overlays, style application, and renderer-aware style resolution.
- `src/core/braille.ts` — pure 2×4 Braille bit packing and row rendering.
- `src/core/structure.ts` — edge-direction classification, connectivity masks, Unicode glyph selection, and structural row rendering.
- `tests/character-styles.test.ts` — registry completeness, style precedence, immutability, and legacy Logo identity.
- `tests/braille.test.ts` — all eight Braille dots, empty/full cells, dimensions, and trimming.
- `tests/structure.test.ts` — direction classification, straight/diagonal/corner/T/cross glyphs, endpoints, and tone fallback.
- `tests/fixtures/character-styles/gradient.svg` — deterministic black-to-white ramp fixture.
- `tests/fixtures/character-styles/transparent-logo.svg` — deterministic alpha-compositing fixture.
- `tests/fixtures/character-styles/structure.svg` — deterministic lines, diagonals, corners, T-junctions, and cross fixture.
- `tests/fixtures/character-styles/portrait.svg` — deterministic low-contrast portrait-like fixture.
- `examples/character-styles/blocks-fine.{txt,md,svg}` — stored Fine Blocks golden outputs.
- `examples/character-styles/braille.{txt,md,svg}` — stored Braille golden outputs.
- `examples/character-styles/structure.{txt,md,svg}` — stored Structural Unicode golden outputs.

### Existing files to modify

- `src/core/types.ts` — add `RenderMode`, `EdgeStyle`, and their required `AsciiOptions` fields.
- `src/core/presets.ts` — add the Fine Blocks ramp and backward-compatible defaults.
- `src/core/validation.ts` — validate the new enums and incompatible renderer combinations.
- `src/core/ascii.ts` — preserve the tone path and dispatch Braille/Structural Unicode.
- `src/cli-options.ts` — parse `--style`, apply preset → style → explicit overrides, and reject incompatible explicit flags.
- `src/cli/run.ts` — document styles in CLI help; conversion orchestration remains unchanged.
- `src/browser/controls.ts` — replace the ramp dropdown with the shared Character Style selector and keep ASCII edges orthogonal.
- `src/browser/output-controller.ts` — show truthful style metadata for Braille and Structural Unicode.
- `src/browser/custom-presets.ts` — migrate schema v1 to v2 while preserving the existing storage key.
- `index.html` — rename the ramp dropdown DOM contract to Character Style.
- `src/style.css` — preserve readable longest-label layout on mobile.
- `scripts/verify-examples.mjs` — regenerate and compare all legacy and new golden outputs.
- `scripts/verify-package.mjs` — smoke-test every new style through the installed tarball CLI.
- `tests/ascii.test.ts`, `tests/validation.test.ts`, `tests/presets.test.ts` — core integration and compatibility coverage.
- `tests/cli-options.test.ts`, `tests/cli-runtime.test.ts`, `tests/cli-integration.test.ts` — CLI precedence, errors, help, and compiled output coverage.
- `tests/browser-controls.test.ts`, `tests/output-controller.test.ts`, `tests/custom-presets.test.ts`, `tests/preset-workflow.test.ts`, `tests/browser-app.test.ts`, `tests/ui-contract.test.ts` — browser control, migration, workflow, and DOM contract coverage.
- `tests/package-verification.test.mjs` — prove additional compiled modules are accepted dynamically and leaks remain rejected.
- `e2e/studio.e2e.ts` — exercise real-file conversion, all new styles, copy/download bytes, preset persistence, and 390px layout.
- `README.md` — document style semantics, CLI usage, migration behavior, architecture, limitations, and verification.

## Task 1: Establish the shared character-style model

**Files:**

- Create: `src/core/character-styles.ts`
- Create: `tests/character-styles.test.ts`
- Modify: `src/core/types.ts:1-34`
- Modify: `src/core/presets.ts:3-28`
- Modify: `tests/presets.test.ts:14-33`

- [ ] **Step 1: Write the failing registry tests**

Create `tests/character-styles.test.ts` with these behaviors:

```ts
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_STYLES,
  applyCharacterStyle,
  getCharacterStyle,
  resolveCharacterStyleId,
} from '../src/core/character-styles.js';
import { DEFAULT_OPTIONS, RAMPS, optionsForPreset } from '../src/core/presets.js';

describe('character style registry', () => {
  it('publishes the eight stable style identifiers in UI order', () => {
    expect(CHARACTER_STYLES.map(({ id }) => id)).toEqual([
      'readme',
      'detailed',
      'soft',
      'minimal',
      'blocks',
      'blocks-fine',
      'braille',
      'structure',
    ]);
  });

  it('applies only glyph-related fields without mutating the source', () => {
    const source = optionsForPreset('portrait');
    const snapshot = structuredClone(source);
    const styled = applyCharacterStyle(source, 'braille');

    expect(source).toEqual(snapshot);
    expect(styled).toMatchObject({
      width: source.width,
      contrast: source.contrast,
      renderMode: 'braille',
      edgeGlyphs: false,
      edgeStyle: 'ascii',
    });
  });

  it('uses renderer precedence and keeps legacy ASCII edges orthogonal', () => {
    expect(resolveCharacterStyleId(optionsForPreset('logo'))).toBe('minimal');
    expect(
      resolveCharacterStyleId({
        ...DEFAULT_OPTIONS,
        ramp: RAMPS['blocks-fine'],
        edgeGlyphs: true,
      }),
    ).toBe('blocks-fine');
    expect(
      resolveCharacterStyleId({
        ...DEFAULT_OPTIONS,
        ramp: 'custom ramp ',
        edgeGlyphs: true,
        edgeStyle: 'unicode',
      }),
    ).toBe('structure');
    expect(resolveCharacterStyleId({ ...DEFAULT_OPTIONS, renderMode: 'braille' })).toBe('braille');
  });

  it('returns custom for an unknown tone ramp and undefined for an unknown id', () => {
    expect(resolveCharacterStyleId({ ...DEFAULT_OPTIONS, ramp: 'custom ramp ' })).toBe('custom');
    expect(getCharacterStyle('missing')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the new test and confirm the missing-module failure**

Run:

```bash
npx vitest run tests/character-styles.test.ts
```

Expected: FAIL because `src/core/character-styles.ts` does not exist and the new option fields are undefined.

- [ ] **Step 3: Add the shared types and backward-compatible defaults**

Add to `src/core/types.ts`:

```ts
export type RenderMode = 'tone' | 'braille';
export type EdgeStyle = 'ascii' | 'unicode';
```

Add these required fields beside the current ramp and edge fields in `AsciiOptions`:

```ts
renderMode: RenderMode;
edgeStyle: EdgeStyle;
```

Add the Fine Blocks ramp to `RAMPS` in `src/core/presets.ts`:

```ts
'blocks-fine': '█▉▊▋▌▍▎▏ ',
```

Add the legacy-safe defaults to `DEFAULT_OPTIONS`:

```ts
renderMode: 'tone',
edgeStyle: 'ascii',
```

Do not add the new fields to individual built-in preset overlays. `optionsForPreset()` must inherit them from `DEFAULT_OPTIONS`, which keeps all five preset behaviors unchanged.

- [ ] **Step 4: Implement the immutable style registry and resolution rules**

Create `src/core/character-styles.ts` with these public contracts:

```ts
import { RAMPS } from './presets.js';
import type { AsciiOptions } from './types.js';

export type CharacterStyleId =
  'readme' | 'detailed' | 'soft' | 'minimal' | 'blocks' | 'blocks-fine' | 'braille' | 'structure';

export interface CharacterStyle {
  readonly id: CharacterStyleId;
  readonly label: string;
  readonly description: string;
  readonly portability: 'strict-ascii' | 'unicode';
  readonly preview: string;
  readonly options: Readonly<
    Pick<AsciiOptions, 'ramp' | 'renderMode' | 'edgeGlyphs' | 'edgeStyle'>
  >;
}

export const CHARACTER_STYLES = [
  {
    id: 'readme',
    label: 'README safe',
    description: 'Strict ASCII · portable punctuation',
    portability: 'strict-ascii',
    preview: RAMPS.readme,
    options: { ramp: RAMPS.readme, renderMode: 'tone', edgeGlyphs: false, edgeStyle: 'ascii' },
  },
  {
    id: 'detailed',
    label: 'Detailed ASCII',
    description: 'Strict ASCII · smooth tonal transitions',
    portability: 'strict-ascii',
    preview: RAMPS.detailed,
    options: { ramp: RAMPS.detailed, renderMode: 'tone', edgeGlyphs: false, edgeStyle: 'ascii' },
  },
  {
    id: 'soft',
    label: 'Soft ASCII',
    description: 'Strict ASCII · gentle gradients',
    portability: 'strict-ascii',
    preview: RAMPS.soft,
    options: { ramp: RAMPS.soft, renderMode: 'tone', edgeGlyphs: false, edgeStyle: 'ascii' },
  },
  {
    id: 'minimal',
    label: 'Minimal ASCII',
    description: 'Strict ASCII · bold silhouettes',
    portability: 'strict-ascii',
    preview: RAMPS.minimal,
    options: { ramp: RAMPS.minimal, renderMode: 'tone', edgeGlyphs: false, edgeStyle: 'ascii' },
  },
  {
    id: 'blocks',
    label: 'Unicode shades',
    description: 'Unicode · font-dependent block shading',
    portability: 'unicode',
    preview: RAMPS.blocks,
    options: { ramp: RAMPS.blocks, renderMode: 'tone', edgeGlyphs: false, edgeStyle: 'ascii' },
  },
  {
    id: 'blocks-fine',
    label: 'Fine blocks',
    description: 'Unicode · nine fractional block levels',
    portability: 'unicode',
    preview: RAMPS['blocks-fine'],
    options: {
      ramp: RAMPS['blocks-fine'],
      renderMode: 'tone',
      edgeGlyphs: false,
      edgeStyle: 'ascii',
    },
  },
  {
    id: 'braille',
    label: 'Braille subcells',
    description: 'Unicode · compact 2×4 subcells',
    portability: 'unicode',
    preview: '⣿⣷⣤⡀',
    options: { ramp: RAMPS.readme, renderMode: 'braille', edgeGlyphs: false, edgeStyle: 'ascii' },
  },
  {
    id: 'structure',
    label: 'Structural Unicode',
    description: 'Unicode · structure-optimized strokes',
    portability: 'unicode',
    preview: '─│╱╲┌┐└┘┼',
    options: { ramp: RAMPS.minimal, renderMode: 'tone', edgeGlyphs: true, edgeStyle: 'unicode' },
  },
] as const satisfies readonly CharacterStyle[];

export function getCharacterStyle(id: string): CharacterStyle | undefined {
  return CHARACTER_STYLES.find((style) => style.id === id);
}

export function isCharacterStyleId(value: string): value is CharacterStyleId {
  return getCharacterStyle(value) !== undefined;
}

export function applyCharacterStyle(options: AsciiOptions, id: CharacterStyleId): AsciiOptions {
  const style = getCharacterStyle(id)!;
  return { ...options, ...style.options, background: { ...options.background } };
}

export function resolveCharacterStyleId(options: AsciiOptions): CharacterStyleId | 'custom' {
  if (options.renderMode === 'braille') return 'braille';
  if (options.edgeGlyphs && options.edgeStyle === 'unicode') return 'structure';
  const toneStyle = CHARACTER_STYLES.find(
    (style) =>
      style.id !== 'braille' && style.id !== 'structure' && style.options.ramp === options.ramp,
  );
  return toneStyle?.id ?? 'custom';
}
```

- [ ] **Step 5: Lock the legacy preset defaults**

Extend `tests/presets.test.ts` so every built-in preset returns:

```ts
expect(
  PRESETS.map(({ id }) => optionsForPreset(id)).map(({ renderMode, edgeStyle }) => ({
    renderMode,
    edgeStyle,
  })),
).toEqual(PRESETS.map(() => ({ renderMode: 'tone', edgeStyle: 'ascii' })));
```

- [ ] **Step 6: Run the focused tests and typecheck**

Run:

```bash
npx vitest run tests/character-styles.test.ts tests/presets.test.ts
npm run typecheck
```

Expected: both Vitest files PASS and all five TypeScript projects exit successfully.

## Task 2: Validate renderer and edge-style combinations

**Files:**

- Modify: `src/core/validation.ts:1-172`
- Modify: `tests/validation.test.ts:1-126`

- [ ] **Step 1: Add failing validation tests**

Add to `tests/validation.test.ts`:

```ts
it('validates renderer and edge style enums', () => {
  expect(() => validateAsciiOptions({ ...DEFAULT_OPTIONS, renderMode: 'dots' as 'tone' })).toThrow(
    'renderMode must be one of: tone, braille.',
  );
  expect(() => validateAsciiOptions({ ...DEFAULT_OPTIONS, edgeStyle: 'box' as 'ascii' })).toThrow(
    'edgeStyle must be one of: ascii, unicode.',
  );
});

it('rejects edge glyphs with the incompatible Braille cell model', () => {
  expect(() =>
    validateAsciiOptions({ ...DEFAULT_OPTIONS, renderMode: 'braille', edgeGlyphs: true }),
  ).toThrow('Braille render mode cannot be combined with edge glyphs.');
});

it('accepts ASCII edges, Unicode structural edges, and Braille without edges', () => {
  expect(() => validateAsciiOptions(DEFAULT_OPTIONS)).not.toThrow();
  expect(() =>
    validateAsciiOptions({ ...DEFAULT_OPTIONS, edgeGlyphs: true, edgeStyle: 'unicode' }),
  ).not.toThrow();
  expect(() =>
    validateAsciiOptions({ ...DEFAULT_OPTIONS, renderMode: 'braille', edgeGlyphs: false }),
  ).not.toThrow();
});
```

- [ ] **Step 2: Confirm the new assertions fail**

Run:

```bash
npx vitest run tests/validation.test.ts
```

Expected: FAIL because invalid enum values and the Braille/edge conflict are not checked yet.

- [ ] **Step 3: Implement exact enum and combination validation**

Import `RenderMode` and `EdgeStyle`, define immutable allowed arrays, and add these checks before ramp validation:

```ts
export const RENDER_MODES = ['tone', 'braille'] as const satisfies readonly RenderMode[];
export const EDGE_STYLES = ['ascii', 'unicode'] as const satisfies readonly EdgeStyle[];

if (!RENDER_MODES.includes(options.renderMode as RenderMode)) {
  throw new RangeError(`renderMode must be one of: ${RENDER_MODES.join(', ')}.`);
}
if (!EDGE_STYLES.includes(options.edgeStyle as EdgeStyle)) {
  throw new RangeError(`edgeStyle must be one of: ${EDGE_STYLES.join(', ')}.`);
}
if (options.renderMode === 'braille' && options.edgeGlyphs) {
  throw new RangeError('Braille render mode cannot be combined with edge glyphs.');
}
```

Do not reject a custom ramp behind Structural Unicode; CLI and core must permit that fallback.

- [ ] **Step 4: Run validation and registry tests**

Run:

```bash
npx vitest run tests/validation.test.ts tests/character-styles.test.ts
```

Expected: PASS.

## Task 3: Build the pure Braille 2×4 packer

**Files:**

- Create: `src/core/braille.ts`
- Create: `tests/braille.test.ts`

- [ ] **Step 1: Write failing bit-mapping and row tests**

Create `tests/braille.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderBrailleCells } from '../src/core/braille.js';

const dotCases = [
  [0, 0, 0x01],
  [0, 1, 0x02],
  [0, 2, 0x04],
  [1, 0, 0x08],
  [1, 1, 0x10],
  [1, 2, 0x20],
  [0, 3, 0x40],
  [1, 3, 0x80],
] as const;

describe('Braille cell renderer', () => {
  it.each(dotCases)('maps subcell (%i,%i) to mask 0x%i', (x, y, mask) => {
    const subcells = new Uint16Array(8).fill(1);
    subcells[y * 2 + x] = 0;
    expect(renderBrailleCells(subcells, 1, 1, false)).toBe(String.fromCodePoint(0x2800 + mask));
  });

  it('uses ASCII space for empty cells and U+28FF for full cells', () => {
    expect(renderBrailleCells(new Uint16Array(8).fill(1), 1, 1, false)).toBe(' ');
    expect(renderBrailleCells(new Uint16Array(8), 1, 1, false)).toBe('⣿');
  });

  it('emits only ASCII whitespace or assigned Braille scalars', () => {
    const art = renderBrailleCells(Uint16Array.from([0, 1, 1, 0, 0, 1, 1, 0]), 1, 1, false);
    for (const character of art) {
      const scalar = character.codePointAt(0)!;
      expect(character === ' ' || (scalar >= 0x2801 && scalar <= 0x28ff)).toBe(true);
    }
  });

  it('preserves output dimensions and trims only trailing ASCII spaces', () => {
    const subcells = new Uint16Array(4 * 8).fill(1);
    subcells[0] = 0;
    subcells[4 * 4] = 0;
    expect(renderBrailleCells(subcells, 2, 2, false).split('\n')).toEqual(['⠁ ', '⠁ ']);
    expect(renderBrailleCells(subcells, 2, 2, true).split('\n')).toEqual(['⠁', '⠁']);
  });

  it('rejects a subcell field with the wrong size', () => {
    expect(() => renderBrailleCells(new Uint16Array(7), 1, 1, true)).toThrow(
      'Braille subcell field must contain outputWidth × 2 × outputHeight × 4 entries.',
    );
  });
});
```

- [ ] **Step 2: Confirm the module is missing**

Run:

```bash
npx vitest run tests/braille.test.ts
```

Expected: FAIL because `src/core/braille.ts` does not exist.

- [ ] **Step 3: Implement deterministic Braille packing**

Create `src/core/braille.ts` with this mapping and validation:

```ts
const BRAILLE_BASE = 0x2800;
const BRAILLE_BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
] as const;

export function renderBrailleCells(
  indices: Uint16Array,
  outputWidth: number,
  outputHeight: number,
  trimLineEnds: boolean,
): string {
  const subcellWidth = outputWidth * 2;
  const subcellHeight = outputHeight * 4;
  if (indices.length !== subcellWidth * subcellHeight) {
    throw new RangeError(
      'Braille subcell field must contain outputWidth × 2 × outputHeight × 4 entries.',
    );
  }

  const lines: string[] = [];
  for (let cellY = 0; cellY < outputHeight; cellY += 1) {
    let line = '';
    for (let cellX = 0; cellX < outputWidth; cellX += 1) {
      let mask = 0;
      for (let dotY = 0; dotY < 4; dotY += 1) {
        for (let dotX = 0; dotX < 2; dotX += 1) {
          const subcellX = cellX * 2 + dotX;
          const subcellY = cellY * 4 + dotY;
          if ((indices[subcellY * subcellWidth + subcellX] ?? 1) === 0) {
            mask |= BRAILLE_BITS[dotY]?.[dotX] ?? 0;
          }
        }
      }
      line += mask === 0 ? ' ' : String.fromCodePoint(BRAILLE_BASE + mask);
    }
    lines.push(trimLineEnds ? line.replace(/ +$/u, '') : line);
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run the Braille unit tests**

Run:

```bash
npx vitest run tests/braille.test.ts
```

Expected: all Braille tests PASS.

## Task 4: Build connectivity-aware Structural Unicode rendering

**Files:**

- Create: `src/core/structure.ts`
- Create: `tests/structure.test.ts`

- [ ] **Step 1: Write failing direction and connectivity tests**

Create `tests/structure.test.ts` with table-driven coverage:

```ts
import { describe, expect, it } from 'vitest';
import {
  classifyEdgeDirection,
  glyphForConnectivity,
  renderStructuralCharacters,
} from '../src/core/structure.js';

describe('Structural Unicode renderer', () => {
  it.each([
    [0, 'vertical'],
    [Math.PI / 4, 'rising-diagonal'],
    [Math.PI / 2, 'horizontal'],
    [(3 * Math.PI) / 4, 'falling-diagonal'],
  ] as const)('classifies Sobel normal angle %f', (normalAngle, expected) => {
    expect(classifyEdgeDirection(normalAngle)).toBe(expected);
  });

  it.each([
    [0b1010, 'horizontal', '─'],
    [0b0101, 'vertical', '│'],
    [0b0110, 'horizontal', '┌'],
    [0b1100, 'horizontal', '┐'],
    [0b0011, 'horizontal', '└'],
    [0b1001, 'horizontal', '┘'],
    [0b0111, 'vertical', '├'],
    [0b1101, 'vertical', '┤'],
    [0b1110, 'horizontal', '┬'],
    [0b1011, 'horizontal', '┴'],
    [0b1111, 'vertical', '┼'],
    [0b0010, 'horizontal', '─'],
    [0b0001, 'vertical', '│'],
  ] as const)('maps mask %i to %s', (mask, direction, glyph) => {
    expect(glyphForConnectivity(mask, direction)).toBe(glyph);
  });

  it('uses diagonals directly and leaves weak cells on their tone glyph', () => {
    const art = renderStructuralCharacters({
      indices: Uint16Array.from([0, 0, 0]),
      ramp: ['#', ' '],
      values: Float64Array.from([0.5, 0.5, 0.5]),
      edges: {
        magnitude: Float64Array.from([1, 1, 0.1]),
        angle: Float64Array.from([Math.PI / 4, (3 * Math.PI) / 4, 0]),
      },
      width: 3,
      height: 1,
      threshold: 0.2,
      trimLineEnds: false,
    });
    expect(art).toBe('╱╲#');
  });

  it('derives a cross from compatible cardinal neighbors', () => {
    const magnitude = new Float64Array(9);
    const angle = new Float64Array(9);
    for (const index of [1, 3, 4, 5, 7]) magnitude[index] = 1;
    angle[1] = 0;
    angle[7] = 0;
    angle[3] = Math.PI / 2;
    angle[5] = Math.PI / 2;
    const art = renderStructuralCharacters({
      indices: new Uint16Array(9),
      ramp: ['#', ' '],
      values: new Float64Array(9).fill(0.5),
      edges: { magnitude, angle },
      width: 3,
      height: 3,
      threshold: 0.2,
      trimLineEnds: false,
    });
    expect(Array.from(art.split('\n')[1] ?? '')[1]).toBe('┼');
  });

  it('rejects mismatched field lengths before rendering', () => {
    expect(() =>
      renderStructuralCharacters({
        indices: new Uint16Array(1),
        ramp: ['#', ' '],
        values: new Float64Array(2),
        edges: { magnitude: new Float64Array(1), angle: new Float64Array(1) },
        width: 1,
        height: 1,
        threshold: 0.2,
        trimLineEnds: true,
      }),
    ).toThrow('Structural fields must match width × height.');
  });
});
```

Connectivity bit order is fixed as north `0b0001`, east `0b0010`, south `0b0100`, west `0b1000`.

- [ ] **Step 2: Confirm the new module fails to resolve**

Run:

```bash
npx vitest run tests/structure.test.ts
```

Expected: FAIL because `src/core/structure.ts` does not exist.

- [ ] **Step 3: Implement direction classification and glyph mapping**

Create `src/core/structure.ts` with:

```ts
export type EdgeDirection = 'horizontal' | 'vertical' | 'rising-diagonal' | 'falling-diagonal';

export interface EdgeField {
  magnitude: Float64Array;
  angle: Float64Array;
}

const NORTH = 0b0001;
const EAST = 0b0010;
const SOUTH = 0b0100;
const WEST = 0b1000;
const EDGE_MIDTONE_MIN = 0.06;
const EDGE_MIDTONE_MAX = 0.94;
const STRONG_EDGE_MAGNITUDE = 0.5;

export function classifyEdgeDirection(normalAngle: number): EdgeDirection {
  let tangent = normalAngle + Math.PI / 2;
  while (tangent < 0) tangent += Math.PI;
  while (tangent >= Math.PI) tangent -= Math.PI;
  if (tangent < Math.PI / 8 || tangent >= (7 * Math.PI) / 8) return 'horizontal';
  if (tangent < (3 * Math.PI) / 8) return 'falling-diagonal';
  if (tangent < (5 * Math.PI) / 8) return 'vertical';
  return 'rising-diagonal';
}

export function glyphForConnectivity(
  mask: number,
  fallbackDirection: Extract<EdgeDirection, 'horizontal' | 'vertical'>,
): string {
  const glyphs = new Map<number, string>([
    [EAST | WEST, '─'],
    [NORTH | SOUTH, '│'],
    [EAST | SOUTH, '┌'],
    [WEST | SOUTH, '┐'],
    [NORTH | EAST, '└'],
    [NORTH | WEST, '┘'],
    [NORTH | EAST | SOUTH, '├'],
    [NORTH | SOUTH | WEST, '┤'],
    [EAST | SOUTH | WEST, '┬'],
    [NORTH | EAST | WEST, '┴'],
    [NORTH | EAST | SOUTH | WEST, '┼'],
  ]);
  return glyphs.get(mask) ?? (fallbackDirection === 'horizontal' ? '─' : '│');
}
```

- [ ] **Step 4: Implement eligibility, neighbor connectivity, and tone fallback**

Add `StructuralRenderInput` and `renderStructuralCharacters()` to the same module. The implementation must:

```ts
export interface StructuralRenderInput {
  indices: Uint16Array;
  ramp: readonly string[];
  values: Float64Array;
  edges: EdgeField;
  width: number;
  height: number;
  threshold: number;
  trimLineEnds: boolean;
}
```

For each cell:

1. Mark it eligible only when `magnitude >= threshold` and either its value is between `0.06` and `0.94` or its magnitude is at least `0.5`.
2. Classify the eligible cell with `classifyEdgeDirection()`.
3. Emit `╱` or `╲` immediately for eligible diagonal cells.
4. For a horizontal/vertical cell, set north/south bits when the adjacent eligible cell is vertical, and east/west bits when the adjacent eligible cell is horizontal.
5. Pass the mask to `glyphForConnectivity()`. A zero or one-sided mask uses the classified straight glyph.
6. For an ineligible cell, emit `ramp[indices[index]]`, falling back to ASCII space.
7. Apply the existing `/ +$/u` trim rule per row only when `trimLineEnds` is true.
8. Throw `Structural fields must match width × height.` unless `indices`, `values`, `magnitude`, and `angle` all equal `width * height`.

- [ ] **Step 5: Run the structural tests**

Run:

```bash
npx vitest run tests/structure.test.ts
```

Expected: all direction, connectivity, fallback, and validation tests PASS.

## Task 5: Dispatch the shared conversion core without changing tone output

**Files:**

- Modify: `src/core/ascii.ts:1-396`
- Modify: `tests/ascii.test.ts:1-231`

- [ ] **Step 1: Add failing core integration tests for all three renderer paths**

Extend `tests/ascii.test.ts` with:

```ts
it('maps Fine Blocks through the unchanged tone pipeline', () => {
  const linearToSrgbByte = (linear: number): number =>
    Math.round(
      255 * (linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055),
    );
  const pixels = new Uint8Array(
    Array.from({ length: 9 }, (_, index) => linearToSrgbByte(index / 8)).flatMap((value) => [
      value,
      value,
      value,
      255,
    ]),
  );
  const result = convertRgbaToAscii(
    { data: pixels, width: 9, height: 1, channels: 4 },
    {
      ...DEFAULT_OPTIONS,
      width: 9,
      ramp: RAMPS['blocks-fine'],
      autoLevels: false,
      contrast: 1,
      detail: 0,
      dither: 'none',
      trimLineEnds: false,
    },
    1,
  );
  expect(Array.from(result.art)).toEqual(['█', '▉', '▊', '▋', '▌', '▍', '▎', '▏', ' ']);
});

it('renders true 2×4 Braille subcells and averages them into text-cell values', () => {
  const black = new Uint8Array(4 * 4 * 4);
  for (let offset = 3; offset < black.length; offset += 4) black[offset] = 255;
  const result = convertRgbaToAscii(
    { data: black, width: 4, height: 4, channels: 4 },
    {
      ...DEFAULT_OPTIONS,
      width: 2,
      renderMode: 'braille',
      autoLevels: false,
      contrast: 1,
      detail: 0,
      dither: 'none',
      trimLineEnds: false,
    },
    1,
  );
  expect(result.art).toBe('⣿⣿');
  expect(result.values).toHaveLength(2);
  expect(Array.from(result.values)).toEqual([0, 0]);
});

it('uses Unicode structure only when edgeStyle is unicode', () => {
  const pixels = imageFromRows([
    [0, 0, 255, 255],
    [0, 0, 255, 255],
    [0, 0, 255, 255],
    [0, 0, 255, 255],
  ]);
  const base = {
    ...DEFAULT_OPTIONS,
    width: 4,
    ramp: RAMPS.minimal,
    autoLevels: false,
    detail: 0,
    dither: 'none' as const,
    edgeGlyphs: true,
    edgeThreshold: 0.05,
    trimLineEnds: false,
  };
  expect(convertRgbaToAscii(pixels, { ...base, edgeStyle: 'ascii' }, 4).art).toMatch(/[|/\\-]/u);
  expect(convertRgbaToAscii(pixels, { ...base, edgeStyle: 'unicode' }, 4).art).toMatch(
    /[─│╱╲┌┐└┘├┤┬┴┼]/u,
  );
});

it.each(['none', 'atkinson', 'floyd-steinberg', 'bayer'] as const)(
  'keeps Fine Blocks and Braille deterministic with %s dithering',
  (dither) => {
    const image = imageFromRows(
      Array.from({ length: 8 }, (_, y) =>
        Array.from({ length: 8 }, (_, x) => Math.round(((x + y) / 14) * 255)),
      ),
    );
    const fineOptions = {
      ...DEFAULT_OPTIONS,
      width: 4,
      ramp: RAMPS['blocks-fine'],
      dither,
    };
    const brailleOptions = { ...fineOptions, renderMode: 'braille' as const };
    expect(convertRgbaToAscii(image, fineOptions, 2).art).toBe(
      convertRgbaToAscii(image, fineOptions, 2).art,
    );
    expect(convertRgbaToAscii(image, brailleOptions, 2).art).toBe(
      convertRgbaToAscii(image, brailleOptions, 2).art,
    );
  },
);

it('applies background compositing and inversion to Braille subcells', () => {
  const transparent = imageFromRows(
    Array.from({ length: 4 }, () => [0, 0, 0, 0]),
    0,
  );
  const base = {
    ...DEFAULT_OPTIONS,
    width: 2,
    renderMode: 'braille' as const,
    autoLevels: false,
    detail: 0,
    dither: 'none' as const,
    trimLineEnds: false,
  };
  const light = convertRgbaToAscii(
    transparent,
    { ...base, background: { r: 255, g: 255, b: 255 } },
    1,
  ).art;
  const dark = convertRgbaToAscii(
    transparent,
    { ...base, background: { r: 0, g: 0, b: 0 } },
    1,
  ).art;
  expect(light).not.toBe(dark);
  expect(
    convertRgbaToAscii(
      transparent,
      { ...base, background: { r: 255, g: 255, b: 255 }, invert: true },
      1,
    ).art,
  ).toBe(dark);
});
```

Add this local pure-core helper near the top of `tests/ascii.test.ts`; do not use Sharp in this test:

```ts
function imageFromRows(rows: readonly (readonly number[])[], alpha = 255): RgbaImage {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = rows[y]?.[x] ?? 0;
      const offset = (y * width + x) * 4;
      data.set([value, value, value, alpha], offset);
    }
  }
  return { data, width, height, channels: 4 };
}
```

- [ ] **Step 2: Run core tests and verify the renderer assertions fail**

Run:

```bash
npx vitest run tests/ascii.test.ts tests/braille.test.ts tests/structure.test.ts
```

Expected: Braille and structural core integration assertions FAIL while the standalone module tests PASS.

- [ ] **Step 3: Keep Sobel production unchanged and add renderer imports**

In `src/core/ascii.ts`:

```ts
import { renderBrailleCells } from './braille.js';
import { renderStructuralCharacters, type EdgeField } from './structure.js';
```

Use the shared `EdgeField` type for `sobelEdges()`. Keep its current kernel, magnitude normalization, angle calculation, ASCII thresholds, and `edgeCharacter()` function unchanged.

- [ ] **Step 4: Dispatch Unicode structure inside the current character renderer**

At the start of `renderCharacters()`, after calculating `characters` and `edges`, add:

```ts
if (edges && options.edgeStyle === 'unicode') {
  return renderStructuralCharacters({
    indices,
    ramp: characters,
    values,
    edges,
    width,
    height,
    threshold: options.edgeThreshold,
    trimLineEnds: options.trimLineEnds,
  });
}
```

Leave the existing ASCII `- | / \` loop byte-for-byte intact below this branch.

- [ ] **Step 5: Add the Braille subcell dispatch with averaged cell-sized values**

Add this private averaging helper near the renderer functions:

```ts
function averageBrailleSubcells(
  subcells: Float64Array,
  outputWidth: number,
  outputHeight: number,
): Float64Array {
  const subcellWidth = outputWidth * 2;
  const output = new Float64Array(outputWidth * outputHeight);
  for (let cellY = 0; cellY < outputHeight; cellY += 1) {
    for (let cellX = 0; cellX < outputWidth; cellX += 1) {
      let sum = 0;
      for (let dotY = 0; dotY < 4; dotY += 1) {
        for (let dotX = 0; dotX < 2; dotX += 1) {
          const x = cellX * 2 + dotX;
          const y = cellY * 4 + dotY;
          sum += subcells[y * subcellWidth + x] ?? 0;
        }
      }
      output[cellY * outputWidth + cellX] = sum / 8;
    }
  }
  return output;
}
```

Refactor only the bottom of `convertRgbaToAscii()` into this order:

```ts
if (options.renderMode === 'braille') {
  const subcellWidth = dimensions.width * 2;
  const subcellHeight = dimensions.height * 4;
  const subcellSampled = downsampleToCells(
    image,
    channels,
    subcellWidth,
    subcellHeight,
    options.background,
  );
  const subcellProcessed = applyToneAndDetail(subcellSampled, subcellWidth, subcellHeight, options);
  const subcellIndices = mapToRampIndices(
    subcellProcessed,
    subcellWidth,
    subcellHeight,
    2,
    options.dither,
  );
  return {
    art: renderBrailleCells(
      subcellIndices,
      dimensions.width,
      dimensions.height,
      options.trimLineEnds,
    ),
    width: dimensions.width,
    height: dimensions.height,
    values: averageBrailleSubcells(subcellProcessed, dimensions.width, dimensions.height),
  };
}

const sampled = downsampleToCells(
  image,
  channels,
  dimensions.width,
  dimensions.height,
  options.background,
);
const processed = applyToneAndDetail(sampled, dimensions.width, dimensions.height, options);
const indices = mapToRampIndices(
  processed,
  dimensions.width,
  dimensions.height,
  Array.from(options.ramp).length,
  options.dither,
);
return {
  art: renderCharacters(indices, processed, dimensions.width, dimensions.height, options),
  width: dimensions.width,
  height: dimensions.height,
  values: processed,
};
```

This ordering leaves the established tone path unchanged. Braille applies the complete tone pipeline at 2×4 resolution, then averages each processed group of eight subcells into `ConversionResult.values`, exactly matching the approved result-shape contract.

- [ ] **Step 6: Run core compatibility tests and the legacy example verifier**

Run:

```bash
npx vitest run tests/ascii.test.ts tests/braille.test.ts tests/structure.test.ts
npm run build:cli
npm run verify:examples:built
```

Expected: all tests PASS and the three existing `examples/demo.*` files compare byte-identically.

## Task 6: Add the CLI `--style` contract and Braille-aware sampling

**Files:**

- Modify: `src/cli-options.ts:1-233`
- Modify: `src/cli/run.ts:1-174`
- Modify: `tests/cli-options.test.ts:1-98`
- Modify: `tests/cli-runtime.test.ts:55-249`
- Modify: `tests/cli-integration.test.ts:70-280`

- [ ] **Step 1: Write failing CLI precedence and incompatibility tests**

Add to `tests/cli-options.test.ts`:

```ts
it('applies preset, then style, then explicit overrides', () => {
  const command = parseCliCommand([
    'photo.png',
    '--preset',
    'portrait',
    '--style',
    'blocks-fine',
    '--width',
    '72',
    '--edge-glyphs',
  ]);
  expect(command).toMatchObject({
    help: false,
    options: {
      width: 72,
      ramp: RAMPS['blocks-fine'],
      renderMode: 'tone',
      edgeGlyphs: true,
      edgeStyle: 'ascii',
    },
  });
});

it('parses Braille and Structural Unicode styles', () => {
  expect(parseCliCommand(['photo.png', '--style', 'braille'])).toMatchObject({
    help: false,
    options: { renderMode: 'braille', edgeGlyphs: false },
  });
  expect(parseCliCommand(['photo.png', '--style', 'structure'])).toMatchObject({
    help: false,
    options: { renderMode: 'tone', edgeGlyphs: true, edgeStyle: 'unicode' },
  });
});

it('rejects unknown and explicitly incompatible style combinations', () => {
  expect(() => parseCliCommand(['photo.png', '--style', 'missing'])).toThrow(
    'Unknown style "missing". Available styles: readme, detailed, soft, minimal, blocks, blocks-fine, braille, structure.',
  );
  expect(() => parseCliCommand(['photo.png', '--style', 'braille', '--ramp', '@ '])).toThrow(
    '--style braille cannot be combined with --ramp.',
  );
  expect(() => parseCliCommand(['photo.png', '--style', 'braille', '--edge-glyphs'])).toThrow(
    '--style braille cannot be combined with --edge-glyphs.',
  );
});

it('allows a custom tonal fallback behind Structural Unicode', () => {
  expect(parseCliCommand(['photo.png', '--style', 'structure', '--ramp', '@ '])).toMatchObject({
    help: false,
    options: { ramp: '@ ', edgeGlyphs: true, edgeStyle: 'unicode' },
  });
});
```

Import `RAMPS` in this test.

- [ ] **Step 2: Confirm `--style` is currently rejected**

Run:

```bash
npx vitest run tests/cli-options.test.ts
```

Expected: FAIL with `Unknown option '--style'`.

- [ ] **Step 3: Parse and apply the shared style registry**

In `src/cli-options.ts`:

1. Import `CHARACTER_STYLES`, `applyCharacterStyle`, and `isCharacterStyleId`.
2. Add `style: { type: 'string' }` to `parseArgs()`.
3. Validate the style string before assembling explicit overrides.
4. Reject the two Braille conflicts by checking whether `parsed.values.ramp` or `parsed.values['edge-glyphs']` was explicitly supplied.
5. Replace the single `baseOptions` assignment with:

```ts
const presetOptions = optionsForPreset(presetId);
const styleId = parsed.values.style;
if (styleId !== undefined && !isCharacterStyleId(styleId)) {
  throw new Error(
    `Unknown style "${styleId}". Available styles: ${CHARACTER_STYLES.map(({ id }) => id).join(', ')}.`,
  );
}
if (styleId === 'braille' && parsed.values.ramp !== undefined) {
  throw new Error('--style braille cannot be combined with --ramp.');
}
if (styleId === 'braille' && parsed.values['edge-glyphs']) {
  throw new Error('--style braille cannot be combined with --edge-glyphs.');
}
const baseOptions =
  styleId === undefined ? presetOptions : applyCharacterStyle(presetOptions, styleId);
```

The existing explicit option object remains below this block, so width, ramp, dither, tone, background, inversion, ASCII edges, and thresholds override the selected style.

- [ ] **Step 4: Update CLI help from the shared public contract**

Add this line after `--preset` in `CLI_HELP`:

```text
      --style <name>        readme | detailed | soft | minimal | blocks | blocks-fine | braille | structure
```

Add one example for each new renderer:

```text
  readme-ascii photo.jpg --preset portrait --style blocks-fine --output photo.md
  readme-ascii photo.jpg --preset portrait --style braille --output photo.md
  readme-ascii logo.png --preset logo --style structure --format all --output docs/logo
```

- [ ] **Step 5: Resize Braille input to preserve real 2×4 subcells**

In `runCli()`, change only the requested decode dimensions:

```ts
const subcellScaleX = command.options.renderMode === 'braille' ? 2 : 1;
const subcellScaleY = command.options.renderMode === 'braille' ? 4 : 1;
const image = await runtime.loadImage(
  inputPath,
  outputDimensions.width * command.oversample * subcellScaleX,
  outputDimensions.height * command.oversample * subcellScaleY,
);
```

Existing tone commands must continue requesting the same dimensions.

- [ ] **Step 6: Test CLI help, early rejection, and sampling dimensions**

Import `ImageMetadata` beside `runCli`, then add to `tests/cli-runtime.test.ts`:

```ts
import { runCli, type ImageMetadata } from '../src/cli/run.js';
```

Add the factory and test:

```ts
function createRuntimeWithMetadata(metadataValue: ImageMetadata) {
  return {
    cwd: virtualProject,
    stdout: vi.fn(),
    stderr: vi.fn(),
    metadata: vi.fn(async () => metadataValue),
    loadImage: vi.fn(async (_path: string, width: number, height: number) =>
      opaqueImage(width, height),
    ),
    preflight: vi.fn(async () => undefined),
    write: vi.fn(async () => undefined),
  };
}

it('requests a true 2×4 source grid for Braille and rejects conflicts before metadata', async () => {
  const runtime = createRuntimeWithMetadata({ width: 400, height: 200 });
  await runCli(
    ['photo.png', '--style', 'braille', '--width', '10', '--height', '5', '--oversample', '2'],
    runtime,
  );
  expect(runtime.loadImage).toHaveBeenCalledWith(virtualPath('photo.png'), 40, 40);

  const rejected = createRuntimeWithMetadata({ width: 400, height: 200 });
  await expect(
    runCli(['photo.png', '--style', 'braille', '--edge-glyphs'], rejected),
  ).rejects.toThrow('--style braille cannot be combined with --edge-glyphs.');
  expect(rejected.metadata).not.toHaveBeenCalled();
});
```

- [ ] **Step 7: Add compiled CLI style smoke tests**

In `tests/cli-integration.test.ts`, add a table that runs `dist-cli/cli.js` against `examples/demo-source.png` with each style and asserts:

````ts
it.each(['blocks-fine', 'braille', 'structure'] as const)(
  'writes text, Markdown, and SVG for %s',
  async (style) => {
    const directory = await temporaryDirectory();
    const base = join(directory, style);
    const result = runCli([sourceFixture, '--style', style, '--format', 'all', '--output', base]);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain(`Wrote ${base}.txt\n`);
    expect(await readFile(`${base}.txt`, 'utf8')).not.toBe('');
    expect(await readFile(`${base}.md`, 'utf8')).toMatch(/^```text\n/u);
    expect(await readFile(`${base}.svg`, 'utf8')).toMatch(/role="img"/u);
  },
);
````

Also assert `--help` contains `--style <name>` and all eight IDs.

- [ ] **Step 8: Run CLI unit and compiled integration tests**

Run:

```bash
npx vitest run tests/cli-options.test.ts tests/cli-runtime.test.ts
npm run build:cli
npx vitest run tests/cli-integration.test.ts
```

Expected: all tests PASS; legacy default output remains byte-identical.

## Task 7: Replace the browser ramp control with Character Style

**Files:**

- Modify: `index.html:202-237`
- Modify: `src/browser/controls.ts:1-263`
- Modify: `src/browser/app.ts:94-125`
- Modify: `src/browser/output-controller.ts:1-204`
- Modify: `src/style.css:705-730,985-1050`
- Modify: `tests/browser-controls.test.ts:1-151`
- Modify: `tests/browser-app.test.ts`
- Modify: `tests/output-controller.test.ts`
- Modify: `tests/ui-contract.test.ts:55-180,250-270`

- [ ] **Step 1: Change the DOM contract in failing browser tests**

Update test fixtures and assertions from `ramp` to `characterStyle`:

```html
<span id="characterStyleLabel">Character style</span>
<div class="dropdown" data-dropdown="characterStyle" data-dropdown-meta="CHARACTER STYLE">
  <input id="characterStyle" name="characterStyle" type="hidden" value="readme" />
  <button
    id="characterStyleTrigger"
    class="dropdown-trigger"
    type="button"
    role="combobox"
    aria-haspopup="listbox"
    aria-expanded="false"
    aria-controls="characterStyleListbox"
    aria-labelledby="characterStyleLabel characterStyleValue"
  >
    <span class="dropdown-rail" aria-hidden="true"></span>
    <span class="dropdown-value">
      <strong id="characterStyleValue"></strong>
      <small id="characterStyleValueDescription"></small>
    </span>
    <span id="characterStyleValuePreview" class="dropdown-value-preview" hidden></span>
    <span class="dropdown-chevron" aria-hidden="true"></span>
  </button>
  <div id="characterStylePopover" class="dropdown-popover" hidden>
    <div id="characterStyleMeta" class="dropdown-meta" aria-hidden="true"></div>
    <div
      id="characterStyleListbox"
      class="dropdown-listbox"
      role="listbox"
      aria-labelledby="characterStyleLabel"
    ></div>
  </div>
</div>
```

In `tests/browser-controls.test.ts`, expect the selectable values:

```ts
expect(
  Array.from(document.querySelectorAll('#characterStyleListbox [role="option"]')).map((option) =>
    option.getAttribute('data-value'),
  ),
).toEqual([
  'custom',
  'readme',
  'detailed',
  'soft',
  'minimal',
  'blocks',
  'blocks-fine',
  'braille',
  'structure',
]);
```

The `custom` option is display-only and the eight public styles are selectable.

- [ ] **Step 2: Run browser control and UI contract tests to confirm failure**

Run:

```bash
npx vitest run tests/browser-controls.test.ts tests/ui-contract.test.ts
```

Expected: FAIL because the production DOM and adapter still expose `ramp`.

- [ ] **Step 3: Rename the production dropdown markup without adding another control**

In `index.html`, rename the label, hidden input, trigger, value, description, preview, popover, metadata, and listbox IDs from `ramp*` to `characterStyle*`. Use:

```html
<span id="characterStyleLabel">Character style</span>
<div class="dropdown" data-dropdown="characterStyle" data-dropdown-meta="CHARACTER STYLE">
  <input id="characterStyle" name="characterStyle" type="hidden" value="readme" />
</div>
```

Keep the existing edge checkbox. Rename its visible label to `ASCII edge overlay` so Structural Unicode is not confused with the legacy ASCII overlay.

- [ ] **Step 4: Drive browser entries from `CHARACTER_STYLES`**

In `src/browser/controls.ts`, replace `RAMP_ENTRIES` with:

```ts
export const CHARACTER_STYLE_ENTRIES: readonly DropdownOption[] = [
  {
    value: 'custom',
    label: 'Custom glyph configuration',
    description: 'Current glyph settings do not match a built-in style',
    selectable: false,
  },
  ...CHARACTER_STYLES.map(({ id, label, description, preview }) => ({
    value: id,
    label,
    description,
    preview,
  })),
];
```

Import `CHARACTER_STYLES`, `getCharacterStyle`, and `resolveCharacterStyleId`. Rename `rampInput` to `characterStyleInput` and create the dropdown with ID `characterStyle`.

- [ ] **Step 5: Implement adapter read/apply behavior and edge orthogonality**

Maintain a private four-field `retainedGlyphOptions`, initialized from `DEFAULT_OPTIONS`. Implement these rules:

```ts
function glyphOptionsFrom(options: AsciiOptions) {
  return {
    ramp: options.ramp,
    renderMode: options.renderMode,
    edgeGlyphs: options.edgeGlyphs,
    edgeStyle: options.edgeStyle,
  };
}
```

- `apply(options)` stores the exact glyph quartet, sets the dropdown with `resolveCharacterStyleId(options)`, checks `edgeGlyphs`, and disables the edge checkbox only for Braille.
- A user Character Style selection replaces `retainedGlyphOptions` with that registry overlay, updates the checkbox to the overlay default, and disables it for Braille.
- A user unchecking the edge checkbox while `structure` is selected replaces the retained quartet with the normal tone style resolved from the structural fallback ramp.
- A user checking or unchecking the edge checkbox on a normal tone style keeps that style selected, updates only retained `edgeGlyphs`, and keeps `edgeStyle: 'ascii'`.
- `read()` always starts from `retainedGlyphOptions`, then overlays the current checkbox state. This preserves an applied saved preset's structural fallback ramp and any valid but non-visual scalar field. It always returns `edgeGlyphs: false` for Braille.
- `renderInputs` contains `characterStyle` in the former ramp position and still exposes each render-affecting input exactly once.
- `dispose()` removes the two internal input listeners before destroying both dropdowns.

Use `DropdownController.setValue()` for programmatic state synchronization; it must not dispatch a user `input` event.

Use these handler/read shapes so programmatic Apply and user selection remain distinct:

```ts
const onCharacterStyleInput = (): void => {
  const style = getCharacterStyle(elements.characterStyleInput.value);
  if (!style) return;
  retainedGlyphOptions = { ...style.options };
  elements.edgeGlyphsInput.checked = style.options.edgeGlyphs;
  elements.edgeGlyphsInput.disabled = style.options.renderMode === 'braille';
};

const onEdgeGlyphsInput = (): void => {
  if (retainedGlyphOptions.renderMode === 'braille') {
    elements.edgeGlyphsInput.checked = false;
    return;
  }
  if (retainedGlyphOptions.edgeStyle === 'unicode' && !elements.edgeGlyphsInput.checked) {
    const fallbackId = resolveCharacterStyleId({
      ...DEFAULT_OPTIONS,
      ...retainedGlyphOptions,
      edgeGlyphs: false,
      edgeStyle: 'ascii',
    });
    const fallback = fallbackId === 'custom' ? undefined : getCharacterStyle(fallbackId);
    retainedGlyphOptions = fallback
      ? { ...fallback.options }
      : { ...retainedGlyphOptions, edgeGlyphs: false, edgeStyle: 'ascii' };
    characterStyleDropdown.setValue(fallbackId);
    return;
  }
  retainedGlyphOptions = {
    ...retainedGlyphOptions,
    edgeGlyphs: elements.edgeGlyphsInput.checked,
    edgeStyle: 'ascii',
  };
};
```

In `read()`, spread `retainedGlyphOptions` after `DEFAULT_OPTIONS` and retained hidden numeric fields, then set `edgeGlyphs` to false for Braille or to the current checkbox value otherwise. In `apply()`, assign `retainedGlyphOptions = glyphOptionsFrom(options)` before calling `characterStyleDropdown.setValue(resolveCharacterStyleId(options))`.

Add table-driven control tests for all eight IDs:

```ts
it.each(CHARACTER_STYLES)('applies $id with one user input event', (style) => {
  installControls();
  const controls = createConversionControls(document);
  const input = document.querySelector<HTMLInputElement>('#characterStyle')!;
  const onInput = vi.fn();
  input.addEventListener('input', onInput);
  document.querySelector<HTMLButtonElement>('#characterStyleTrigger')!.click();
  document.querySelector<HTMLElement>(`#characterStyleListbox [data-value="${style.id}"]`)!.click();
  expect(onInput).toHaveBeenCalledOnce();
  expect(controls.read()).toMatchObject(style.options);
  controls.dispose();
});

it('recognizes the legacy Logo preset as Minimal ASCII plus an ASCII edge overlay', () => {
  installControls();
  const controls = createConversionControls(document);
  controls.apply(optionsForPreset('logo'));
  expect(document.querySelector<HTMLInputElement>('#characterStyle')!.value).toBe('minimal');
  expect(document.querySelector<HTMLInputElement>('#edgeGlyphs')!.checked).toBe(true);
  expect(controls.read()).toEqual(optionsForPreset('logo'));
  controls.dispose();
});
```

Import `CHARACTER_STYLES` and `optionsForPreset` in `tests/browser-controls.test.ts`.

- [ ] **Step 6: Preserve real 2×4 sampling in the browser worker path**

In `src/browser/app.ts`, calculate preparation dimensions before calling `prepareImage()`:

```ts
const subcellScaleX = options.renderMode === 'braille' ? 2 : 1;
const subcellScaleY = options.renderMode === 'braille' ? 4 : 1;
const prepared = dependencies.prepareImage(
  loadedImage.source,
  dimensions.width * subcellScaleX,
  dimensions.height * subcellScaleY,
  oversample,
  options.background,
);
```

Add a browser-app test proving an 88×28 Braille output requests preparation for 176×112 cells before oversampling. Keep the existing tone preparation expectation unchanged.

- [ ] **Step 7: Make result metadata truthful for non-ramp renderers**

In `src/browser/output-controller.ts`, add:

```ts
function glyphSummary(options: AsciiOptions): string {
  const style = resolveCharacterStyleId(options);
  if (style === 'braille') return 'Braille 2×4 subcells';
  if (style === 'structure') return 'Structural Unicode';
  return `${Array.from(options.ramp).length} glyph levels`;
}
```

Then render:

```ts
resultMeta.textContent = `${input.width} columns × ${input.height} rows · ${glyphSummary(input.options)} · ${input.options.dither}`;
```

Update `tests/output-controller.test.ts` to assert the legacy metadata string is unchanged and the two renderer-specific summaries are used.

- [ ] **Step 8: Keep the longest style labels readable at 390px**

Keep the existing dropdown layout and add this route-independent mobile limit so the longest label retains enough text width:

```css
@media (max-width: 640px) {
  [data-dropdown='characterStyle'] .dropdown-option-trailing {
    max-width: 34%;
  }
}
```

Do not add a second row of renderer toggles or redesign unrelated controls.

- [ ] **Step 9: Run the focused browser suite**

Run:

```bash
npx vitest run tests/browser-controls.test.ts tests/browser-app.test.ts tests/output-controller.test.ts tests/ui-contract.test.ts
```

Expected: PASS, including the existing Logo preset appearing as `Minimal ASCII` with ASCII edge overlay checked.

## Task 8: Migrate saved browser presets from schema v1 to v2

**Files:**

- Modify: `src/browser/custom-presets.ts:1-341`
- Modify: `tests/custom-presets.test.ts:1-220`
- Modify: `tests/preset-controller.test.ts`
- Modify: `tests/preset-workflow.test.ts:1-523`

- [ ] **Step 1: Add failing mixed-version migration tests**

Add to `tests/custom-presets.test.ts`:

```ts
it('migrates schema v1 options in memory and always exports schema v2', () => {
  const v1Options = { ...settings().options } as Record<string, unknown>;
  delete v1Options.renderMode;
  delete v1Options.edgeStyle;
  const [migrated] = parseCustomPresetJson(
    JSON.stringify({
      schemaVersion: 1,
      name: 'Legacy',
      settings: { options: v1Options, collapsible: true },
    }),
  );
  expect(migrated).toMatchObject({
    schemaVersion: 2,
    settings: { options: { renderMode: 'tone', edgeStyle: 'ascii' } },
  });
  expect(JSON.parse(serializeCustomPreset(migrated!))).toMatchObject({ schemaVersion: 2 });
});

it('accepts mixed v1/v2 arrays and rejects unknown future versions atomically', () => {
  const current = addCustomPreset([], 'Current', settings({ renderMode: 'braille' }))[0]!;
  const legacy = JSON.parse(serializeCustomPreset(current));
  legacy.schemaVersion = 1;
  delete legacy.settings.options.renderMode;
  delete legacy.settings.options.edgeStyle;
  expect(parseCustomPresetJson(JSON.stringify([legacy, current]))).toHaveLength(2);
  expect(() => parseCustomPresetJson(JSON.stringify([{ ...current, schemaVersion: 3 }]))).toThrow(
    'Invalid preset: schemaVersion must be 1 or 2.',
  );
});

it('tracks renderer fields in dirty-state comparisons', () => {
  const preset = addCustomPreset([], 'Renderer', settings())[0]!;
  expect(isCustomPresetDirty(preset, settings({ renderMode: 'braille' }))).toBe(true);
  expect(isCustomPresetDirty(preset, settings({ edgeStyle: 'unicode' }))).toBe(true);
});
```

- [ ] **Step 2: Confirm schema v1-only parsing fails the new expectations**

Run:

```bash
npx vitest run tests/custom-presets.test.ts
```

Expected: FAIL because the current parser requires schema version 1 and has no new option fields.

- [ ] **Step 3: Split version-specific option shapes and normalize to v2**

Keep the storage key unchanged:

```ts
export const CUSTOM_PRESET_STORAGE_KEY = 'readme-ascii-studio.custom-presets.v1';
export const CUSTOM_PRESET_SCHEMA_VERSION = 2;
```

Rename the current key list to `OPTION_KEYS_V1`. Define:

```ts
const OPTION_KEYS_V2 = [...OPTION_KEYS_V1, 'renderMode', 'edgeStyle'] as const;
```

Extract the current scalar/background parser into this typed helper; `readOptions()` performs the exact-key check before calling it:

```ts
type LegacyAsciiOptions = Omit<AsciiOptions, 'renderMode' | 'edgeStyle'>;

function readSupportedRamp(value: unknown): string {
  if (typeof value !== 'string' || Array.from(value).length < 2) {
    presetError('ramp must contain at least two characters.');
  }
  if (!SUPPORTED_RAMPS.has(value)) {
    presetError('ramp is not supported by the browser interface.');
  }
  return value;
}

function readDither(value: unknown): DitherMode {
  if (typeof value !== 'string' || !DITHER_MODES.has(value as DitherMode)) {
    presetError('dither is not supported.');
  }
  return value as DitherMode;
}

function readLegacyOptions(value: Record<string, unknown>): LegacyAsciiOptions {
  const lowPercentile = readNumber(value.lowPercentile, 'lowPercentile', 0, 1);
  const highPercentile = readNumber(value.highPercentile, 'highPercentile', 0, 1);
  if (lowPercentile >= highPercentile) {
    presetError('lowPercentile must be lower than highPercentile.');
  }
  return {
    width: readNumber(value.width, 'width', 24, 180, true),
    cellAspectRatio: readNumber(value.cellAspectRatio, 'cellAspectRatio', 0.32, 0.78),
    ramp: readSupportedRamp(value.ramp),
    invert: readBoolean(value.invert, 'invert'),
    autoLevels: readBoolean(value.autoLevels, 'autoLevels'),
    lowPercentile,
    highPercentile,
    contrast: readNumber(value.contrast, 'contrast', 0.5, 2),
    brightness: readNumber(value.brightness, 'brightness', -0.45, 0.45),
    gamma: readNumber(value.gamma, 'gamma', 0.45, 2.2),
    detail: readNumber(value.detail, 'detail', 0, 2),
    dither: readDither(value.dither),
    edgeGlyphs: readBoolean(value.edgeGlyphs, 'edgeGlyphs'),
    edgeThreshold: readNumber(value.edgeThreshold, 'edgeThreshold', 0, 1),
    background: readBackground(value.background),
    trimLineEnds: readBoolean(value.trimLineEnds, 'trimLineEnds'),
  };
}
```

Retain the current ramp and dither error messages in `readSupportedRamp()` and `readDither()`. Implement the versioned wrapper exactly as:

```ts
function readOptions(value: unknown, schemaVersion: 1 | 2): AsciiOptions {
  const expectedKeys = schemaVersion === 1 ? OPTION_KEYS_V1 : OPTION_KEYS_V2;
  if (!isRecord(value) || !hasExactKeys(value, expectedKeys)) {
    presetError('settings.options has an unsupported shape.');
  }
  const legacy = readLegacyOptions(value);
  if (schemaVersion === 1) {
    return { ...legacy, renderMode: 'tone', edgeStyle: 'ascii' };
  }
  if (value.renderMode !== 'tone' && value.renderMode !== 'braille') {
    presetError('renderMode must be tone or braille.');
  }
  if (value.edgeStyle !== 'ascii' && value.edgeStyle !== 'unicode') {
    presetError('edgeStyle must be ascii or unicode.');
  }
  if (value.renderMode === 'braille' && legacy.edgeGlyphs) {
    presetError('Braille render mode cannot be combined with edge glyphs.');
  }
  return {
    ...legacy,
    renderMode: value.renderMode,
    edgeStyle: value.edgeStyle,
  };
}
```

Update `parsePreset()` to accept only numeric versions 1 and 2, parse with the matching shape, and always return `schemaVersion: 2`.

- [ ] **Step 4: Include new fields in clone, equality, and supported ramp logic**

Add `RAMPS['blocks-fine']` automatically through the existing `Object.values(RAMPS)` supported set. Add exact comparisons:

```ts
leftOptions.renderMode === rightOptions.renderMode &&
leftOptions.edgeStyle === rightOptions.edgeStyle &&
```

Because `cloneOptions()` spreads the full object, it already clones both scalar fields; keep the independent background clone.

- [ ] **Step 5: Prove storage migration is deferred until a successful mutation**

Add workflow/controller tests that:

1. Seed `CUSTOM_PRESET_STORAGE_KEY` with a schema v1 array.
2. Construct the workflow and confirm controls receive `tone/ascii` after Apply.
3. Confirm construction and Apply do not call `setItem()`.
4. Save or update a preset and confirm every stored entry is schema v2.
5. Attempt an import containing schema v3 and confirm the list, controls, selected preset, and storage bytes remain unchanged.

Use the existing in-memory storage helper and `vi.fn()`; do not change the cross-tab reread, collision suffix, limit, undo, or beforeunload behavior.

- [ ] **Step 6: Run all preset tests**

Run:

```bash
npx vitest run tests/custom-presets.test.ts tests/preset-controller.test.ts tests/preset-workflow.test.ts tests/browser-controls.test.ts
```

Expected: PASS for v1 migration, v2 persistence, mixed imports, unknown-version rejection, dirty state, and existing preset workflows.

## Task 9: Add deterministic fixtures, golden outputs, and tarball smoke coverage

**Files:**

- Create: `tests/fixtures/character-styles/gradient.svg`
- Create: `tests/fixtures/character-styles/transparent-logo.svg`
- Create: `tests/fixtures/character-styles/structure.svg`
- Create: `tests/fixtures/character-styles/portrait.svg`
- Create: `scripts/example-cases.mjs`
- Create: `examples/character-styles/blocks-fine.txt`
- Create: `examples/character-styles/blocks-fine.md`
- Create: `examples/character-styles/blocks-fine.svg`
- Create: `examples/character-styles/braille.txt`
- Create: `examples/character-styles/braille.md`
- Create: `examples/character-styles/braille.svg`
- Create: `examples/character-styles/structure.txt`
- Create: `examples/character-styles/structure.md`
- Create: `examples/character-styles/structure.svg`
- Modify: `scripts/verify-examples.mjs:1-42`
- Modify: `scripts/verify-package.mjs:1-17,408-495`
- Modify: `tests/package-verification.test.mjs`
- Modify: `tests/cli-integration.test.ts`

- [ ] **Step 1: Add four source-controlled geometric fixtures**

Create `tests/fixtures/character-styles/gradient.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="64" viewBox="0 0 256 64">
  <defs>
    <linearGradient id="tone" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000000" />
      <stop offset="1" stop-color="#ffffff" />
    </linearGradient>
  </defs>
  <rect width="256" height="64" fill="url(#tone)" />
</svg>
```

Create `tests/fixtures/character-styles/transparent-logo.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120">
  <path d="M20 100 L80 18 L140 100 Z" fill="#111111" fill-opacity="0.82" />
  <circle cx="80" cy="72" r="24" fill="none" stroke="#000000" stroke-width="10" />
  <path d="M48 102 H112" stroke="#000000" stroke-width="8" />
</svg>
```

Create `tests/fixtures/character-styles/structure.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <rect width="192" height="192" fill="#ffffff" />
  <g fill="none" stroke="#000000" stroke-width="8" stroke-linecap="square" stroke-linejoin="miter">
    <path d="M16 28 H80 V80 H16" />
    <path d="M112 20 V92 M88 56 H152" />
    <path d="M24 120 H88 M56 104 V168" />
    <path d="M112 112 L168 168 M168 112 L112 168" />
  </g>
</svg>
```

Create `tests/fixtures/character-styles/portrait.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="200" viewBox="0 0 160 200">
  <rect width="160" height="200" fill="#dedede" />
  <ellipse cx="80" cy="76" rx="44" ry="58" fill="#a8a8a8" />
  <ellipse cx="64" cy="70" rx="6" ry="4" fill="#777777" />
  <ellipse cx="96" cy="70" rx="6" ry="4" fill="#777777" />
  <path d="M76 78 L70 104 H86" fill="none" stroke="#888888" stroke-width="4" />
  <path d="M58 118 Q80 132 102 118" fill="none" stroke="#7a7a7a" stroke-width="4" />
  <path d="M34 190 Q42 138 80 138 Q118 138 126 190" fill="#969696" />
</svg>
```

These fixtures contain no external assets, fonts, filters, scripts, or licenses.

- [ ] **Step 2: Define one shared example case matrix**

Create `scripts/example-cases.mjs`:

```js
export const EXAMPLE_CASES = [
  {
    name: 'demo',
    input: 'examples/demo-source.png',
    expectedBase: 'examples/demo',
    arguments: ['--preset', 'readme'],
  },
  {
    name: 'blocks-fine',
    input: 'tests/fixtures/character-styles/gradient.svg',
    expectedBase: 'examples/character-styles/blocks-fine',
    arguments: [
      '--style',
      'blocks-fine',
      '--width',
      '32',
      '--height',
      '8',
      '--oversample',
      '2',
      '--dither',
      'none',
    ],
  },
  {
    name: 'braille',
    input: 'tests/fixtures/character-styles/portrait.svg',
    expectedBase: 'examples/character-styles/braille',
    arguments: [
      '--style',
      'braille',
      '--width',
      '32',
      '--height',
      '20',
      '--oversample',
      '2',
      '--dither',
      'atkinson',
    ],
  },
  {
    name: 'structure',
    input: 'tests/fixtures/character-styles/structure.svg',
    expectedBase: 'examples/character-styles/structure',
    arguments: [
      '--style',
      'structure',
      '--width',
      '32',
      '--height',
      '32',
      '--oversample',
      '2',
      '--dither',
      'none',
      '--edge-threshold',
      '0.12',
    ],
  },
];
```

- [ ] **Step 3: Generalize local golden verification**

Refactor `scripts/verify-examples.mjs` to import `EXAMPLE_CASES`, create one temporary output base per case, invoke the built CLI with:

```js
[
  join(root, 'dist-cli/cli.js'),
  join(root, example.input),
  ...example.arguments,
  '--format',
  'all',
  '--output',
  outputBase,
];
```

For every case and every `txt`, `md`, and `svg` extension, compare the generated buffer with `join(root, `${example.expectedBase}.${extension}`)`. Include the case name and extension in mismatch errors. Preserve the existing `try/finally` cleanup.

- [ ] **Step 4: Generate the nine new golden files once**

After `npm run build:cli`, run the exact case commands into `examples/character-styles/`:

```bash
node dist-cli/cli.js tests/fixtures/character-styles/gradient.svg --style blocks-fine --width 32 --height 8 --oversample 2 --dither none --format all --output examples/character-styles/blocks-fine
node dist-cli/cli.js tests/fixtures/character-styles/portrait.svg --style braille --width 32 --height 20 --oversample 2 --dither atkinson --format all --output examples/character-styles/braille
node dist-cli/cli.js tests/fixtures/character-styles/structure.svg --style structure --width 32 --height 32 --oversample 2 --dither none --edge-threshold 0.12 --format all --output examples/character-styles/structure
```

Then run:

```bash
npm run verify:examples:built
```

Expected: the legacy demo and all nine new golden files compare byte-for-byte.

- [ ] **Step 5: Verify new styles through the installed npm tarball**

Import `EXAMPLE_CASES` in `scripts/verify-package.mjs`. Replace the single installed-CLI demo call with a loop over all cases:

```js
for (const example of EXAMPLE_CASES) {
  const outputBase = join(temporaryDirectory, example.name);
  await runNpm(
    [
      'exec',
      '--offline',
      '--prefix',
      consumerDirectory,
      '--',
      executableName,
      join(root, example.input),
      ...example.arguments,
      '--format',
      'all',
      '--output',
      outputBase,
    ],
    { cwd: consumerDirectory },
  );
  await comparePackagedExample(example, outputBase);
}
```

Rename `comparePackagedExamples()` to `comparePackagedExample(example, outputBase)` and compare against `example.expectedBase`. Keep `npm pack --ignore-scripts`, temporary consumer installation, `npm exec --offline --prefix`, `--help`, and final cleanup unchanged.

- [ ] **Step 6: Lock dynamic tarball behavior in tests**

Extend `tests/package-verification.test.mjs` with:

```js
it('accepts newly compiled renderer modules without a frozen entry count', () => {
  const files = buildExpectedPackageFileList([
    'dist-cli/cli.js',
    'dist-cli/core/ascii.js',
    'dist-cli/core/character-styles.js',
    'dist-cli/core/braille.js',
    'dist-cli/core/structure.js',
  ]);
  assert.deepEqual(files, [
    'LICENSE',
    'README.md',
    'dist-cli/cli.js',
    'dist-cli/core/ascii.js',
    'dist-cli/core/braille.js',
    'dist-cli/core/character-styles.js',
    'dist-cli/core/structure.js',
    'package.json',
  ]);
});
```

Keep the existing leak rejection for source, tests, docs, examples, lockfile, maps, and declarations.

- [ ] **Step 7: Exercise the transparent fixture through the compiled CLI**

Add this compiled CLI integration test:

```ts
it('composites the transparent fixture against the selected background', () => {
  const fixture = join(
    repositoryRoot,
    'tests',
    'fixtures',
    'character-styles',
    'transparent-logo.svg',
  );
  const common = [fixture, '--style', 'blocks-fine', '--format', 'text'] as const;
  const light = runCli([...common, '--background', '#ffffff']);
  const dark = runCli([...common, '--background', '#000000']);
  expect(light.status).toBe(0);
  expect(dark.status).toBe(0);
  expect(light.stdout).not.toBe(dark.stdout);
});
```

This proves the fixture is used and alpha compositing reaches the compiled conversion path.

- [ ] **Step 8: Run golden, CLI, and package verification**

Run:

```bash
npm run build:cli
npm run verify:examples:built
npx vitest run tests/cli-integration.test.ts
node --test tests/package-verification.test.mjs
npm run verify:package
```

Expected: all commands PASS; the verifier reports a dynamic file count and the installed tarball CLI reproduces all twelve golden files.

## Task 10: Exercise the complete production browser workflow

**Files:**

- Modify: `e2e/studio.e2e.ts:1-89`

- [ ] **Step 1: Add a failing real-file style workflow test**

Import `readFile` and `fileURLToPath`, then define:

```ts
const sourceFixture = fileURLToPath(new URL('../examples/demo-source.png', import.meta.url));

async function downloadedText(page: Page, buttonName: string): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: buttonName, exact: true }).click(),
  ]);
  const path = await download.path();
  if (!path) throw new Error(`Download ${buttonName} has no local path.`);
  return readFile(path, 'utf8');
}
```

Add a test that uploads the actual PNG fixture and selects `Fine blocks`, `Braille subcells`, and `Structural Unicode` in sequence. For every selection:

1. Wait for status `Ready` and a non-empty preview.
2. Assert `#characterStyle` contains the expected stable ID.
3. Assert metadata contains `9 glyph levels`, `Braille 2×4 subcells`, or `Structural Unicode` respectively.
4. Select ASCII, Markdown, and SVG tabs one at a time.
5. Read `#output`, use the contextual copy button, and assert `navigator.clipboard.readText()` equals the textarea exactly.
6. Download the selected format and assert the downloaded UTF-8 bytes equal the textarea exactly.
7. Assert there are no console or page errors.

Use this table:

```ts
const styles = [
  { option: 'Fine blocks', id: 'blocks-fine', meta: '9 glyph levels' },
  { option: 'Braille subcells', id: 'braille', meta: 'Braille 2×4 subcells' },
  { option: 'Structural Unicode', id: 'structure', meta: 'Structural Unicode' },
] as const;
```

Use this output table:

```ts
const outputs = [
  { tab: 'ASCII', copy: 'Copy ASCII', download: 'Download .txt' },
  { tab: 'Markdown', copy: 'Copy Markdown', download: 'Download .md' },
  { tab: 'SVG', copy: 'Copy SVG', download: 'Download .svg' },
] as const;
```

- [ ] **Step 2: Confirm the new production test fails before UI implementation is complete**

Run:

```bash
npm run build:web
npm run test:e2e:built
```

Expected: the new test initially FAILS on the missing Character Style UI or renderer metadata.

- [ ] **Step 3: Add saved-preset v2 persistence to the E2E path**

After selecting Structural Unicode:

```ts
await page.locator('#customPresetName').fill('Structural README');
await page.getByRole('button', { name: 'Save as New' }).click();
await page.reload();
await expect(page.locator('#status')).toHaveText('Ready');
await page.getByRole('button', { name: 'Apply saved preset Structural README' }).click();
await expect(page.locator('#characterStyle')).toHaveValue('structure');
await expect(page.locator('#edgeGlyphs')).toBeChecked();
const stored = await page.evaluate(
  (key) => localStorage.getItem(key),
  'readme-ascii-studio.custom-presets.v1',
);
expect(stored).not.toBeNull();
expect(JSON.parse(stored!)).toEqual([
  expect.objectContaining({
    schemaVersion: 2,
    settings: expect.objectContaining({
      options: expect.objectContaining({ renderMode: 'tone', edgeStyle: 'unicode' }),
    }),
  }),
]);
```

- [ ] **Step 4: Expand the 390px test for the longest labels**

At the mobile viewport, open the Character Style dropdown, select Structural Unicode, wait for render, and rerun the existing page-overflow assertion. Also assert the selected label and description are visible and the option has at least a 44px hit target.

- [ ] **Step 5: Run production E2E twice to catch lifecycle races**

Run:

```bash
npm run build:web
npm run test:e2e:built
npm run test:e2e:built
```

Expected: both runs PASS with no console errors, byte mismatches, stale renders, or horizontal page overflow.

## Task 11: Update the public documentation and architecture map

**Files:**

- Modify: `README.md:3-33,55-173,205-277,279-360`

- [ ] **Step 1: Update product highlights without weakening the strict-ASCII default**

Document that:

- `README balanced` and the `readme` character style remain strict ASCII defaults.
- Fine Blocks offers nine ordered Unicode block levels.
- Braille uses real 2×4 subcells and can preserve compact detail.
- Structural Unicode follows contour connectivity with straight, diagonal, corner, T, and cross glyphs.
- Unicode rendering is opt-in and font-dependent.
- Text, Markdown, SVG, and all-format output work for every style.

Keep the local-first, no-upload, dynamic Markdown fence, accessible SVG, and CLI-only npm package statements.

- [ ] **Step 2: Add CLI style examples and explain precedence**

Add these exact examples to the CLI section:

```bash
readme-ascii photo.jpg --preset portrait --style blocks-fine --output photo.md
readme-ascii photo.jpg --preset portrait --style braille --output photo.md
readme-ascii logo.png --preset logo --style structure --format all --output docs/logo
```

Explain the order: preset defaults, then `--style`, then explicit flags. State that Braille rejects explicit `--ramp` and `--edge-glyphs`, while Structural Unicode accepts a custom fallback ramp.

- [ ] **Step 3: Replace the Character ramps section with Character styles plus advanced ramps**

Add a table with all eight IDs, portability, renderer model, and intended use. Keep a smaller advanced CLI note listing all six named tone ramps, including:

```text
blocks-fine  █▉▊▋▌▍▎▏
```

Retain the custom `--ramp '@#*:. '` example and clarify that custom ramps belong to tone/Structural fallback rendering, not Braille packing.

- [ ] **Step 4: Document schema v2 and release verification**

State that exported presets now use schema v2; stored/imported schema v1 presets migrate in memory with `renderMode: tone` and `edgeStyle: ascii`; the browser storage key remains unchanged; unknown future versions are rejected without partial import.

Update verification text so `npm run release:check` explicitly covers the production browser, compiled CLI, legacy/new golden files, installed tarball CLI, and dynamic CLI-only allowlist. State that `npm publish --dry-run` is verification only and no live publish occurs.

- [ ] **Step 5: Add new core modules to the architecture tree and limitations**

List `character-styles.ts`, `braille.ts`, and `structure.ts` under `src/core/`. Add limitations for Unicode glyph width/font rendering and explain that strict ASCII is the safest cross-platform README choice.

- [ ] **Step 6: Run README/package-reference validation**

Run:

```bash
npx prettier --check README.md
npm run build:cli
npm run verify:package
```

Expected: formatting PASS and the packaged README references only external URLs, anchors, `LICENSE`, or files present in the CLI tarball.

## Task 12: Run the complete release-readiness gate

**Files:**

- Verify only; fix failures in the owning files listed above.

- [ ] **Step 1: Install exactly from the lockfile and run static/unit gates**

Run:

```bash
npm ci
npm run check
npm run test:coverage
```

Expected: lockfile host check, all TypeScript projects, oxlint with zero warnings, Prettier, Vitest, and configured coverage thresholds PASS.

- [ ] **Step 2: Build both products and verify browser/CLI behavior**

Run:

```bash
npm run build
npm run test:e2e:built
npm run test:cli:built
npm run verify:package
```

Expected: production browser E2E, compiled CLI tests, all golden comparisons, tarball installation, `readme-ascii --help`, and installed style conversions PASS.

- [ ] **Step 3: Audit dependencies and run the complete release script**

Run:

```bash
npm audit --audit-level=high
npm run release:check
```

Expected: no high/critical audit failure and the complete release gate exits 0.

- [ ] **Step 4: Verify each supported Node major without changing repository files**

Using an installed Node version manager, run `npm run release:check` under Node `20.19.x`, `22.23.x`, the current supported Node 24 release, and the current supported Node 26 release. For `nvm`, the exact pattern is:

```bash
nvm exec 20.19 npm run release:check
nvm exec 22.23 npm run release:check
nvm exec 24 npm run release:check
nvm exec 26 npm run release:check
```

Expected: each command prints the requested Node major and exits 0. If the local machine lacks a requested runtime, report that version as unverified rather than editing `engines` or GitHub Actions.

- [ ] **Step 5: Inspect npm pack dry-run contents**

Run:

```bash
npm pack --dry-run --foreground-scripts
```

Expected: `prepack` runs the full gate; the tarball contains only `package.json`, `README.md`, `LICENSE`, and dynamically discovered `dist-cli/**/*.js`. It contains no `src`, `tests`, `.github`, `docs`, `examples`, `package-lock.json`, `.map`, or `.d.ts` entry.

- [ ] **Step 6: Finish with a publish dry run only**

Run:

```bash
npm publish --dry-run --foreground-scripts
```

Expected: public-registry dry-run metadata and the same CLI-only allowlist are printed. No registry write, npm account prompt, 2FA prompt, Git operation, or live package reservation occurs.

- [ ] **Step 7: Record the final evidence**

Report:

- The exact test/build/release commands that passed.
- Any Node major that could not be exercised locally.
- Confirmation that all three legacy demo files stayed byte-identical.
- The dynamically reported npm tarball file count and allowed paths.
- Confirmation that the final npm command was a dry run and no real publish occurred.
