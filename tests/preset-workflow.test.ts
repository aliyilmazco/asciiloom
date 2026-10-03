// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import { createConversionControls } from '../src/browser/controls.js';
import {
  addCustomPreset,
  CUSTOM_PRESET_STORAGE_KEY,
  MAX_PRESET_IMPORT_BYTES,
  serializeCustomPreset,
} from '../src/browser/custom-presets.js';
import type { PresetStorage } from '../src/browser/custom-presets.js';
import { createPresetWorkflow } from '../src/browser/preset-workflow.js';
import { createMemoryPresetStorage } from './helpers/memory-preset-storage.js';

let storage: PresetStorage;

function installPage(): void {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  document.documentElement.innerHTML = /<html[^>]*>([\s\S]*)<\/html>/u.exec(html)?.[1] ?? '';
  storage = createMemoryPresetStorage();
}

function setFiles(input: HTMLInputElement, files: readonly Partial<File>[]): void {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
}

function deferred<T>() {
  let resolveDeferred!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolveDeferred = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve: resolveDeferred, reject };
}

beforeEach(installPage);

it('owns save, apply, update, delete, and undo preset interactions', () => {
  const controls = createConversionControls(document);
  const onRenderRequested = vi.fn();
  const workflow = createPresetWorkflow({
    document,
    storage,
    controls,
    urlApi: URL,
    onRenderRequested,
  });

  const name = document.querySelector<HTMLInputElement>('#customPresetName')!;
  name.value = 'Portrait Local';
  document.querySelector<HTMLFormElement>('#customPresetForm')!.requestSubmit();
  expect(document.querySelector('#customPresetCount')?.textContent).toBe('1');
  expect(document.querySelector('#presetNotice')?.textContent).toBe(
    'Saved preset: Portrait Local.',
  );

  document
    .querySelector<HTMLButtonElement>('[aria-label="Apply saved preset Portrait Local"]')!
    .click();
  expect(document.querySelector('#presetNotice')?.textContent).toBe(
    'Applied saved preset: Portrait Local.',
  );

  const width = document.querySelector<HTMLInputElement>('#width')!;
  width.value = '97';
  workflow.handleControlsChanged();
  document.querySelector<HTMLButtonElement>('#updateCustomPreset')!.click();
  expect(document.querySelector('#presetNotice')?.textContent).toBe(
    'Updated saved preset: Portrait Local.',
  );

  document
    .querySelector<HTMLButtonElement>('[aria-label="Delete saved preset Portrait Local"]')!
    .click();
  expect(document.querySelector('#customPresetCount')?.textContent).toBe('0');
  document.querySelector<HTMLButtonElement>('#undoDeletePreset')!.click();
  expect(document.querySelector('#customPresetCount')?.textContent).toBe('1');
  expect(onRenderRequested).toHaveBeenCalled();

  workflow.dispose();
  controls.dispose();
});

it('applies v1 presets without writing and normalizes storage on the next mutation', () => {
  const controls = createConversionControls(document);
  const current = addCustomPreset([], 'Legacy', {
    options: controls.read(),
    collapsible: true,
  })[0]!;
  const legacy = JSON.parse(serializeCustomPreset(current));
  legacy.schemaVersion = 1;
  delete legacy.settings.options.renderMode;
  delete legacy.settings.options.edgeStyle;
  let stored = JSON.stringify([legacy]);
  const setItem = vi.fn((_key: string, value: string) => {
    stored = value;
  });
  const workflow = createPresetWorkflow({
    document,
    storage: {
      getItem: (key) => (key === CUSTOM_PRESET_STORAGE_KEY ? stored : null),
      setItem,
    },
    controls,
    urlApi: URL,
    onRenderRequested: vi.fn(),
  });

  document.querySelector<HTMLButtonElement>('[aria-label="Apply saved preset Legacy"]')!.click();
  expect(controls.read()).toMatchObject({ renderMode: 'tone', edgeStyle: 'ascii' });
  expect(setItem).not.toHaveBeenCalled();

  document.querySelector<HTMLInputElement>('#customPresetName')!.value = 'Current';
  document.querySelector<HTMLFormElement>('#customPresetForm')!.requestSubmit();
  expect(setItem).toHaveBeenCalledOnce();
  expect(
    JSON.parse(stored).every(({ schemaVersion }: { schemaVersion: number }) => schemaVersion === 2),
  ).toBe(true);

  workflow.dispose();
  controls.dispose();
});

it('rejects future-version imports without changing presets, controls, selection, or storage', async () => {
  const controls = createConversionControls(document);
  const workflow = createPresetWorkflow({
    document,
    storage,
    controls,
    urlApi: URL,
    onRenderRequested: vi.fn(),
  });
  document.querySelector<HTMLInputElement>('#customPresetName')!.value = 'Safe';
  document.querySelector<HTMLFormElement>('#customPresetForm')!.requestSubmit();
  const beforeBytes = storage.getItem(CUSTOM_PRESET_STORAGE_KEY);
  const beforeSettings = controls.read();
  const beforeState = document.querySelector('#customPresetState')?.textContent;
  const invalid = {
    ...addCustomPreset([], 'Future', { options: controls.read(), collapsible: false })[0]!,
    schemaVersion: 3,
  };
  const input = document.querySelector<HTMLInputElement>('#importCustomPreset')!;
  setFiles(input, [{ size: 100, text: vi.fn(async () => JSON.stringify(invalid)) }]);

  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() =>
    expect(document.querySelector('#presetNotice')?.textContent).toContain(
      'schemaVersion must be 1 or 2.',
    ),
  );

  expect(document.querySelector('#customPresetCount')?.textContent).toBe('1');
  expect(controls.read()).toEqual(beforeSettings);
  expect(document.querySelector('#customPresetState')?.textContent).toBe(beforeState);
  expect(storage.getItem(CUSTOM_PRESET_STORAGE_KEY)).toBe(beforeBytes);
  workflow.dispose();
  controls.dispose();
});

it('exports the selected preset with a locale-independent filename', () => {
  const controls = createConversionControls(document);
  const download = vi.fn();
  const workflow = createPresetWorkflow({
    document,
    storage,
    controls,
    urlApi: URL,
    onRenderRequested: vi.fn(),
    download,
  });
  document.querySelector<HTMLInputElement>('#customPresetName')!.value = 'ISTANBUL Logo';
  document.querySelector<HTMLFormElement>('#customPresetForm')!.requestSubmit();
  document.querySelector<HTMLButtonElement>('#exportCustomPreset')!.click();

  expect(download).toHaveBeenCalledWith(
    expect.stringContaining('"name": "ISTANBUL Logo"'),
    'application/json;charset=utf-8',
    'istanbul-logo.json',
    document,
    URL,
  );
  workflow.dispose();
  controls.dispose();
});

it('rejects oversized imports without reading and ignores late failures after disposal', async () => {
  const controls = createConversionControls(document);
  const workflow = createPresetWorkflow({
    document,
    storage,
    controls,
    urlApi: URL,
    onRenderRequested: vi.fn(),
  });
  const input = document.querySelector<HTMLInputElement>('#importCustomPreset')!;
  const oversizedText = vi.fn();
  setFiles(input, [{ size: MAX_PRESET_IMPORT_BYTES + 1, text: oversizedText }]);
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() =>
    expect(document.querySelector('#presetNotice')?.textContent).toContain(
      'Preset import must be 1 MiB or smaller.',
    ),
  );
  expect(oversizedText).not.toHaveBeenCalled();

  const pending = deferred<string>();
  setFiles(input, [{ size: 100, text: vi.fn(() => pending.promise) }]);
  input.dispatchEvent(new Event('change'));
  const noticeBeforeDispose = document.querySelector('#presetNotice')?.textContent;
  workflow.dispose();
  pending.reject(new Error('late failure'));
  await Promise.resolve();
  await Promise.resolve();

  expect(document.querySelector('#presetNotice')?.textContent).toBe(noticeBeforeDispose);
  controls.dispose();
});

it('surfaces browser storage write failures without mutating the saved list', () => {
  const controls = createConversionControls(document);
  const workflow = createPresetWorkflow({
    document,
    storage: {
      getItem: () => null,
      setItem: () => {
        throw new Error('denied');
      },
    },
    controls,
    urlApi: URL,
    onRenderRequested: vi.fn(),
  });
  document.querySelector<HTMLInputElement>('#customPresetName')!.value = 'Blocked';
  document.querySelector<HTMLFormElement>('#customPresetForm')!.requestSubmit();

  expect(document.querySelector('#customPresetCount')?.textContent).toBe('0');
  expect(document.querySelector('#presetNotice')?.textContent).toContain(
    'Saved presets could not be written to browser storage.',
  );
  workflow.dispose();
  controls.dispose();
});

it('imports valid presets with conflict renaming and reports ordinary read failures', async () => {
  const controls = createConversionControls(document);
  const workflow = createPresetWorkflow({
    document,
    storage,
    controls,
    urlApi: URL,
    onRenderRequested: vi.fn(),
  });
  document.querySelector<HTMLInputElement>('#customPresetName')!.value = 'Imported';
  document.querySelector<HTMLFormElement>('#customPresetForm')!.requestSubmit();
  const imported = addCustomPreset([], 'Imported', {
    options: controls.read(),
    collapsible: false,
  })[0]!;
  const input = document.querySelector<HTMLInputElement>('#importCustomPreset')!;
  setFiles(input, [
    {
      size: 100,
      text: vi.fn(async () => JSON.stringify([imported, { ...imported, name: 'Second' }])),
    },
  ]);
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() =>
    expect(document.querySelector('#presetNotice')?.textContent).toBe('Imported 2 saved presets.'),
  );
  expect(document.querySelector('#customPresetCount')?.textContent).toBe('3');
  expect(document.querySelector('[aria-label="Select saved preset Imported (2)"]')).not.toBeNull();

  setFiles(input, [
    { size: 100, text: vi.fn(async () => Promise.reject(new Error('read denied'))) },
  ]);
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() =>
    expect(document.querySelector('#presetNotice')?.textContent).toContain(
      'Preset import failed: read denied',
    ),
  );
  workflow.dispose();
  controls.dispose();
});

it('ignores an older import that finishes after the latest selected file', async () => {
  const controls = createConversionControls(document);
  const workflow = createPresetWorkflow({
    document,
    storage,
    controls,
    urlApi: URL,
    onRenderRequested: vi.fn(),
  });
  const input = document.querySelector<HTMLInputElement>('#importCustomPreset')!;
  const older = deferred<string>();
  const newer = deferred<string>();
  const olderPreset = addCustomPreset([], 'Older', {
    options: controls.read(),
    collapsible: false,
  })[0]!;
  const newerPreset = { ...olderPreset, name: 'Newer' };

  setFiles(input, [{ size: 100, text: vi.fn(() => older.promise) }]);
  input.dispatchEvent(new Event('change'));
  setFiles(input, [{ size: 100, text: vi.fn(() => newer.promise) }]);
  input.dispatchEvent(new Event('change'));

  newer.resolve(JSON.stringify([newerPreset]));
  await vi.waitFor(() =>
    expect(document.querySelector('[aria-label="Select saved preset Newer"]')).not.toBeNull(),
  );
  const latestNotice = document.querySelector('#presetNotice')?.textContent;
  older.resolve(JSON.stringify([olderPreset]));
  await Promise.resolve();
  await Promise.resolve();

  expect(document.querySelector('[aria-label="Select saved preset Older"]')).toBeNull();
  expect(document.querySelector('#presetNotice')?.textContent).toBe(latestNotice);
  workflow.dispose();
  controls.dispose();
});

it('reports unavailable preset actions and keeps dirty state lifecycle explicit', () => {
  const controls = createConversionControls(document);
  const download = vi.fn();
  const workflow = createPresetWorkflow({
    document,
    storage,
    controls,
    urlApi: URL,
    onRenderRequested: vi.fn(),
    download,
  });
  const exportButton = document.querySelector<HTMLButtonElement>('#exportCustomPreset')!;
  exportButton.disabled = false;
  exportButton.click();
  expect(document.querySelector('#presetNotice')?.textContent).toBe(
    'Select a saved preset before exporting.',
  );

  const updateButton = document.querySelector<HTMLButtonElement>('#updateCustomPreset')!;
  updateButton.disabled = false;
  updateButton.click();
  expect(document.querySelector('#presetNotice')?.textContent).toBe(
    'Apply a saved preset before updating it.',
  );

  document.querySelector<HTMLInputElement>('#customPresetName')!.value = 'Dirty';
  document.querySelector<HTMLFormElement>('#customPresetForm')!.requestSubmit();
  expect(workflow.isDirty()).toBe(false);
  document.querySelector<HTMLInputElement>('#width')!.value = '99';
  expect(workflow.isDirty()).toBe(true);
  workflow.handleControlsChanged();

  workflow.dispose();
  workflow.dispose();
  expect(workflow.isDirty()).toBe(false);
  workflow.handleControlsChanged();
  expect(download).not.toHaveBeenCalled();
  controls.dispose();
});

it('supports selection callbacks, no-op undo, and fallback export filenames', () => {
  const controls = createConversionControls(document);
  const download = vi.fn();
  const workflow = createPresetWorkflow({
    document,
    storage,
    controls,
    urlApi: URL,
    onRenderRequested: vi.fn(),
    download,
  });
  const undo = document.querySelector<HTMLButtonElement>('#undoDeletePreset')!;
  undo.hidden = false;
  undo.click();

  for (const name of ['First', '!!!']) {
    document.querySelector<HTMLInputElement>('#customPresetName')!.value = name;
    document.querySelector<HTMLFormElement>('#customPresetForm')!.requestSubmit();
  }
  document.querySelector<HTMLButtonElement>('[aria-label="Select saved preset First"]')!.click();
  expect(
    document
      .querySelector('[aria-label="Select saved preset First"]')
      ?.getAttribute('aria-pressed'),
  ).toBe('true');
  document.querySelector<HTMLButtonElement>('[aria-label="Select saved preset !!!"]')!.click();
  document.querySelector<HTMLButtonElement>('#exportCustomPreset')!.click();
  expect(download).toHaveBeenCalledWith(
    expect.stringContaining('"name": "!!!"'),
    'application/json;charset=utf-8',
    'ascii-preset.json',
    document,
    URL,
  );
  workflow.dispose();
  controls.dispose();
});

it('keeps active unsaved changes tracked while another preset is selected for export', () => {
  const controls = createConversionControls(document);
  const onDirtyStateChanged = vi.fn();
  const workflow = createPresetWorkflow({
    document,
    storage,
    controls,
    urlApi: URL,
    onRenderRequested: vi.fn(),
    onDirtyStateChanged,
  });
  for (const name of ['Active', 'Export']) {
    document.querySelector<HTMLInputElement>('#customPresetName')!.value = name;
    document.querySelector<HTMLFormElement>('#customPresetForm')!.requestSubmit();
  }
  document.querySelector<HTMLButtonElement>('[aria-label="Apply saved preset Active"]')!.click();
  document.querySelector<HTMLInputElement>('#width')!.value = '99';
  workflow.handleControlsChanged();

  document.querySelector<HTMLButtonElement>('[aria-label="Select saved preset Export"]')!.click();

  expect(workflow.isDirty()).toBe(true);
  expect(document.querySelector('#customPresetState')?.textContent).toBe(
    'Unsaved changes in Active.',
  );
  expect(document.querySelector<HTMLButtonElement>('#updateCustomPreset')!.disabled).toBe(true);
  expect(document.querySelector<HTMLButtonElement>('#exportCustomPreset')!.disabled).toBe(false);
  expect(onDirtyStateChanged).toHaveBeenLastCalledWith(true);

  document.querySelector<HTMLButtonElement>('[aria-label="Delete saved preset Export"]')!.click();
  document.querySelector<HTMLButtonElement>('#undoDeletePreset')!.click();
  expect(workflow.isDirty()).toBe(true);
  expect(document.querySelector('#customPresetState')?.textContent).toBe(
    'Unsaved changes in Active.',
  );
  expect(onDirtyStateChanged).toHaveBeenLastCalledWith(true);

  document.querySelector<HTMLButtonElement>('[aria-label="Select saved preset Active"]')!.click();
  expect(document.querySelector<HTMLButtonElement>('#updateCustomPreset')!.disabled).toBe(false);
  workflow.dispose();
  controls.dispose();
});

it('reports storage read failures before attempting to overwrite saved state', () => {
  let denyReads = false;
  const setItem = vi.fn();
  const controls = createConversionControls(document);
  const workflow = createPresetWorkflow({
    document,
    storage: {
      getItem: () => {
        if (denyReads) throw new Error('denied');
        return null;
      },
      setItem,
    },
    controls,
    urlApi: URL,
    onRenderRequested: vi.fn(),
  });
  denyReads = true;
  document.querySelector<HTMLInputElement>('#customPresetName')!.value = 'Blocked read';
  document.querySelector<HTMLFormElement>('#customPresetForm')!.requestSubmit();

  expect(document.querySelector('#presetNotice')?.textContent).toContain(
    'Saved presets could not be read from browser storage.',
  );
  expect(setItem).not.toHaveBeenCalled();
  workflow.dispose();
  controls.dispose();
});

it('reports unchanged updates and stale saved-row actions', () => {
  const controls = createConversionControls(document);
  const workflow = createPresetWorkflow({
    document,
    storage,
    controls,
    urlApi: URL,
    onRenderRequested: vi.fn(),
  });
  document.querySelector<HTMLInputElement>('#customPresetName')!.value = 'Stale';
  document.querySelector<HTMLFormElement>('#customPresetForm')!.requestSubmit();
  const apply = document.querySelector<HTMLButtonElement>(
    '[aria-label="Apply saved preset Stale"]',
  )!;
  const remove = document.querySelector<HTMLButtonElement>(
    '[aria-label="Delete saved preset Stale"]',
  )!;
  const update = document.querySelector<HTMLButtonElement>('#updateCustomPreset')!;
  update.disabled = false;
  update.click();
  expect(document.querySelector('#presetNotice')?.textContent).toBe(
    'This saved preset already matches the current controls.',
  );

  remove.click();
  apply.click();
  expect(document.querySelector('#presetNotice')?.textContent).toContain(
    'Saved preset was not found.',
  );
  remove.click();
  expect(document.querySelector('#presetNotice')?.textContent).toContain(
    'Saved preset was not found.',
  );
  workflow.dispose();
  controls.dispose();
});

it('suppresses retained saved-row callbacks after disposal', () => {
  const controls = createConversionControls(document);
  const workflow = createPresetWorkflow({
    document,
    storage,
    controls,
    urlApi: URL,
    onRenderRequested: vi.fn(),
  });
  document.querySelector<HTMLInputElement>('#customPresetName')!.value = 'Disposed';
  document.querySelector<HTMLFormElement>('#customPresetForm')!.requestSubmit();
  const select = document.querySelector<HTMLButtonElement>(
    '[aria-label="Select saved preset Disposed"]',
  )!;
  const apply = document.querySelector<HTMLButtonElement>(
    '[aria-label="Apply saved preset Disposed"]',
  )!;
  const remove = document.querySelector<HTMLButtonElement>(
    '[aria-label="Delete saved preset Disposed"]',
  )!;
  const notice = document.querySelector('#presetNotice')?.textContent;
  workflow.dispose();
  select.click();
  apply.click();
  remove.click();
  expect(document.querySelector('#presetNotice')?.textContent).toBe(notice);
  controls.dispose();
});

it('imports one preset and expires delete undo state', async () => {
  vi.useFakeTimers();
  try {
    const controls = createConversionControls(document);
    const workflow = createPresetWorkflow({
      document,
      storage,
      controls,
      urlApi: URL,
      onRenderRequested: vi.fn(),
    });
    const imported = addCustomPreset([], 'Single', {
      options: controls.read(),
      collapsible: false,
    })[0]!;
    const input = document.querySelector<HTMLInputElement>('#importCustomPreset')!;
    setFiles(input, [{ size: 100, text: vi.fn(async () => JSON.stringify(imported)) }]);
    input.dispatchEvent(new Event('change'));
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector('#presetNotice')?.textContent).toBe('Imported 1 saved preset.');

    document.querySelector<HTMLButtonElement>('[aria-label="Delete saved preset Single"]')!.click();
    expect(document.querySelector<HTMLButtonElement>('#undoDeletePreset')!.hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(document.querySelector<HTMLButtonElement>('#undoDeletePreset')!.hidden).toBe(true);
    workflow.dispose();
    controls.dispose();
  } finally {
    vi.useRealTimers();
  }
});

it('reports storage failure while updating an active preset', () => {
  let writable = true;
  const values = new Map<string, string>();
  const controls = createConversionControls(document);
  const workflow = createPresetWorkflow({
    document,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (!writable) throw new Error('denied');
        values.set(key, value);
      },
    },
    controls,
    urlApi: URL,
    onRenderRequested: vi.fn(),
  });
  document.querySelector<HTMLInputElement>('#customPresetName')!.value = 'Update';
  document.querySelector<HTMLFormElement>('#customPresetForm')!.requestSubmit();
  document.querySelector<HTMLInputElement>('#width')!.value = '99';
  workflow.handleControlsChanged();
  writable = false;
  document.querySelector<HTMLButtonElement>('#updateCustomPreset')!.click();
  expect(document.querySelector('#presetNotice')?.textContent).toContain(
    'Preset update failed: Saved presets could not be written',
  );
  workflow.dispose();
  controls.dispose();
});
