# README ASCII Studio Final Hardening Implementation Plan

**Implementation status:** Completed and verified on 2026-07-10.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every verified correctness, accessibility, persistence, release-gating, and documentation finding while preserving the existing ASCII fixtures and UI design.

**Architecture:** Keep the shared conversion core and worker/CLI split. Add focused validation and measurement helpers, move logic-bearing browser bootstrap code behind an injectable `createBrowserApp` boundary, and make CI enforce the same release contract used by Pages. Every behavior change begins with a failing regression test.

**Tech Stack:** TypeScript 7, Vite 8, Vitest 4, happy-dom, Sharp, Web Workers, Oxlint, Prettier, GitHub Actions, actionlint.

---

## File map

- `src/core/markdown.ts`: preserve logical rows in fenced output.
- `src/core/svg.ts`: preserve logical rows, export text validation, and measure Unicode display width.
- `src/core/validation.ts`: reject unpaired surrogates in ramps.
- `src/cli-options.ts`: respect the `--` option terminator.
- `src/cli/run.ts`: validate SVG titles before metadata and decoding.
- `src/cli/files.ts`: preserve existing destination permission bits.
- `src/browser/custom-presets.ts`: bounded collections, valid duplicate names, linear merge, distinct validation/storage errors.
- `src/browser/controls.ts`, `index.html`: stable range names and updated accessible values.
- `src/browser/app.ts`: injectable, logic-bearing browser orchestration moved out of the entry point.
- `src/main.ts`: thin Vite/browser dependency composition.
- `scripts/check-lockfile-host.mjs`: parsed public-registry allowlist validation.
- `.github/workflows/ci.yml`, `.github/workflows/pages.yml`: complete PR gate, immutable actions, OS checks, least privilege.
- `README.md`, `docs/superpowers/{plans,specs}/*.md`: accurate limits, workflow behavior, and completion state.
- `tests/*.test.ts`: focused regressions and executable browser-app coverage.

### Task 1: Preserve formatter rows and make SVG Unicode geometry conservative

**Files:**

- Modify: `src/core/markdown.ts:23-36`
- Modify: `src/core/svg.ts:4-100`
- Modify: `src/core/validation.ts:151-166`
- Modify: `tests/format.test.ts`
- Modify: `tests/validation.test.ts`

- [x] **Step 1: Add failing row-preservation and Unicode tests**

Add these cases to `tests/format.test.ts`:

````ts
it('preserves terminal blank rows in Markdown', () => {
  const output = toMarkdown('A\n\n');
  expect(output).toContain('```text\nA\n\n\n```');
});

it('emits one SVG row for every logical input row', () => {
  const output = toSvg('\n\n');
  expect(output.match(/<tspan /gu)).toHaveLength(3);
});

it('uses conservative display cells for wide and zero-width Unicode', () => {
  const asciiWidth = Number(/width="(\d+)"/u.exec(toSvg('AA'))?.[1]);
  const cjkWidth = Number(/width="(\d+)"/u.exec(toSvg('界界'))?.[1]);
  const combiningWidth = Number(/width="(\d+)"/u.exec(toSvg('e\u0301e\u0301'))?.[1]);
  expect(cjkWidth).toBeGreaterThan(asciiWidth);
  expect(combiningWidth).toBe(asciiWidth);
});
````

Add this case to `tests/validation.test.ts`:

```ts
it('rejects unpaired UTF-16 surrogates in ramps', () => {
  expect(() => validateAsciiOptions({ ...DEFAULT_OPTIONS, ramp: '@\ud800' })).toThrow(
    'ramp cannot contain unpaired UTF-16 surrogates.',
  );
});
```

- [x] **Step 2: Run the focused tests and confirm failure**

Run: `npx vitest run tests/format.test.ts tests/validation.test.ts`

Expected: Markdown/SVG row counts, Unicode geometry, and surrogate validation fail on the current implementation.

- [x] **Step 3: Implement row-preserving normalization**

Use one normalization helper in both formatters without terminal trimming:

```ts
function normalizeArt(art: string): string {
  if (typeof art !== 'string') throw new TypeError('art must be a string.');
  return art.replace(/\r\n?/gu, '\n');
}
```

In `toMarkdown`, replace the current chained `.replace(/\n+$/u, '')` with `normalizeArt(art)`. In `toSvg`, split `normalizeArt(art)` directly so `"\n\n"` produces three rows.

- [x] **Step 4: Add deterministic Unicode display-cell measurement**

Add and use these helpers in `src/core/svg.ts`:

```ts
const ZERO_WIDTH_CHARACTER = /[\p{Mark}\u200d\ufe00-\ufe0f]/u;
const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

function isWideCodePoint(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  );
}

export function displayCellWidth(value: string): number {
  let width = 0;
  for (const character of value) {
    if (ZERO_WIDTH_CHARACTER.test(character)) continue;
    const codePoint = character.codePointAt(0)!;
    width += isWideCodePoint(codePoint) || EXTENDED_PICTOGRAPHIC.test(character) ? 2 : 1;
  }
  return width;
}
```

Use `displayCellWidth(line)` instead of `Array.from(line).length` when calculating `maxCharacters`.

- [x] **Step 5: Reject unpaired surrogates at shared validation**

Inside the existing ramp loop, add:

```ts
if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
  throw new RangeError('ramp cannot contain unpaired UTF-16 surrogates.');
}
```

- [x] **Step 6: Run focused and compatibility tests**

Run: `npx vitest run tests/format.test.ts tests/validation.test.ts tests/ascii.test.ts && npm run verify:examples`

Expected: all pass and `npm run verify:examples` remains byte-identical.

### Task 2: Validate CLI input before expensive work and respect `--`

**Files:**

- Modify: `src/core/svg.ts:24-31`
- Modify: `src/cli-options.ts:105-122`
- Modify: `src/cli/run.ts:71-170`
- Modify: `tests/cli-options.test.ts`
- Modify: `tests/cli-runtime.test.ts`

- [x] **Step 1: Add failing CLI ordering and terminator tests**

Add to `tests/cli-runtime.test.ts`:

```ts
it('rejects an invalid SVG title before metadata, preflight, or pixel loading', async () => {
  const runtime = {
    cwd: virtualProject,
    stdout: vi.fn(),
    stderr: vi.fn(),
    metadata: vi.fn(async () => ({ width: 1, height: 1 })),
    loadImage: vi.fn(async () => opaqueImage(1, 1)),
    preflight: vi.fn(async () => undefined),
    write: vi.fn(async () => undefined),
  };
  await expect(
    runCli(
      ['source.png', '--format', 'svg', '--title', 'bad\u0001title', '--output', 'art.svg'],
      runtime,
    ),
  ).rejects.toThrow('title contains a character that XML 1.0 cannot represent.');
  expect(runtime.metadata).not.toHaveBeenCalled();
  expect(runtime.preflight).not.toHaveBeenCalled();
  expect(runtime.loadImage).not.toHaveBeenCalled();
});
```

Add to `tests/cli-options.test.ts`:

```ts
it('does not normalize option-looking positionals after the terminator', () => {
  expect(() => parseCliCommand(['--', '--brightness', '-0.2'])).toThrow(
    'Exactly one input image path is required.',
  );
});
```

- [x] **Step 2: Confirm both tests fail**

Run: `npx vitest run tests/cli-options.test.ts tests/cli-runtime.test.ts`

Expected: the title test records metadata/load calls and the terminator case is accepted incorrectly.

- [x] **Step 3: Export the formatter text assertion**

Rename and export the existing SVG helper without changing its checks:

```ts
export function assertXmlText(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string.`);
  if (containsInvalidXmlCharacter(value)) {
    throw new TypeError(`${name} contains a character that XML 1.0 cannot represent.`);
  }
}
```

- [x] **Step 4: Resolve and validate the title before metadata**

In `runCli`, compute the title immediately after parsing:

```ts
const title =
  command.title?.trim() || basename(command.input, extname(command.input)) || 'ASCII art';
if (command.format === 'svg' || command.format === 'all') {
  assertXmlText('title', `${title} rendered as ASCII art`);
}
```

Only then resolve the input and call `runtime.metadata`. Remove the later duplicate title declaration.

- [x] **Step 5: Stop normalization at the option terminator**

At the top of the normalization loop add:

```ts
if (argument === '--') {
  normalized.push(...args.slice(index));
  break;
}
```

- [x] **Step 6: Run focused and compiled CLI tests**

Run: `npx vitest run tests/cli-options.test.ts tests/cli-runtime.test.ts && npm run test:cli`

Expected: all pass; invalid titles do no metadata or decode work.

### Task 3: Preserve destination permissions during atomic writes

**Files:**

- Modify: `src/cli/files.ts:1-65`
- Modify: `tests/cli-runtime.test.ts`

- [x] **Step 1: Add a failing POSIX mode regression**

Add a test guarded only on Windows:

```ts
it.skipIf(process.platform === 'win32')('preserves an existing destination mode', async () => {
  const directory = await temporaryDirectory();
  const output = join(directory, 'private.txt');
  await writeFile(output, 'old', { mode: 0o600 });

  await writeFileAtomically(output, 'new');

  expect((await stat(output)).mode & 0o777).toBe(0o600);
  expect(await readFile(output, 'utf8')).toBe('new');
});
```

Import `stat` and `writeFile` from `node:fs/promises` in the test.

- [x] **Step 2: Confirm the current implementation changes `0600` to the umask mode**

Run: `npx vitest run tests/cli-runtime.test.ts -t 'preserves an existing destination mode'`

Expected: fail with actual mode `0644` under the normal test umask.

- [x] **Step 3: Apply the existing mode to the temporary file**

Import `chmod` and add:

```ts
async function existingMode(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).mode & 0o777;
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined;
    throw error;
  }
}
```

Inside `writeFileAtomically`, read the mode before creating the temporary file and apply it before rename:

```ts
const mode = await existingMode(resolvedPath);
await writeFile(temporaryPath, contents, { encoding: 'utf8', flag: 'wx' });
if (mode !== undefined) await chmod(temporaryPath, mode);
await rename(temporaryPath, resolvedPath);
```

- [x] **Step 4: Run output-safety and compiled CLI tests**

Run: `npx vitest run tests/cli-runtime.test.ts && npm run test:cli`

Expected: mode, collision, atomic cleanup, and compiled subprocess tests pass.

### Task 4: Bound and linearize custom-preset persistence

**Files:**

- Modify: `src/browser/custom-presets.ts:4-307`
- Modify: `src/main.ts` before the app extraction
- Modify: `tests/custom-presets.test.ts`
- Modify: `tests/preset-controller.test.ts`

- [x] **Step 1: Add failing name, count, and storage-error tests**

Add to `tests/custom-presets.test.ts`:

```ts
it('keeps suffixed duplicate names within 80 characters', () => {
  const target = memoryStorage();
  const name = 'x'.repeat(80);
  const presets = addCustomPreset(addCustomPreset([], name, settings()), name, settings());
  expect(presets[1]?.name).toHaveLength(80);
  expect(presets[1]?.name.endsWith(' (2)')).toBe(true);
  expect(saveCustomPresets(target, presets)).toBe(true);
});

it('rejects imports and merges above the preset limit', () => {
  const preset = addCustomPreset([], 'One', settings())[0]!;
  expect(() => parseCustomPresetJson(JSON.stringify(Array(101).fill(preset)))).toThrow(
    'at most 100 presets',
  );
  expect(() => mergeImportedPresets(Array(100).fill(preset), [preset])).toThrow(
    'at most 100 presets',
  );
});

it('does not report validation failure as a storage permission failure', () => {
  const target = memoryStorage();
  const invalid = { ...addCustomPreset([], 'Valid', settings())[0]!, name: 'x'.repeat(81) };
  expect(() => saveCustomPresets(target, [invalid])).toThrow(
    'name must be 80 characters or fewer.',
  );
});
```

- [x] **Step 2: Confirm the current edge cases fail**

Run: `npx vitest run tests/custom-presets.test.ts tests/preset-controller.test.ts`

Expected: duplicate persistence returns false, excessive imports are accepted, and validation is swallowed.

- [x] **Step 3: Add explicit constants and bounded name allocation**

Add:

```ts
export const MAX_CUSTOM_PRESETS = 100;
export const MAX_PRESET_IMPORT_BYTES = 1_048_576;
const MAX_PRESET_NAME_LENGTH = 80;

function allocateUniqueName(name: string, used: Set<string>): string {
  if (!used.has(name.toLocaleLowerCase())) {
    used.add(name.toLocaleLowerCase());
    return name;
  }
  for (let sequence = 2; sequence <= MAX_CUSTOM_PRESETS + 1; sequence += 1) {
    const suffix = ` (${sequence})`;
    const base = name.slice(0, MAX_PRESET_NAME_LENGTH - suffix.length).trimEnd();
    const candidate = `${base}${suffix}`;
    if (!used.has(candidate.toLocaleLowerCase())) {
      used.add(candidate.toLocaleLowerCase());
      return candidate;
    }
  }
  presetError('a unique name could not be allocated within the preset limit.');
}
```

- [x] **Step 4: Make merges single-pass and enforce limits**

Replace reduce-plus-clone merging with one bounded pass:

```ts
export function mergeImportedPresets(
  existing: readonly CustomPreset[],
  imported: readonly CustomPreset[],
): CustomPreset[] {
  if (existing.length + imported.length > MAX_CUSTOM_PRESETS) {
    presetError(`at most ${MAX_CUSTOM_PRESETS} presets may be saved.`);
  }
  const merged = existing.map(clonePreset);
  const used = new Set(merged.map(({ name }) => name.toLocaleLowerCase()));
  for (const value of imported) {
    const preset = parsePreset(value);
    merged.push({ ...preset, name: allocateUniqueName(preset.name, used) });
  }
  return merged;
}
```

Apply the same allocator and maximum check in `addCustomPreset`. In `parseCustomPresetJson`, reject `records.length > MAX_CUSTOM_PRESETS` before mapping.

- [x] **Step 5: Separate validation from storage failure**

Serialize outside the storage exception handler:

```ts
const serialized = JSON.stringify(presets.map(parsePreset));
try {
  storage.setItem(CUSTOM_PRESET_STORAGE_KEY, serialized);
  return true;
} catch {
  return false;
}
```

- [x] **Step 6: Reject oversized files before reading them**

In the import handler, before `file.text()`:

```ts
if (file.size > MAX_PRESET_IMPORT_BYTES) {
  throw new Error('Preset import must be 1 MiB or smaller.');
}
```

Add an app-level regression in Task 6 that supplies a file-like object whose `text` spy must not run.

- [x] **Step 7: Run all preset tests**

Run: `npx vitest run tests/custom-presets.test.ts tests/preset-controller.test.ts tests/preset-list-view.test.ts`

Expected: all pass and persistence errors remain actionable.

### Task 5: Stabilize range-control accessible names

**Files:**

- Modify: `index.html:162-285`
- Modify: `src/browser/controls.ts:128-167`
- Modify: `tests/browser-controls.test.ts`
- Modify: `tests/ui-contract.test.ts`

- [x] **Step 1: Add failing accessible-name/value contract tests**

Update the control test fixture to use static label IDs and add:

```ts
it('keeps stable range labels while exposing formatted current values', () => {
  installControls();
  const controls = createConversionControls(document);
  controls.apply({ ...DEFAULT_OPTIONS, width: 96, contrast: 1.12, gamma: 1.04, detail: 0.8 });

  expect(document.querySelector('#width')?.getAttribute('aria-labelledby')).toBe('widthLabel');
  expect(document.querySelector('#width')?.getAttribute('aria-valuetext')).toBe('96');
  expect(document.querySelector('#contrast')?.getAttribute('aria-valuetext')).toBe('1.12');
  expect(document.querySelector('#widthValue')?.getAttribute('aria-hidden')).toBe('true');
});
```

Update `tests/ui-contract.test.ts` to require `for`, static label IDs, `aria-labelledby`, and `aria-hidden="true"` on each visual output.

- [x] **Step 2: Confirm the current markup and controller fail**

Run: `npx vitest run tests/browser-controls.test.ts tests/ui-contract.test.ts`

Expected: missing stable labels and `aria-valuetext` assertions fail.

- [x] **Step 3: Update range markup**

Use this pattern for width and repeat it for aspect, contrast, gamma, detail, and brightness:

```html
<label class="field" for="width">
  <span id="widthLabel">Width <output id="widthValue" aria-hidden="true">88</output></span>
  <input
    id="width"
    name="outputWidth"
    type="range"
    aria-labelledby="widthLabel"
    aria-valuetext="88"
    min="24"
    max="180"
    step="1"
    value="88"
  />
</label>
```

- [x] **Step 4: Update displayed and accessible values together**

Refactor `updateDisplayedValues` through a helper:

```ts
function updateRangeValue(input: HTMLInputElement, output: HTMLOutputElement, value: string): void {
  output.value = value;
  input.setAttribute('aria-valuetext', value);
}
```

Use exact existing precision: integer width and two decimals for the other five values.

- [x] **Step 5: Run DOM tests and production build**

Run: `npx vitest run tests/browser-controls.test.ts tests/ui-contract.test.ts && npm run build:web`

Expected: stable-label tests and Vite build pass.

### Task 6: Move browser orchestration behind an executable app boundary

**Files:**

- Create: `src/browser/app.ts`
- Modify: `src/main.ts`
- Create: `tests/browser-app.test.ts`
- Modify: `vitest.config.ts:9-16`

- [x] **Step 1: Add the failing app-boundary test scaffold**

Create `tests/browser-app.test.ts` with happy-dom, load the body markup from `index.html`, and supply explicit doubles:

```ts
// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserApp } from '../src/browser/app.js';
import type { LoadedImage } from '../src/browser/image.js';

function workerDouble(): Worker {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  return {
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      const registered = listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
      registered.add(listener);
      listeners.set(type, registered);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.get(type)?.delete(listener);
    }),
    postMessage: vi.fn(),
    terminate: vi.fn(),
  } as unknown as Worker;
}

function loadedImageDouble(): LoadedImage {
  return {
    source: document.createElement('canvas'),
    width: 2,
    height: 1,
    name: 'demo',
    previewUrl: 'blob:demo',
    dispose: vi.fn(),
  };
}

beforeEach(() => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  document.documentElement.innerHTML = /<html[^>]*>([\s\S]*)<\/html>/u.exec(html)?.[1] ?? '';
});

it('wires format selection and disposes every owned lifecycle', async () => {
  const worker = workerDouble();
  const app = createBrowserApp({
    document,
    window,
    navigator,
    urlApi: URL,
    createWorker: () => worker,
    createInitialImage: loadedImageDouble,
    loadImage: vi.fn(),
    prepareImage: vi.fn(() => ({
      data: new Uint8ClampedArray([0, 0, 0, 255]),
      width: 1,
      height: 1,
      channels: 4,
    })),
  });

  document.querySelector<HTMLButtonElement>('[data-output="text"]')!.click();
  expect(document.querySelector('[data-output="text"]')?.getAttribute('aria-pressed')).toBe('true');
  app.dispose();
  expect(worker.terminate).toHaveBeenCalledOnce();
});
```

- [x] **Step 2: Confirm the module is missing**

Run: `npx vitest run tests/browser-app.test.ts`

Expected: fail because `src/browser/app.ts` does not exist.

- [x] **Step 3: Introduce the explicit application dependency contract**

Create `src/browser/app.ts` with:

```ts
import { prepareImageData, type LoadedImage } from './image.js';

export interface BrowserAppDependencies {
  document: Document;
  window: Window;
  navigator: Navigator;
  urlApi: typeof URL;
  createWorker(): Worker;
  createInitialImage(): LoadedImage;
  loadImage(file: File): Promise<LoadedImage>;
  prepareImage: typeof prepareImageData;
}

export interface BrowserApp {
  dispose(): void;
}
```

Implement `createBrowserApp(dependencies)` in the same file. Mechanically move current `src/main.ts`
lines 38-527 into the factory, retaining the exact bodies of `element`, storage selection, status,
preset CRUD/import/export, output refresh, render scheduling, image selection, clipboard/download, and
event wiring. Replace direct `document`, `window`, `navigator`, `URL`, `new Worker`, `createDemoImage`,
`loadImageFile`, and `prepareImageData` references with the matching dependency. The only behavior
changes in this move are the already-tested preset import byte guard and idempotent public `dispose()`.

- [x] **Step 4: Make disposal explicit and idempotent**

Inside the factory, keep one flag and centralize the existing pagehide cleanup:

```ts
let disposed = false;
const dispose = (): void => {
  if (disposed) return;
  disposed = true;
  renderLifecycle.dispose();
  imageSelection.dispose();
  copiedFeedback.dispose();
  presetDropdown.destroy();
  conversionControls.dispose();
  renderClient.dispose();
  presetController.dispose();
  loadedImage.dispose();
};
```

Return `{ dispose }`. Register and remove `beforeunload`, `pagehide`, paste, drag/drop, form, control, tab, copy, and download listeners within the factory so tests can verify no callbacks fire after disposal.

- [x] **Step 5: Reduce `src/main.ts` to environment composition**

The complete entry point becomes:

```ts
import './style.css';
import { createBrowserApp } from './browser/app.js';
import { createDemoImage, loadImageFile, prepareImageData } from './browser/image.js';

createBrowserApp({
  document,
  window,
  navigator,
  urlApi: URL,
  createWorker: () =>
    new Worker(new URL('./browser/ascii.worker.ts', import.meta.url), { type: 'module' }),
  createInitialImage: createDemoImage,
  loadImage: loadImageFile,
  prepareImage: prepareImageData,
});
```

- [x] **Step 6: Add executable wiring regressions**

Expand `tests/browser-app.test.ts` with named tests that: reject a file whose `size` is 1,048,577
without calling its `text` spy; resolve a pending image load after `dispose` and assert its image is
disposed without DOM changes; deliver worker replies out of order and assert only the newest revision
updates output; click through preset save/apply/delete/undo; exercise clipboard rejection and success;
and dispatch a control input after disposal while asserting no render request occurs. Use deferred
promises and fake timers; do not use fixed sleeps.

- [x] **Step 7: Include app logic in coverage**

Keep only `src/main.ts` as the thin excluded entry point. `src/browser/app.ts` is already matched by `src/browser/**/*.ts` and must not be excluded.

- [x] **Step 8: Run browser tests, coverage, and build**

Run: `npx vitest run tests/browser-app.test.ts tests/render-lifecycle.test.ts tests/image-selection.test.ts tests/browser-output.test.ts tests/custom-presets.test.ts && npm run test:coverage && npm run build:web`

Expected: app wiring executes under tests and repository coverage remains above every configured threshold.

### Task 7: Enforce public dependencies and complete release gates

**Files:**

- Modify: `scripts/check-lockfile-host.mjs`
- Create: `tests/lockfile-host.test.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/pages.yml`

- [x] **Step 1: Add failing lockfile validator tests**

Refactor the script to export `validateLockfile` and test these complete fixtures:

```js
import { expect, it } from 'vitest';
import { validateLockfile } from '../scripts/check-lockfile-host.mjs';

const fixture = (resolved, integrity = 'sha512-test') => ({
  packages: { 'node_modules/x': { resolved, integrity } },
});

it('accepts only HTTPS registry.npmjs.org artifacts with integrity', () => {
  expect(() =>
    validateLockfile(fixture('https://registry.npmjs.org/x/-/x-1.0.0.tgz')),
  ).not.toThrow();
});

it('rejects private, HTTP, or integrity-free resolved packages', () => {
  expect(() =>
    validateLockfile(fixture('https://registry.private.example/x/-/x-1.0.0.tgz')),
  ).toThrow('registry.npmjs.org');
  expect(() => validateLockfile(fixture('http://registry.npmjs.org/x/-/x-1.0.0.tgz'))).toThrow(
    'HTTPS',
  );
  expect(() => validateLockfile(fixture('https://registry.npmjs.org/x/-/x-1.0.0.tgz', ''))).toThrow(
    'integrity',
  );
});
```

- [x] **Step 2: Confirm the current script has no importable validator**

Run: `npx vitest run tests/lockfile-host.test.mjs`

Expected: fail because `validateLockfile` is not exported.

- [x] **Step 3: Parse and allowlist every resolved artifact**

Implement:

```js
export function validateLockfile(lockfile) {
  for (const [name, value] of Object.entries(lockfile.packages ?? {})) {
    if (!value || typeof value !== 'object' || typeof value.resolved !== 'string') continue;
    const resolved = new URL(value.resolved);
    if (resolved.protocol !== 'https:') throw new Error(`${name} must use HTTPS.`);
    if (resolved.hostname !== 'registry.npmjs.org') {
      throw new Error(`${name} must resolve from registry.npmjs.org.`);
    }
    if (typeof value.integrity !== 'string' || value.integrity.length === 0) {
      throw new Error(`${name} must include lockfile integrity metadata.`);
    }
  }
}
```

Read and parse the real lockfile, call the validator, and retain a non-zero process exit on failure.

- [x] **Step 4: Pin reviewed immutable action SHAs**

Use these verified tag commits with version comments:

```yaml
actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0
actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6
actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6
actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5
actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128 # v5
```

- [x] **Step 5: Add a complete PR release gate and cross-platform CLI checks**

Keep the existing Node matrix `check` job. Add one Ubuntu Node 22 job that runs `npm ci` and `npm run release:check`. Add a `cli-platform` job for `windows-latest` and `macos-latest` that runs `npm ci` and `npm run test:cli`. Make all jobs read-only.

- [x] **Step 6: Scope Pages privileges to deployment**

Set workflow-level permissions to `contents: read`. Add this only to `jobs.deploy`:

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

The build job keeps no write or OIDC permission and still runs `release:check` before artifact upload.

- [x] **Step 7: Validate scripts and workflows**

Run:

```bash
npm run check:lockfile
npx vitest run tests/lockfile-host.test.mjs
go run github.com/rhysd/actionlint/cmd/actionlint@latest .github/workflows/*.yml
```

Expected: all pass with no workflow diagnostics.

### Task 8: Synchronize README and historical plan state

**Files:**

- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-10-repository-hardening.md`
- Modify: `docs/superpowers/plans/2026-07-10-custom-dropdown.md`
- Modify: `docs/superpowers/specs/2026-07-10-final-hardening-design.md`
- Modify: `docs/superpowers/plans/2026-07-10-final-hardening.md`

- [x] **Step 1: Update public behavior documentation**

Document exactly:

- 100 saved presets and a 1 MiB preset-import file limit;
- logical trailing blank-row preservation;
- permission-preserving replacement of existing CLI outputs on POSIX;
- conservative Unicode cell-width sizing for SVG;
- PR `release:check`, Node 20/22/24/26 checks, and Windows/macOS CLI jobs.

- [x] **Step 2: Mark completed historical work accurately**

Add `**Implementation status:** Completed and verified on 2026-07-10.` to the two earlier plans, check their final verification lists, and remove the obsolete statement that lint findings may remain.

Update the final design and this plan status to implemented only after Task 9 succeeds.

- [x] **Step 3: Run documentation/static checks**

Run: `npm run format:check && npm run check`

Expected: documentation formats cleanly and static/UI contracts pass.

### Task 9: Full verification and final review

**Files:**

- Verification only; modify source only for confirmed review findings.

- [x] **Step 1: Run the release gate on the declared minimum**

Run: `npx -y -p node@20.19.0 -c 'node -v && npm run release:check'`

Expected: Node `v20.19.0`, all tests, coverage, builds, compiled CLI, and golden examples pass.

- [x] **Step 2: Run the release gate on the remaining supported Node majors**

Run the complete gate on Node 22, Node 24, and Node 26.

Expected: Node 22, Node 24, Node 26, and the complete gate pass.

- [x] **Step 3: Verify installation, audit, and workflows**

Run a clean temporary-directory `npm ci`, then:

```bash
npm audit
npm outdated --long
go run github.com/rhysd/actionlint/cmd/actionlint@latest .github/workflows/*.yml
```

Expected: clean install; zero vulnerabilities; only the intentional Node-20 typings major difference; no actionlint diagnostics.

- [x] **Step 4: Run production browser smoke checks**

Build and preview the site. At desktop and 375×812 mobile widths verify:

- no horizontal overflow or console warning/error;
- preset keyboard selection and mobile popover placement;
- range accessible names remain static while values change;
- preset save/apply/delete/undo and the 1 MiB import rejection;
- text/Markdown/SVG tabs, copy status, and download names;
- pagehide disposal and no stale render after image replacement.

- [x] **Step 5: Request independent code review**

Because `.git` metadata is absent, provide the reviewer the complete current filesystem, the final design, this plan, reproduction list, and validation outputs instead of SHAs. Resolve every verified Critical, Important, and Minor finding, rerun the affected focused tests, then rerun `npm run release:check`.

- [x] **Step 6: Mark documentation complete**

Only after every gate and review passes, set the final design status to implemented/verified and mark every plan checkbox complete.

- [x] **Step 7: Record the Git limitation**

If `.git` is still absent, do not initialize a repository or claim a commit/PR. Report that all changes are local and ready for commit once repository identity is restored.
