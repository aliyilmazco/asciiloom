// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createBrowserApp } from '../src/browser/app.js';
import type { LoadedImage } from '../src/browser/image.js';
import type { RenderRequest, RenderResponse } from '../src/browser/render-protocol.js';
import { createMemoryPresetStorage } from './helpers/memory-preset-storage.js';

function workerHarness() {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const postMessage = vi.fn();
  const terminate = vi.fn();
  const worker = {
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      const registered = listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
      registered.add(listener);
      listeners.set(type, registered);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.get(type)?.delete(listener);
    }),
    postMessage,
    terminate,
  } as unknown as Worker;

  function emit(type: string, event: Event): void {
    for (const listener of listeners.get(type) ?? []) {
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    }
  }

  return {
    worker,
    postMessage,
    terminate,
    emitResponse(response: RenderResponse): void {
      emit('message', new MessageEvent('message', { data: response }));
    },
    emitError(message: string): void {
      emit('error', new ErrorEvent('error', { message }));
    },
  };
}

function loadedImageDouble(name = 'demo'): LoadedImage {
  return {
    source: document.createElement('canvas'),
    width: 2,
    height: 1,
    name,
    previewUrl: `blob:${name}`,
    dispose: vi.fn(),
  };
}

function createApp(overrides: Partial<Parameters<typeof createBrowserApp>[0]> = {}) {
  const worker = workerHarness();
  const initialImage = loadedImageDouble();
  const app = createBrowserApp({
    document,
    window,
    navigator,
    urlApi: URL,
    presetStorage: createMemoryPresetStorage(),
    createWorker: () => worker.worker,
    createInitialImage: () => initialImage,
    loadImage: vi.fn(),
    prepareImage: vi.fn(() => ({
      data: new Uint8ClampedArray([0, 0, 0, 255]),
      width: 1,
      height: 1,
      channels: 4 as const,
    })),
    ...overrides,
  });
  return { app, initialImage, worker };
}

function renderRequest(worker: ReturnType<typeof workerHarness>, index = 0): RenderRequest {
  return worker.postMessage.mock.calls[index]![0] as RenderRequest;
}

function setInputFile(file: File): void {
  Object.defineProperty(document.querySelector('#fileInput'), 'files', {
    configurable: true,
    value: [file],
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  document.documentElement.innerHTML = /<html[^>]*>([\s\S]*)<\/html>/u.exec(html)?.[1] ?? '';
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('renders the initial image and disposes every owned lifecycle once', async () => {
  const { app, initialImage, worker } = createApp();
  await vi.advanceTimersByTimeAsync(80);
  const request = renderRequest(worker);
  worker.emitResponse({ ok: true, revision: request.revision, art: 'A', width: 1, height: 1 });
  await Promise.resolve();

  expect(document.querySelector('#status')?.textContent).toBe('Ready');
  expect(document.querySelector('#asciiPreview')?.textContent).toBe('A');
  app.dispose();
  app.dispose();
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(initialImage.dispose).toHaveBeenCalledOnce();
});

it('refreshes collapsible Markdown without another worker render', async () => {
  const prepareImage = vi.fn(() => ({
    data: new Uint8ClampedArray([0, 0, 0, 255]),
    width: 1,
    height: 1,
    channels: 4 as const,
  }));
  const { app, worker } = createApp({ prepareImage });
  await vi.advanceTimersByTimeAsync(80);
  const request = renderRequest(worker);
  worker.emitResponse({ ok: true, revision: request.revision, art: 'A', width: 1, height: 1 });
  await Promise.resolve();

  const collapsible = document.querySelector<HTMLInputElement>('#collapsible')!;
  const output = document.querySelector<HTMLTextAreaElement>('#output')!;
  expect(output.value).not.toContain('<details');

  collapsible.checked = true;
  collapsible.dispatchEvent(new Event('input'));
  await vi.advanceTimersByTimeAsync(80);
  expect(output.value).toContain('<details open>');
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  expect(prepareImage).toHaveBeenCalledTimes(1);

  collapsible.checked = false;
  collapsible.dispatchEvent(new Event('input'));
  expect(output.value).not.toContain('<details');
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  app.dispose();
});

it('uses the latest collapsible value when a pending render completes', async () => {
  const { app, worker } = createApp();
  await vi.advanceTimersByTimeAsync(80);
  const request = renderRequest(worker);
  const collapsible = document.querySelector<HTMLInputElement>('#collapsible')!;

  collapsible.checked = true;
  collapsible.dispatchEvent(new Event('input'));
  await vi.advanceTimersByTimeAsync(80);
  expect(worker.postMessage).toHaveBeenCalledTimes(1);

  worker.emitResponse({ ok: true, revision: request.revision, art: 'A', width: 1, height: 1 });
  await Promise.resolve();
  expect(document.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('<details open>');

  app.dispose();
  collapsible.checked = false;
  collapsible.dispatchEvent(new Event('input'));
  expect(document.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('<details open>');
});

it('ignores stale worker responses and presents the current revision', async () => {
  const { app, worker } = createApp();
  await vi.advanceTimersByTimeAsync(80);
  const first = renderRequest(worker, 0);
  const width = document.querySelector<HTMLInputElement>('#width')!;
  width.value = '90';
  width.dispatchEvent(new Event('input'));
  await vi.advanceTimersByTimeAsync(80);
  expect(worker.postMessage).toHaveBeenCalledTimes(1);

  worker.emitResponse({ ok: true, revision: first.revision, art: 'stale', width: 1, height: 1 });
  await Promise.resolve();
  expect(document.querySelector('#asciiPreview')?.textContent).not.toBe('stale');
  const second = renderRequest(worker, 1);
  worker.emitResponse({ ok: true, revision: second.revision, art: 'current', width: 1, height: 1 });
  await Promise.resolve();
  expect(document.querySelector('#asciiPreview')?.textContent).toBe('current');
  app.dispose();
});

it('shows worker and image decode failures on the shared status surface', async () => {
  const loadImage = vi.fn(async () => {
    throw new Error('decode failed');
  });
  const { app, worker } = createApp({ loadImage });
  await vi.advanceTimersByTimeAsync(80);
  const request = renderRequest(worker);
  worker.emitResponse({ ok: false, revision: request.revision, message: 'render failed' });
  await Promise.resolve();
  expect(document.querySelector('#status')?.textContent).toBe('Rendering error: render failed');
  expect(document.querySelector('#output')).toHaveProperty('value', 'render failed');

  setInputFile(new File([], 'broken.png', { type: 'image/png' }));
  document.querySelector<HTMLInputElement>('#fileInput')!.dispatchEvent(new Event('change'));
  await Promise.resolve();
  await Promise.resolve();
  expect(document.querySelector('#status')?.textContent).toBe('Invalid image: decode failed');
  app.dispose();
});

it('keeps only the newest asynchronous image selection', async () => {
  const pending = new Map<string, (image: LoadedImage) => void>();
  const loadImage = vi.fn(
    (file: File) =>
      new Promise<LoadedImage>((resolveImage) => {
        pending.set(file.name, resolveImage);
      }),
  );
  const { app } = createApp({ loadImage });
  const first = new File([], 'first.png', { type: 'image/png' });
  const second = new File([], 'second.png', { type: 'image/png' });
  const firstImage = loadedImageDouble('first');
  const secondImage = loadedImageDouble('second');

  setInputFile(first);
  document.querySelector<HTMLInputElement>('#fileInput')!.dispatchEvent(new Event('change'));
  setInputFile(second);
  document.querySelector<HTMLInputElement>('#fileInput')!.dispatchEvent(new Event('change'));
  pending.get('second.png')!(secondImage);
  await Promise.resolve();
  expect(document.querySelector('#sourceMeta')?.textContent).toContain('second');
  pending.get('first.png')!(firstImage);
  await Promise.resolve();
  expect(firstImage.dispose).toHaveBeenCalledOnce();
  expect(document.querySelector('#sourceMeta')?.textContent).toContain('second');
  app.dispose();
});

it('preserves resources for bfcache pagehide and disposes on normal pagehide', () => {
  const { app, worker } = createApp();
  const persisted = new Event('pagehide');
  Object.defineProperty(persisted, 'persisted', { value: true });
  window.dispatchEvent(persisted);
  expect(worker.terminate).not.toHaveBeenCalled();

  const normal = new Event('pagehide');
  Object.defineProperty(normal, 'persisted', { value: false });
  window.dispatchEvent(normal);
  expect(worker.terminate).toHaveBeenCalledOnce();
  app.dispose();
});

it('warns before unloading dirty applied preset settings', () => {
  const { app } = createApp();
  document.querySelector<HTMLInputElement>('#customPresetName')!.value = 'Dirty';
  document.querySelector<HTMLFormElement>('#customPresetForm')!.requestSubmit();
  document.querySelector<HTMLButtonElement>('[aria-label="Apply saved preset Dirty"]')!.click();
  const width = document.querySelector<HTMLInputElement>('#width')!;
  width.value = '99';
  width.dispatchEvent(new Event('input'));

  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  app.dispose();
});

it('attaches beforeunload protection only while preset settings are dirty', () => {
  const addEventListener = vi.spyOn(window, 'addEventListener');
  const removeEventListener = vi.spyOn(window, 'removeEventListener');
  const { app } = createApp();
  const beforeUnloadAdds = () =>
    addEventListener.mock.calls.filter(([type]) => String(type) === 'beforeunload');
  const beforeUnloadRemovals = () =>
    removeEventListener.mock.calls.filter(([type]) => String(type) === 'beforeunload');

  expect(beforeUnloadAdds()).toHaveLength(0);
  document.querySelector<HTMLInputElement>('#customPresetName')!.value = 'Tracked';
  document.querySelector<HTMLFormElement>('#customPresetForm')!.requestSubmit();
  expect(beforeUnloadAdds()).toHaveLength(0);

  const width = document.querySelector<HTMLInputElement>('#width')!;
  width.value = '99';
  width.dispatchEvent(new Event('input'));
  expect(beforeUnloadAdds()).toHaveLength(1);

  width.value = '88';
  width.dispatchEvent(new Event('input'));
  expect(beforeUnloadRemovals()).toHaveLength(1);
  const cleanEvent = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(cleanEvent);
  expect(cleanEvent.defaultPrevented).toBe(false);
  app.dispose();
});

it('marks a collapsible-only preset change as dirty without scheduling a render', async () => {
  const { app, worker } = createApp();
  await vi.advanceTimersByTimeAsync(80);
  const request = renderRequest(worker);
  worker.emitResponse({ ok: true, revision: request.revision, art: 'A', width: 1, height: 1 });
  await Promise.resolve();
  document.querySelector<HTMLInputElement>('#customPresetName')!.value = 'Collapsible';
  document.querySelector<HTMLFormElement>('#customPresetForm')!.requestSubmit();
  document
    .querySelector<HTMLButtonElement>('[aria-label="Apply saved preset Collapsible"]')!
    .click();
  await vi.advanceTimersByTimeAsync(80);
  const appliedRequest = renderRequest(worker, 1);
  worker.emitResponse({
    ok: true,
    revision: appliedRequest.revision,
    art: 'A',
    width: 1,
    height: 1,
  });
  await Promise.resolve();

  const collapsible = document.querySelector<HTMLInputElement>('#collapsible')!;
  collapsible.checked = true;
  collapsible.dispatchEvent(new Event('input'));
  const beforeUnload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(beforeUnload);

  expect(beforeUnload.defaultPrevented).toBe(true);
  expect(worker.postMessage).toHaveBeenCalledTimes(2);
  app.dispose();
});

it('does not accept pasted images from editable controls', async () => {
  const loadImage = vi.fn(async () => loadedImageDouble('pasted'));
  const { app } = createApp({ loadImage });
  const paste = new Event('paste', { bubbles: true });
  Object.defineProperty(paste, 'clipboardData', {
    value: {
      items: [{ type: 'image/png', getAsFile: () => new File([], 'paste.png') }],
    },
  });
  document.querySelector<HTMLInputElement>('#customPresetName')!.dispatchEvent(paste);
  await Promise.resolve();
  expect(loadImage).not.toHaveBeenCalled();
  app.dispose();
});

it('accepts non-editable pasted images and handles drag affordances', async () => {
  const pasted = loadedImageDouble('pasted');
  const loadImage = vi.fn(async () => pasted);
  const { app } = createApp({ loadImage });
  const paste = new Event('paste');
  Object.defineProperty(paste, 'clipboardData', {
    value: {
      items: [{ type: 'image/png', getAsFile: () => new File([], 'paste.png') }],
    },
  });
  window.dispatchEvent(paste);
  await Promise.resolve();
  expect(loadImage).toHaveBeenCalledOnce();
  expect(document.querySelector('#sourceMeta')?.textContent).toContain('pasted');

  const dropZone = document.querySelector<HTMLLabelElement>('#dropZone')!;
  const dragOver = new Event('dragover', { cancelable: true });
  dropZone.dispatchEvent(dragOver);
  expect(dragOver.defaultPrevented).toBe(true);
  expect(dropZone.classList.contains('dragging')).toBe(true);
  dropZone.dispatchEvent(new Event('dragleave'));
  expect(dropZone.classList.contains('dragging')).toBe(false);
  app.dispose();
});

it('uses reduced oversampling for wide output and exposes clean unload state', async () => {
  const prepareImage = vi.fn(() => ({
    data: new Uint8ClampedArray([0, 0, 0, 255]),
    width: 1,
    height: 1,
    channels: 4 as const,
  }));
  const { app } = createApp({ prepareImage });
  const width = document.querySelector<HTMLInputElement>('#width')!;
  width.value = '140';
  width.dispatchEvent(new Event('input'));
  await vi.advanceTimersByTimeAsync(80);
  expect(prepareImage).toHaveBeenCalledWith(expect.anything(), 140, expect.any(Number), 2, {
    r: 255,
    g: 255,
    b: 255,
  });

  const beforeUnload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(beforeUnload);
  expect(beforeUnload.defaultPrevented).toBe(false);
  app.dispose();
});

it('prepares true 2×4 subcells for an 88×28 Braille render', async () => {
  const prepareImage = vi.fn(() => ({
    data: new Uint8ClampedArray([0, 0, 0, 255]),
    width: 1,
    height: 1,
    channels: 4 as const,
  }));
  const brailleSource: LoadedImage = {
    ...loadedImageDouble('braille'),
    width: 11,
    height: 7,
  };
  const { app } = createApp({
    createInitialImage: () => brailleSource,
    prepareImage,
  });

  document.querySelector<HTMLButtonElement>('#characterStyleTrigger')!.click();
  document.querySelector<HTMLElement>('#characterStyleListbox [data-value="braille"]')!.click();
  await vi.advanceTimersByTimeAsync(80);

  expect(prepareImage).toHaveBeenCalledWith(expect.anything(), 176, 112, 3, {
    r: 255,
    g: 255,
    b: 255,
  });
  app.dispose();
});

it('fails fast when required app elements are missing', () => {
  document.querySelector('#sourceMeta')!.remove();
  expect(() => createApp()).toThrow('Missing required element: #sourceMeta');
});
