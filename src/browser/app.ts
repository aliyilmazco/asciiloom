import { resolveOutputDimensions, subcellGrid, validateAsciiOptions } from '../core/validation.js';
import { createConversionControls } from './controls.js';
import type { PresetStorage } from './custom-presets.js';
import { MAX_PREPARED_IMAGE_PIXELS, type LoadedImage, type prepareImageData } from './image.js';
import { createImageSelectionController, isEditablePasteTarget } from './image-selection.js';
import { createOutputController } from './output-controller.js';
import { createPresetWorkflow } from './preset-workflow.js';
import { createRenderClient } from './render-client.js';
import { createRenderLifecycle } from './render-lifecycle.js';

export interface BrowserAppDependencies {
  document: Document;
  window: Window;
  navigator: Navigator;
  urlApi: typeof URL;
  presetStorage?: PresetStorage;
  createWorker(): Worker;
  createInitialImage(): LoadedImage;
  loadImage(file: File): Promise<LoadedImage>;
  prepareImage: typeof prepareImageData;
}

export interface BrowserApp {
  dispose(): void;
}

function browserPresetStorage(window: Window): PresetStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function preventBeforeUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
}

export function createBrowserApp(dependencies: BrowserAppDependencies): BrowserApp {
  const { document, window } = dependencies;

  function element<T extends HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (!found) throw new Error(`Missing required element: #${id}`);
    return found as T;
  }

  const fileInput = element<HTMLInputElement>('fileInput');
  const dropZone = element<HTMLLabelElement>('dropZone');
  const sourcePreview = element<HTMLImageElement>('sourcePreview');
  const sourceMeta = element<HTMLParagraphElement>('sourceMeta');
  const status = element<HTMLElement>('status');
  const conversionControls = createConversionControls(document);
  const { collapsibleInput } = conversionControls.elements;
  const workerRenderInputs = conversionControls.renderInputs.filter(
    (control) => control !== collapsibleInput,
  );

  let loadedImage = dependencies.createInitialImage();
  let scheduledRender = 0;
  let disposed = false;
  let beforeUnloadListening = false;

  function setStatus(message: string, state: 'ready' | 'busy' | 'error' = 'ready'): void {
    if (disposed) return;
    status.textContent = message;
    status.classList.toggle('busy', state === 'busy');
    status.classList.toggle('error', state === 'error');
  }

  const setBeforeUnloadProtection = (dirty: boolean): void => {
    if (disposed || dirty === beforeUnloadListening) return;
    beforeUnloadListening = dirty;
    if (dirty) window.addEventListener('beforeunload', preventBeforeUnload);
    else window.removeEventListener('beforeunload', preventBeforeUnload);
  };

  const renderClient = createRenderClient(dependencies.createWorker());
  const outputController = createOutputController({
    document,
    window,
    navigator: dependencies.navigator,
    urlApi: dependencies.urlApi,
    setStatus,
  });
  const renderLifecycle = createRenderLifecycle({
    cancelScheduledRender: () => window.clearTimeout(scheduledRender),
    markOutputUnavailable: outputController.invalidate,
    scheduleRender: (revision) => {
      scheduledRender = window.setTimeout(() => void renderAscii(revision), 80);
    },
  });

  async function renderAscii(revision: number): Promise<void> {
    if (disposed) return;
    setStatus('Rendering…', 'busy');
    try {
      const options = conversionControls.read();
      validateAsciiOptions(options);
      const dimensions = resolveOutputDimensions(
        loadedImage.width,
        loadedImage.height,
        options.width,
        options.cellAspectRatio,
      );
      const [scaleX, scaleY] = subcellGrid(options);
      const cellsX = dimensions.width * scaleX;
      const cellsY = dimensions.height * scaleY;
      // Subcell modes multiply cells up to 12×; drop oversampling until the canvas fits the budget.
      const oversample = Math.max(
        1,
        Math.min(
          options.width >= 140 ? 2 : 3,
          Math.floor(Math.sqrt(MAX_PREPARED_IMAGE_PIXELS / (cellsX * cellsY))),
        ),
      );
      const prepared = dependencies.prepareImage(
        loadedImage.source,
        cellsX,
        cellsY,
        oversample,
        options.background,
      );
      // getImageData returns an exact, owned buffer: transfer it without copying.
      const bytes = prepared.data;
      const data = (
        bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
          ? bytes.buffer
          : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      ) as ArrayBuffer;
      const result = await renderClient.render({
        revision,
        data,
        width: prepared.width,
        height: prepared.height,
        outputHeight: dimensions.height,
        options,
      });
      if (!renderLifecycle.isCurrent(revision)) return;

      outputController.showGenerated({
        art: result.art,
        width: result.width,
        height: result.height,
        imageName: loadedImage.name,
        options,
        collapsible: collapsibleInput.checked,
      });
      setStatus('Ready');
    } catch (error) {
      if (!renderLifecycle.isCurrent(revision)) return;
      const message = error instanceof Error ? error.message : 'Unexpected rendering error.';
      outputController.showError(message);
      setStatus(`Rendering error: ${message}`, 'error');
      console.error(error);
    }
  }

  function scheduleRender(): void {
    if (disposed) return;
    conversionControls.updateDisplayedValues();
    renderLifecycle.requestRender();
  }

  function setLoadedImage(next: LoadedImage): void {
    if (disposed) {
      next.dispose();
      return;
    }
    loadedImage.dispose();
    loadedImage = next;
    sourcePreview.src = next.previewUrl;
    sourceMeta.textContent = `${next.name} · ${next.width} × ${next.height}px`;
    scheduleRender();
  }

  const imageSelection = createImageSelectionController(dependencies.loadImage, {
    onBusy: () => {
      renderLifecycle.beginImageDecode();
      setStatus('Decoding…', 'busy');
    },
    onImage: (image) => {
      renderLifecycle.completeImageDecode();
      setLoadedImage(image);
    },
    onError: (message) => {
      renderLifecycle.failImageDecode();
      setStatus(`Invalid image: ${message}`, 'error');
    },
  });
  const presetWorkflow = createPresetWorkflow({
    document,
    storage: dependencies.presetStorage ?? browserPresetStorage(window),
    controls: conversionControls,
    urlApi: dependencies.urlApi,
    onRenderRequested: scheduleRender,
    onDirtyStateChanged: setBeforeUnloadProtection,
  });

  const onConversionControlInput = (): void => {
    presetWorkflow.handleControlsChanged();
    scheduleRender();
  };
  const onCollapsibleInput = (): void => {
    presetWorkflow.handleControlsChanged();
    outputController.updateCollapsible(collapsibleInput.checked);
  };
  const onFileInputChange = (): void => void imageSelection.accept(fileInput.files?.[0]);
  const onDropZoneDragOver = (event: DragEvent): void => {
    event.preventDefault();
    dropZone.classList.add('dragging');
  };
  const onDropZoneDragLeave = (): void => dropZone.classList.remove('dragging');
  const onDropZoneDrop = (event: DragEvent): void => {
    event.preventDefault();
    dropZone.classList.remove('dragging');
    void imageSelection.accept(event.dataTransfer?.files[0]);
  };
  const onWindowPaste = (event: ClipboardEvent): void => {
    if (isEditablePasteTarget(event.target)) return;
    const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) =>
      item.type.startsWith('image/'),
    );
    const file = imageItem?.getAsFile();
    if (file) void imageSelection.accept(file);
  };
  const onPageHide = (event: PageTransitionEvent): void => {
    if (!event.persisted) dispose();
  };

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    if (beforeUnloadListening) {
      window.removeEventListener('beforeunload', preventBeforeUnload);
      beforeUnloadListening = false;
    }
    for (const control of workerRenderInputs) {
      control.removeEventListener('input', onConversionControlInput);
    }
    collapsibleInput.removeEventListener('input', onCollapsibleInput);
    fileInput.removeEventListener('change', onFileInputChange);
    dropZone.removeEventListener('dragover', onDropZoneDragOver);
    dropZone.removeEventListener('dragleave', onDropZoneDragLeave);
    dropZone.removeEventListener('drop', onDropZoneDrop);
    window.removeEventListener('paste', onWindowPaste);
    window.removeEventListener('pagehide', onPageHide);

    renderLifecycle.dispose();
    imageSelection.dispose();
    presetWorkflow.dispose();
    outputController.dispose();
    conversionControls.dispose();
    renderClient.dispose();
    loadedImage.dispose();
  }

  for (const control of workerRenderInputs) {
    control.addEventListener('input', onConversionControlInput);
  }
  collapsibleInput.addEventListener('input', onCollapsibleInput);
  fileInput.addEventListener('change', onFileInputChange);
  dropZone.addEventListener('dragover', onDropZoneDragOver);
  dropZone.addEventListener('dragleave', onDropZoneDragLeave);
  dropZone.addEventListener('drop', onDropZoneDrop);
  window.addEventListener('paste', onWindowPaste);
  window.addEventListener('pagehide', onPageHide);

  sourcePreview.src = loadedImage.previewUrl;
  sourceMeta.textContent = `${loadedImage.name} · ${loadedImage.width} × ${loadedImage.height}px`;

  return { dispose };
}
