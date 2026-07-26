import { describe, expect, it } from 'vitest';
import {
  createImageSelectionController,
  isEditablePasteTarget,
} from '../src/browser/image-selection.js';
import type { LoadedImage } from '../src/browser/image.js';

function fakeImage(name: string, disposed: string[]): LoadedImage {
  return {
    source: {} as CanvasImageSource,
    width: 10,
    height: 10,
    name,
    previewUrl: `blob:${name}`,
    dispose: () => disposed.push(name),
  };
}

function fakeTarget(
  tagName: string,
  options: { editable?: boolean; parent?: unknown } = {},
): EventTarget {
  return {
    tagName,
    isContentEditable: options.editable ?? false,
    parentElement: options.parent ?? null,
  } as unknown as EventTarget;
}

describe('image selection', () => {
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

  it('does not announce an error from a stale selection', async () => {
    const pending = new Map<
      string,
      { reject(error: Error): void; resolve(image: LoadedImage): void }
    >();
    const errors: string[] = [];
    const controller = createImageSelectionController(
      (file) =>
        new Promise((resolve, reject) => {
          pending.set(file.name, { resolve, reject });
        }),
      {
        onBusy: () => undefined,
        onImage: () => undefined,
        onError: (message) => errors.push(message),
      },
    );

    const first = controller.accept(new File([], 'first.png', { type: 'image/png' }));
    const second = controller.accept(new File([], 'second.png', { type: 'image/png' }));
    pending.get('first.png')!.reject(new Error('first failed'));
    pending.get('second.png')!.reject(new Error('second failed'));
    await Promise.all([first, second]);

    expect(errors).toEqual(['second failed']);
  });

  it('cancels pending and future selections when disposed', async () => {
    let resolvePending: ((image: LoadedImage) => void) | undefined;
    const applied: string[] = [];
    const disposedImages: string[] = [];
    let loadCalls = 0;
    let busyCalls = 0;
    const controller = createImageSelectionController(
      () => {
        loadCalls += 1;
        return new Promise((resolve) => {
          resolvePending = resolve;
        });
      },
      {
        onBusy: () => {
          busyCalls += 1;
        },
        onImage: (image) => applied.push(image.name),
        onError: () => undefined,
      },
    );

    const pending = controller.accept(new File([], 'pending.png', { type: 'image/png' }));
    controller.dispose();
    controller.dispose();
    await controller.accept(new File([], 'ignored.png', { type: 'image/png' }));
    resolvePending!(fakeImage('pending', disposedImages));
    await pending;

    expect(loadCalls).toBe(1);
    expect(busyCalls).toBe(1);
    expect(applied).toEqual([]);
    expect(disposedImages).toEqual(['pending']);
  });

  it('suppresses a pending decode error after disposal', async () => {
    let rejectPending: ((error: Error) => void) | undefined;
    const errors: string[] = [];
    const controller = createImageSelectionController(
      () =>
        new Promise((_resolve, reject) => {
          rejectPending = reject;
        }),
      {
        onBusy: () => undefined,
        onImage: () => undefined,
        onError: (message) => errors.push(message),
      },
    );

    const pending = controller.accept(new File([], 'pending.png', { type: 'image/png' }));
    controller.dispose();
    rejectPending!(new Error('decode failed after teardown'));
    await pending;

    expect(errors).toEqual([]);
  });

  it('recognizes editable paste targets and their descendants', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(isEditablePasteTarget(fakeTarget(tagName))).toBe(true);
    }

    const editor = fakeTarget('DIV', { editable: true });
    expect(isEditablePasteTarget(editor)).toBe(true);
    expect(isEditablePasteTarget(fakeTarget('SPAN', { parent: editor }))).toBe(true);
    expect(isEditablePasteTarget(fakeTarget('BUTTON'))).toBe(false);
    expect(isEditablePasteTarget(null)).toBe(false);
  });
});
