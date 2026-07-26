# README ASCII Studio Repository Hardening Implementation Plan

**Implementation status:** Completed and verified on 2026-07-10. Later follow-up hardening is tracked in `2026-07-10-final-hardening.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the browser app, shared conversion core, CLI, GitHub workflows, tests, and documentation safe, deterministic, reproducible, and maintainable while preserving existing output fixtures and visual identity.

**Architecture:** Add one shared runtime-validation boundary, move browser conversion behind a worker client, split browser/CLI side effects from pure logic, and make release checks explicit. Implement in independently verifiable stages with regression tests written before each fix.

**Tech Stack:** TypeScript 7, Vite 8, Vitest 4, Sharp, Web Workers, happy-dom, Oxlint, Prettier, V8 coverage, GitHub Actions.

---

## File map

- `src/core/validation.ts`: shared option and dimension limits.
- `src/core/ascii.ts`: conversion pipeline and performance fixes.
- `src/core/markdown.ts`, `src/core/svg.ts`, `src/core/presets.ts`: safe formatters and explicit preset lookup.
- `src/browser/image.ts`: decode and stable bitmap capture.
- `src/browser/image-selection.ts`: revisioned image-selection controller and paste-target policy.
- `src/browser/render-protocol.ts`: worker request/response types.
- `src/browser/ascii.worker.ts`: worker conversion entry point.
- `src/browser/render-client.ts`: revision-aware worker client.
- `src/browser/output.ts`: output formatting, clipboard, and download helpers.
- `src/browser/preset-controller.ts`: saved-preset list and editing-state orchestration.
- `src/main.ts`: thin DOM composition and event wiring.
- `src/cli/run.ts`: testable CLI orchestration.
- `src/cli/files.ts`: output preflight and atomic file writes.
- `src/cli.ts`: thin process entry point.
- `tests/*.test.ts`: unit, DOM, worker-client, and integration coverage.
- `tsconfig.base.json`, `tsconfig.json`, `tsconfig.cli.json`, `tsconfig.tests.json`, `tsconfig.vite.json`: separated type environments.
- `.oxlintrc.json`, `.prettierrc.json`, `.prettierignore`, `vitest.config.ts`: quality gates.
- `package.json`, `package-lock.json`, `.github/workflows/*.yml`: reproducible scripts and CI.
- `README.md`, `docs/reference-analysis-tr.md`: accurate public documentation.

### Task 1: Capture the baseline and public dependency lock

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/check-lockfile-host.mjs`

- [x] **Step 1: Add a failing lockfile-host check**

```js
import { readFile } from 'node:fs/promises';

const lock = await readFile(new URL('../package-lock.json', import.meta.url), 'utf8');
const forbidden = 'packages.applied-caas-gateway1.internal.api.openai.org';
if (lock.includes(forbidden)) {
  throw new Error(`package-lock.json contains forbidden registry host: ${forbidden}`);
}
```

- [x] **Step 2: Verify the check fails on the current lockfile**

Run: `node scripts/check-lockfile-host.mjs`

Expected: non-zero exit with `package-lock.json contains forbidden registry host`.

- [x] **Step 3: Regenerate registry URLs without changing dependency versions**

Run: `npm install --package-lock-only --ignore-scripts --registry=https://registry.npmjs.org/ --replace-registry-host=always`

Expected: `package-lock.json` retains locked versions and all `resolved` URLs use `registry.npmjs.org`.

- [x] **Step 4: Add `check:lockfile` to package scripts and verify**

```json
"check:lockfile": "node scripts/check-lockfile-host.mjs"
```

Run: `npm run check:lockfile && npm ci --ignore-scripts`

Expected: both commands succeed with no internal hostname.

- [x] **Step 5: Record the checkpoint when Git metadata is restored**

```bash
git add package.json package-lock.json scripts/check-lockfile-host.mjs
git commit -m "build: make dependency lock portable"
```

Current checkout behavior: skip only the commit because `.git` is absent.

### Task 2: Add shared runtime validation and bounded dimensions

**Files:**

- Create: `src/core/validation.ts`
- Modify: `src/core/ascii.ts`
- Modify: `src/cli-options.ts`
- Test: `tests/validation.test.ts`
- Test: `tests/ascii.test.ts`

- [x] **Step 1: Write failing boundary tests**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '../src/core/presets.js';
import { resolveOutputDimensions, validateAsciiOptions } from '../src/core/validation.js';

describe('shared validation', () => {
  it('rejects an automatically derived height before allocation', () => {
    expect(() => resolveOutputDimensions(1, 10_000, 88, 0.5)).toThrow(
      'outputHeight must be an integer between 1 and 400.',
    );
  });

  it('rejects malformed runtime options', () => {
    expect(() => validateAsciiOptions({ ...DEFAULT_OPTIONS, dither: 'invalid' } as never)).toThrow(
      'dither must be one of',
    );
    expect(() =>
      validateAsciiOptions({ ...DEFAULT_OPTIONS, background: { r: 0, g: 0 } } as never),
    ).toThrow('background must contain exactly r, g, and b.');
  });

  it('bounds ramps to Uint16 index capacity', () => {
    expect(() => validateAsciiOptions({ ...DEFAULT_OPTIONS, ramp: 'x'.repeat(65_537) })).toThrow(
      'ramp must contain at most 65536 characters.',
    );
  });
});
```

- [x] **Step 2: Run the focused tests and confirm the missing-module failure**

Run: `npx vitest run tests/validation.test.ts tests/ascii.test.ts`

Expected: failure because `src/core/validation.ts` does not exist.

- [x] **Step 3: Implement the shared contract**

```ts
export const MAX_OUTPUT_WIDTH = 400;
export const MAX_OUTPUT_HEIGHT = 400;
export const MAX_RAMP_LENGTH = 65_536;
export const DITHER_MODES = ['none', 'floyd-steinberg', 'atkinson', 'bayer'] as const;

export interface OutputDimensions {
  width: number;
  height: number;
}

export function resolveOutputDimensions(
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  cellAspectRatio: number,
  requestedHeight?: number,
): OutputDimensions;

export function validateAsciiOptions(options: AsciiOptions): void;
```

Implementation requirements: finite positive source dimensions; integer width 2–400; finite aspect ratio greater than 0 and at most 2; explicit or derived integer height 1–400; exact RGB keys; boolean fields; percentile ordering; supported dither; 2–65,536 ramp code points; existing numeric option bounds.

- [x] **Step 4: Route all direct conversions through shared validation**

`calculateOutputHeight` delegates to `resolveOutputDimensions`; `convertRgbaToAscii` validates options and resolves an explicit/derived height before downsampling. `parseCliCommand` validates its fully assembled `AsciiOptions` before returning.

- [x] **Step 5: Verify focused and full tests**

Run: `npx vitest run tests/validation.test.ts tests/ascii.test.ts tests/cli-options.test.ts && npm run check`

Expected: all tests pass and invalid options fail before image decoding.

- [x] **Step 6: Record the checkpoint when Git metadata is restored**

```bash
git add src/core/validation.ts src/core/ascii.ts src/cli-options.ts tests/validation.test.ts tests/ascii.test.ts tests/cli-options.test.ts
git commit -m "fix: validate conversion bounds before allocation"
```

### Task 3: Harden formatters, presets, and core performance

**Files:**

- Modify: `src/core/ascii.ts`
- Modify: `src/core/markdown.ts`
- Modify: `src/core/svg.ts`
- Modify: `src/core/presets.ts`
- Test: `tests/ascii.test.ts`
- Test: `tests/format.test.ts`
- Create: `tests/presets.test.ts`

- [x] **Step 1: Add failing formatter and preset tests**

````ts
it('rejects a structural Markdown language value', () => {
  expect(() => toMarkdown('art', { language: 'text\n```\n<script>' })).toThrow(
    'language must be a single Markdown info-string token.',
  );
});

it('rejects invalid SVG metrics', () => {
  expect(() => toSvg('art', { fontSize: Number.POSITIVE_INFINITY })).toThrow(
    'fontSize must be a finite number greater than 0.',
  );
  expect(() => toSvg('art', { padding: -1 })).toThrow(
    'padding must be a finite number greater than or equal to 0.',
  );
});

it('does not silently select an unknown preset', () => {
  expect(() => optionsForPreset('missing')).toThrow('Unknown preset "missing".');
});
````

- [x] **Step 2: Confirm the tests fail for the audited behavior**

Run: `npx vitest run tests/format.test.ts tests/presets.test.ts`

Expected: unsafe language and invalid SVG metrics do not yet throw; unknown preset currently falls back.

- [x] **Step 3: Implement safe formatter validation**

Markdown accepts `/^[A-Za-z0-9_+-]*$/u` as the optional language token. SVG accepts finite positive `fontSize`/`lineHeight`, finite non-negative padding, and calculated axes no larger than 32,768 pixels.

- [x] **Step 4: Make preset lookup explicit and immutable**

```ts
export const PRESETS = [
  {
    id: 'readme',
    label: 'README balanced',
    description: 'Reliable pure ASCII, moderate detail, and a width that fits most README layouts.',
    options: {
      width: 88,
      ramp: RAMPS.readme,
      contrast: 1.08,
      gamma: 1,
      detail: 0.55,
      dither: 'atkinson',
      edgeGlyphs: false,
    },
  },
  {
    id: 'portrait',
    label: 'Portrait',
    description: 'Long density ramp and stronger local detail for faces and textured photos.',
    options: {
      width: 96,
      ramp: RAMPS.detailed,
      contrast: 1.12,
      gamma: 1.04,
      detail: 0.8,
      dither: 'atkinson',
      edgeGlyphs: false,
    },
  },
  {
    id: 'logo',
    label: 'Logo / line art',
    description: 'Short ramp and structural edge glyphs for icons, logos, and drawings.',
    options: {
      width: 76,
      ramp: RAMPS.minimal,
      contrast: 1.3,
      gamma: 0.95,
      detail: 1.05,
      dither: 'none',
      edgeGlyphs: true,
      edgeThreshold: 0.17,
    },
  },
  {
    id: 'ultra',
    label: 'Ultra detail',
    description: 'Wider output for desktop READMEs and downloadable SVG previews.',
    options: {
      width: 120,
      ramp: RAMPS.detailed,
      contrast: 1.1,
      gamma: 1,
      detail: 0.9,
      dither: 'floyd-steinberg',
      edgeGlyphs: false,
    },
  },
  {
    id: 'unicode',
    label: 'Unicode blocks',
    description:
      'Compact high-contrast output; not strict ASCII but renders well in GitHub code blocks.',
    options: {
      width: 92,
      ramp: RAMPS.blocks,
      contrast: 1.08,
      detail: 0.45,
      dither: 'atkinson',
      edgeGlyphs: false,
    },
  },
] as const satisfies readonly Preset[];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}

export function optionsForPreset(id: string): AsciiOptions {
  const preset = getPreset(id);
  if (!preset) throw new Error(`Unknown preset "${id}".`);
  return {
    ...DEFAULT_OPTIONS,
    ...preset.options,
    background: { ...DEFAULT_OPTIONS.background, ...preset.options.background },
  };
}
```

- [x] **Step 5: Remove duplicate percentile sorting and skip unused blur**

Sort once inside `applyAutoLevels`, calculate both quantiles from the same sorted array, and set `blurred` to `null` when `options.detail === 0`. Preserve all committed example outputs.

- [x] **Step 6: Verify unit tests and golden output**

Run: `before=$(mktemp); shasum examples/demo.txt examples/demo.md examples/demo.svg > "$before"; npm test; npm run examples; shasum -c "$before"; rm "$before"`

Expected: tests pass; regenerated example bytes remain unchanged. When `.git` is absent, perform comparison in a temporary directory instead of modifying `examples/`.

- [x] **Step 7: Record the checkpoint when Git metadata is restored**

```bash
git add src/core tests/ascii.test.ts tests/format.test.ts tests/presets.test.ts
git commit -m "fix: harden core formatters and presets"
```

### Task 4: Make browser image selection deterministic and conversion responsive

**Files:**

- Modify: `src/browser/image.ts`
- Create: `src/browser/image-selection.ts`
- Create: `src/browser/render-protocol.ts`
- Create: `src/browser/ascii.worker.ts`
- Create: `src/browser/render-client.ts`
- Modify: `src/main.ts`
- Create: `tests/image-selection.test.ts`
- Create: `tests/render-client.test.ts`

- [x] **Step 1: Write a failing stale-selection test**

```ts
it('disposes a stale decoded image and keeps the newest selection', async () => {
  const pending = new Map<string, (image: LoadedImage) => void>();
  const applied: string[] = [];
  const disposed: string[] = [];
  const controller = createImageSelectionController(
    (file) => new Promise((resolve) => pending.set(file.name, resolve)),
    {
      onBusy: () => undefined,
      onImage: (image) => applied.push(image.name),
      onError: () => undefined,
    },
  );

  const first = controller.accept(new File([], 'first.png', { type: 'image/png' }));
  const second = controller.accept(new File([], 'second.png', { type: 'image/png' }));
  pending.get('second.png')!(fakeImage('second', disposed));
  pending.get('first.png')!(fakeImage('first', disposed));
  await Promise.all([first, second]);

  expect(applied).toEqual(['second']);
  expect(disposed).toEqual(['first']);
});
```

- [x] **Step 2: Write failing paste and worker revision tests**

Test that `isEditablePasteTarget` returns true for input, textarea, select, and contenteditable nodes; test that the worker client resolves responses by revision and the caller ignores stale results.

- [x] **Step 3: Confirm focused tests fail**

Run: `npx vitest run tests/image-selection.test.ts tests/render-client.test.ts`

Expected: missing-module failures.

- [x] **Step 4: Capture one stable decoded bitmap**

`loadImageFile` accepts an empty MIME type, rejects an explicit non-image MIME, decodes the preview URL, captures an `ImageBitmap`, and disposes both the bitmap and URL. If bitmap capture fails after successful decode, return a clear browser-decoding error and revoke the URL.

- [x] **Step 5: Implement revisioned image selection**

```ts
export interface ImageSelectionCallbacks {
  onBusy(): void;
  onImage(image: LoadedImage): void;
  onError(message: string): void;
}

export function createImageSelectionController(
  load: (file: File) => Promise<LoadedImage>,
  callbacks: ImageSelectionCallbacks,
): { accept(file: File | undefined): Promise<void> };

export function isEditablePasteTarget(target: EventTarget | null): boolean;
```

- [x] **Step 6: Implement the worker protocol and client**

```ts
export interface RenderRequest {
  revision: number;
  data: ArrayBuffer;
  width: number;
  height: number;
  outputHeight: number;
  options: AsciiOptions;
}

export type RenderResponse =
  | { revision: number; ok: true; art: string; width: number; height: number }
  | { revision: number; ok: false; message: string };
```

The client transfers the prepared buffer, maps responses by revision, rejects structured errors, and rejects all pending requests if the worker itself fails.

- [x] **Step 7: Route `main.ts` rendering through the worker**

Validate dimensions and the 648,000-pixel preparation budget before Canvas creation. Await the worker response, ignore stale revisions, then generate Markdown/SVG and update the DOM. The main thread never calls `convertRgbaToAscii` directly.

- [x] **Step 8: Verify tests and production bundling**

Run: `npx vitest run tests/image-selection.test.ts tests/render-client.test.ts && npm run build:web`

Expected: focused tests pass and Vite emits both application and worker bundles.

- [x] **Step 9: Record the checkpoint when Git metadata is restored**

```bash
git add src/browser src/main.ts tests/image-selection.test.ts tests/render-client.test.ts
git commit -m "fix: make browser rendering deterministic and responsive"
```

### Task 5: Split browser controllers and fix interaction/accessibility gaps

**Files:**

- Create: `src/browser/output.ts`
- Create: `src/browser/preset-controller.ts`
- Modify: `src/main.ts`
- Modify: `index.html`
- Modify: `src/style.css`
- Modify: `tests/ui-contract.test.ts`
- Create: `tests/browser-output.test.ts`
- Create: `tests/preset-controller.test.ts`

- [x] **Step 1: Write behavior tests for duplicated helpers and announcements**

Test output extension/MIME naming, clipboard fallback cleanup, preset dirty/update/delete/undo transitions, and ensure `setPresetFeedback` updates only the preset live region rather than echoing the same message into global status.

- [x] **Step 2: Extract output helpers**

```ts
export function generatedOutputs(
  art: string,
  name: string,
  options: AsciiOptions,
  collapsible: boolean,
): Record<OutputFormat, string>;
export function downloadGenerated(
  content: string,
  format: OutputFormat,
  baseName: string,
  document: Document,
  url: typeof URL,
): void;
export async function copyText(
  content: string,
  navigator: Navigator,
  document: Document,
): Promise<boolean>;
```

- [x] **Step 3: Extract saved-preset UI state**

Create a controller that owns selected/active/deleted names, persistence, dirty state, and undo expiry. It exposes state snapshots and commands; DOM rendering consumes those snapshots without owning preset business rules.

- [x] **Step 4: Apply interaction fixes**

Ignore image paste from editable targets; keep the current `beforeunload` dirty-preset guard; use one live region per message; keep the real hidden file input controlled by its visible label/button; avoid duplicate `input`/`change` render scheduling where one event is sufficient.

- [x] **Step 5: Apply narrow visual/accessibility fixes**

Add `<meta name="theme-color" content="#080a0d" />`; raise `--faint` to a color meeting 4.5:1 on used surfaces; apply `overflow-wrap: anywhere` to `.meta-line`; preserve focus-visible and reduced-motion rules.

- [x] **Step 6: Verify DOM tests and local browser behavior**

Run: `npx vitest run tests/ui-contract.test.ts tests/browser-output.test.ts tests/preset-controller.test.ts && npm run build:web`

Expected: behavior tests pass, no duplicate live announcement, and the production interface builds.

- [x] **Step 7: Record the checkpoint when Git metadata is restored**

```bash
git add src/browser src/main.ts index.html src/style.css tests
git commit -m "refactor: split browser controllers"
```

### Task 6: Protect and modularize the CLI

**Files:**

- Create: `src/cli/run.ts`
- Create: `src/cli/files.ts`
- Modify: `src/cli.ts`
- Modify: `tsconfig.cli.json`
- Create: `tests/cli-integration.test.ts`
- Test: `tests/cli-options.test.ts`

- [x] **Step 1: Write failing integration tests**

Use `node:child_process` against the compiled CLI and temporary directories. Assert help/stdout, text/Markdown/SVG/all outputs, extreme-aspect rejection, non-zero errors, and refusal of `demo-source.png -o demo-source.png` without changing the source hash.

- [x] **Step 2: Confirm the collision test currently overwrites a disposable copied input**

Run only inside a temporary directory: `npx vitest run tests/cli-integration.test.ts -t "refuses to overwrite"`

Expected: failure because the current CLI does not reject the collision. Never run the reproduction against `examples/demo-source.png` itself.

- [x] **Step 3: Implement output preflight**

```ts
export interface OutputTarget {
  format: Exclude<CliFormat, 'all'>;
  path: string;
  contents: string;
}

export async function assertOutputsDoNotReplaceInput(
  input: string,
  outputs: readonly string[],
): Promise<void>;
export async function writeFileAtomically(path: string, contents: string): Promise<void>;
```

Compare resolved input/output paths and existing real paths. Write a unique temporary sibling file with exclusive creation, then rename; clean the temporary file on failure.

- [x] **Step 4: Implement injectable orchestration**

```ts
export interface CliRuntime {
  stdout(text: string): void;
  stderr(text: string): void;
  loadImage(path: string, width: number, height: number): Promise<RgbaImage>;
  metadata(path: string): Promise<Metadata>;
  write(path: string, contents: string): Promise<void>;
}

export async function runCli(args: readonly string[], runtime: CliRuntime): Promise<void>;
```

`src/cli.ts` creates the real Sharp/filesystem runtime, calls `runCli`, and translates one caught error into `Error: ...` plus exit code 1.

- [x] **Step 5: Verify integration and golden outputs**

Run: `npm run build:cli && npx vitest run tests/cli-options.test.ts tests/cli-integration.test.ts`

Expected: all cases pass, source hashes stay unchanged, and three-format output matches the committed examples.

- [x] **Step 6: Record the checkpoint when Git metadata is restored**

```bash
git add src/cli.ts src/cli src/cli-options.ts tsconfig.cli.json tests/cli-options.test.ts tests/cli-integration.test.ts
git commit -m "fix: prevent destructive CLI output"
```

### Task 7: Separate type environments and add quality gates

**Files:**

- Create: `tsconfig.base.json`
- Modify: `tsconfig.json`
- Modify: `tsconfig.cli.json`
- Create: `tsconfig.tests.json`
- Create: `tsconfig.vite.json`
- Create: `.oxlintrc.json`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `vitest.config.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] **Step 1: Install exact quality-tool dependencies through npm**

Run: `npm install --save-dev @types/node@20.19.43 oxlint@1.73.0 prettier@3.9.5 happy-dom@20.10.6 @vitest/coverage-v8@4.1.10 --registry=https://registry.npmjs.org/`

Expected: manifest and lockfile update without internal registry URLs.

- [x] **Step 2: Split TypeScript configs**

`tsconfig.base.json` keeps ES2022 target, strict mode, noUncheckedIndexedAccess, and interoperability flags. Browser config uses DOM/Bundler/Vite types; CLI config uses NodeNext and Node 20 types; tests use DOM plus Node; Vite config uses Node only.

- [x] **Step 3: Add scripts**

```json
"clean:cli": "node -e \"require('node:fs').rmSync('dist-cli', { recursive: true, force: true })\"",
"typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.cli.json --noEmit && tsc -p tsconfig.tests.json --noEmit && tsc -p tsconfig.vite.json --noEmit",
"lint": "oxlint --deny-warnings src tests scripts vite.config.ts vitest.config.ts",
"format:check": "prettier --check .",
"test:coverage": "vitest run --coverage",
"test:cli": "npm run build:cli && vitest run tests/cli-integration.test.ts && node scripts/verify-examples.mjs",
"check": "npm run check:lockfile && npm run typecheck && npm run lint && npm run format:check && npm test",
"release:check": "npm run check && npm run test:coverage && npm run build && npm run test:cli"
```

- [x] **Step 4: Configure lint, format, and coverage**

Ignore `node_modules`, `dist`, `dist-cli`, coverage, and generated example art. Use Oxlint's correctness/suspicious/performance rules and Prettier with single quotes, trailing commas, and 100-column width. Oxlint is selected because the current `typescript-eslint` peer range excludes TypeScript 7. Coverage includes logic modules, excludes thin entry points/declarations, and enforces 80% lines/functions/statements and 75% branches.

- [x] **Step 5: Clean and format only repository source/config/docs**

Run: `npx prettier --write src tests scripts package.json tsconfig*.json vite.config.ts vitest.config.ts .oxlintrc.json .github README.md docs`

Expected: formatting succeeds without modifying generated ASCII example output.

- [x] **Step 6: Run the full quality gate**

Run: `npm run check && npm run test:coverage && npm run build`

Expected: all commands succeed; `dist-cli` contains no stale deleted modules.

- [x] **Step 7: Record the checkpoint when Git metadata is restored**

```bash
git add package.json package-lock.json tsconfig*.json .oxlintrc.json .prettierrc.json .prettierignore vitest.config.ts src tests scripts
git commit -m "build: add separated quality gates"
```

### Task 8: Gate GitHub Pages and finish documentation

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/pages.yml`
- Modify: `README.md`
- Modify: `docs/reference-analysis-tr.md`
- Modify: `package.json`
- Create: `scripts/verify-examples.mjs`

- [x] **Step 1: Add deterministic example verification**

The script builds the CLI, writes all formats to a temporary directory, compares each byte-for-byte with `examples/demo.txt`, `examples/demo.md`, and `examples/demo.svg`, and removes the temporary directory in `finally`.

- [x] **Step 2: Update CI and Pages gates**

CI uses a matrix of `20.19.0` and `22.x`, runs `npm ci`, `npm run check`, and builds. Pages runs `npm ci` and `npm run release:check` before uploading `dist`; deployment remains conditional on the verified build job.

- [x] **Step 3: Update public documentation**

Add saved-preset persistence/import/export, stable single-frame animated-image conversion, 400-row limit/remedies, expanded architecture files, quality commands, and complete image dimensions. Correct browser versus CLI oversampling ranges in `docs/reference-analysis-tr.md`.

- [x] **Step 4: Run the final release gate**

Run: `npm run release:check && npm audit --omit=dev && npm outdated`

Expected: release gate passes, audit reports zero runtime vulnerabilities, and outdated reports no packages.

- [x] **Step 5: Run browser smoke checks**

Serve `dist`, load desktop and 375px mobile viewports, verify no horizontal document overflow or console errors, switch all output formats, save/apply/update/delete/undo a preset, and confirm copy/download controls reflect current output.

- [x] **Step 6: Record the checkpoint when Git metadata is restored**

```bash
git add .github package.json scripts/verify-examples.mjs README.md docs/reference-analysis-tr.md
git commit -m "docs: document and gate hardened release"
```

## Final verification checklist

- [x] `rg -n "packages\.applied-caas-gateway1\.internal\.api\.openai\.org" package-lock.json` returns no matches.
- [x] `npm ci` succeeds against the public registry.
- [x] `npm run release:check` succeeds.
- [x] Core, browser, worker, preset, formatter, and CLI tests pass.
- [x] Coverage meets 80/80/80/75 thresholds.
- [x] Demo outputs remain byte-identical.
- [x] CLI input/output collision leaves the source hash unchanged.
- [x] Desktop and mobile browser smoke tests pass without console errors or page overflow.
- [x] README and technical reference match implementation limits and commands.
- [x] Git commit/push/PR steps remain skipped until the actual Git checkout is available.
