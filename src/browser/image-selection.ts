import type { LoadedImage } from './image.js';

export interface ImageSelectionCallbacks {
  onBusy(): void;
  onImage(image: LoadedImage): void;
  onError(message: string): void;
}

export interface ImageSelectionController {
  accept(file: File | undefined): Promise<void>;
  dispose(): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not open the image.';
}

export function createImageSelectionController(
  load: (file: File) => Promise<LoadedImage>,
  callbacks: ImageSelectionCallbacks,
): ImageSelectionController {
  let revision = 0;
  let disposed = false;

  return {
    async accept(file: File | undefined): Promise<void> {
      if (!file || disposed) return;
      const acceptedRevision = ++revision;
      callbacks.onBusy();

      let image: LoadedImage;
      try {
        image = await load(file);
      } catch (error) {
        if (!disposed && acceptedRevision === revision) callbacks.onError(errorMessage(error));
        return;
      }

      if (disposed || acceptedRevision !== revision) {
        image.dispose();
        return;
      }

      callbacks.onImage(image);
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      revision += 1;
    },
  };
}

interface EditableTargetLike {
  readonly tagName?: unknown;
  readonly isContentEditable?: unknown;
  readonly parentElement?: unknown;
}

function targetLike(value: unknown): EditableTargetLike | undefined {
  return typeof value === 'object' && value !== null ? (value as EditableTargetLike) : undefined;
}

export function isEditablePasteTarget(target: EventTarget | null): boolean {
  let current = targetLike(target);

  while (current) {
    const tagName = typeof current.tagName === 'string' ? current.tagName.toUpperCase() : '';
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
    if (current.isContentEditable === true) return true;
    current = targetLike(current.parentElement);
  }

  return false;
}
