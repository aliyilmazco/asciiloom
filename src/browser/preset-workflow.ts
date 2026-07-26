import { PRESETS, getPreset, optionsForPreset } from '../core/presets.js';
import type { ConversionControls } from './controls.js';
import {
  MAX_PRESET_IMPORT_BYTES,
  parseCustomPresetJson,
  serializeCustomPreset,
  type PresetStorage,
} from './custom-presets.js';
import { createDropdown, type DropdownOption } from './dropdown.js';
import { downloadContent } from './output.js';
import { createPresetController } from './preset-controller.js';
import {
  createPresetListView,
  renderPresetListView,
  renderPresetState,
} from './preset-list-view.js';

export interface PresetWorkflowDependencies {
  document: Document;
  storage: PresetStorage | undefined;
  controls: ConversionControls;
  urlApi: typeof URL;
  onRenderRequested(): void;
  onDirtyStateChanged?(dirty: boolean): void;
  download?: typeof downloadContent;
}

export interface PresetWorkflow {
  handleControlsChanged(): void;
  isDirty(): boolean;
  dispose(): void;
}

function presetFileName(name: string): string {
  return `${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/(^-|-$)/gu, '') || 'ascii-preset'
  }.json`;
}

export function createPresetWorkflow(dependencies: PresetWorkflowDependencies): PresetWorkflow {
  const { document, storage, controls, urlApi, onRenderRequested } = dependencies;
  const download = dependencies.download ?? downloadContent;

  function element<T extends HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (!found) throw new Error(`Missing required element: #${id}`);
    return found as T;
  }

  const presetDescription = element<HTMLElement>('presetDescription');
  const presetDropdownOptions: DropdownOption[] = [
    {
      value: 'custom',
      label: 'Custom / modified settings',
      description: 'Current controls differ from a built-in or saved preset.',
      selectable: false,
    },
    ...PRESETS.map(({ id, label, description }) => ({ value: id, label, description })),
  ];
  const presetDropdown = createDropdown(document, 'preset', presetDropdownOptions);
  const presetListView = createPresetListView(document);
  const presetNotice = element<HTMLElement>('presetNotice');
  const customPresetForm = element<HTMLFormElement>('customPresetForm');
  const customPresetName = element<HTMLInputElement>('customPresetName');
  const importCustomPresetButton = element<HTMLButtonElement>('importCustomPresetButton');
  const importCustomPresetInput = element<HTMLInputElement>('importCustomPreset');
  const { collapsibleInput } = controls.elements;

  let disposed = false;
  let importRevision = 0;
  const presetController = createPresetController({
    storage,
    onUndoExpired: () => {
      if (!disposed) renderCustomPresetList();
    },
  });

  function currentSettings() {
    return { options: controls.read(), collapsible: collapsibleInput.checked };
  }

  function setFeedback(message: string, state: 'ready' | 'error' = 'ready'): void {
    if (disposed) return;
    presetNotice.textContent = message;
    presetNotice.classList.toggle('error', state === 'error');
  }

  function markCustom(
    description = 'Custom settings. Adjusted from a built-in or saved preset.',
  ): void {
    presetDropdown.setValue('custom');
    presetDescription.textContent = description;
  }

  function updateState(): void {
    const snapshot = presetController.snapshot();
    const dirty = presetController.isDirty(currentSettings());
    renderPresetState(presetListView, snapshot, dirty);
    dependencies.onDirtyStateChanged?.(dirty);
  }

  function renderCustomPresetList(): void {
    if (disposed) return;
    const snapshot = presetController.snapshot();
    const dirty = presetController.isDirty(currentSettings());
    renderPresetListView(presetListView, snapshot, dirty, {
      onSelect: (name) => {
        if (disposed) return;
        presetController.select(name);
        renderCustomPresetList();
      },
      onApply: (name) => {
        if (!disposed) applyCustomPreset(name);
      },
      onDelete: (name) => {
        if (!disposed) deleteCustomPreset(name);
      },
    });
    dependencies.onDirtyStateChanged?.(dirty);
  }

  function applyBuiltIn(id: string): void {
    if (disposed) return;
    const preset = getPreset(id);
    if (!preset) {
      setFeedback(
        'That built-in preset is unavailable. Choose another preset and try again.',
        'error',
      );
      return;
    }
    presetController.clearSelection();
    presetDropdown.setValue(id);
    presetDescription.textContent = preset.description;
    controls.apply(optionsForPreset(id));
    renderCustomPresetList();
    onRenderRequested();
  }

  function applyCustomPreset(name: string): void {
    try {
      const settings = presetController.apply(name);
      presetDropdown.setValue('custom');
      controls.apply(settings.options);
      collapsibleInput.checked = settings.collapsible;
      presetDescription.textContent = `Saved preset applied: ${name}.`;
      setFeedback(`Applied saved preset: ${name}.`);
      renderCustomPresetList();
      onRenderRequested();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Saved preset is no longer available.';
      setFeedback(`${message} Select another preset and try again.`, 'error');
    }
  }

  function deleteCustomPreset(name: string): void {
    try {
      presetController.remove(name);
      renderCustomPresetList();
      setFeedback(`Deleted saved preset: ${name}. Undo is available for 8 seconds.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Saved preset could not be deleted.';
      setFeedback(`${message} Select another preset and try again.`, 'error');
    }
  }

  function undoDelete(): void {
    try {
      const restored = presetController.undo();
      if (!restored) return;
      renderCustomPresetList();
      setFeedback(`Restored saved preset: ${restored.name}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Saved preset could not be restored.';
      setFeedback(message, 'error');
    }
  }

  function updateActive(): void {
    const preset = presetController.active();
    const snapshot = presetController.snapshot();
    if (!preset || preset.name !== snapshot.selectedName) {
      setFeedback('Apply a saved preset before updating it.', 'error');
      return;
    }
    const settings = currentSettings();
    if (!presetController.isDirty(settings)) {
      setFeedback('This saved preset already matches the current controls.');
      return;
    }
    try {
      presetController.update(settings);
      renderCustomPresetList();
      setFeedback(`Updated saved preset: ${preset.name}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown preset update error.';
      setFeedback(`Preset update failed: ${message}`, 'error');
    }
  }

  function exportSelected(): void {
    const preset = presetController.selected();
    if (!preset) {
      setFeedback('Select a saved preset before exporting.', 'error');
      return;
    }
    download(
      serializeCustomPreset(preset),
      'application/json;charset=utf-8',
      presetFileName(preset.name),
      document,
      urlApi,
    );
    setFeedback(`Exported saved preset: ${preset.name}.`);
  }

  async function importFile(file: File | undefined): Promise<void> {
    if (!file || disposed) return;
    const revision = ++importRevision;
    const isCurrentImport = (): boolean => !disposed && revision === importRevision;
    try {
      if (file.size > MAX_PRESET_IMPORT_BYTES) {
        throw new Error('Preset import must be 1 MiB or smaller.');
      }
      const contents = await file.text();
      if (!isCurrentImport()) return;
      const imported = parseCustomPresetJson(contents);
      presetController.importPresets(imported);
      renderCustomPresetList();
      setFeedback(`Imported ${imported.length} saved preset${imported.length === 1 ? '' : 's'}.`);
    } catch (error) {
      if (!isCurrentImport()) return;
      const message = error instanceof Error ? error.message : 'Unknown preset import error.';
      setFeedback(
        `Preset import failed: ${message} Choose a compatible preset JSON file and try again.`,
        'error',
      );
    } finally {
      if (isCurrentImport()) importCustomPresetInput.value = '';
    }
  }

  const onPresetInput = (): void => applyBuiltIn(presetDropdown.value);
  const onCustomPresetSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    try {
      const added = presetController.add(customPresetName.value, currentSettings());
      markCustom();
      customPresetName.value = '';
      renderCustomPresetList();
      setFeedback(`Saved preset: ${added.name}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown preset save error.';
      setFeedback(`Preset save failed: ${message}`, 'error');
      customPresetName.focus();
    }
  };
  const onImportClick = (): void => importCustomPresetInput.click();
  const onImportChange = (): void => void importFile(importCustomPresetInput.files?.[0]);

  presetDropdown.input.addEventListener('input', onPresetInput);
  customPresetForm.addEventListener('submit', onCustomPresetSubmit);
  presetListView.updateButton.addEventListener('click', updateActive);
  presetListView.exportButton.addEventListener('click', exportSelected);
  presetListView.undoButton.addEventListener('click', undoDelete);
  importCustomPresetButton.addEventListener('click', onImportClick);
  importCustomPresetInput.addEventListener('change', onImportChange);
  applyBuiltIn('readme');

  return {
    handleControlsChanged(): void {
      if (disposed) return;
      markCustom();
      updateState();
    },

    isDirty(): boolean {
      return !disposed && presetController.isDirty(currentSettings());
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      presetDropdown.input.removeEventListener('input', onPresetInput);
      customPresetForm.removeEventListener('submit', onCustomPresetSubmit);
      presetListView.updateButton.removeEventListener('click', updateActive);
      presetListView.exportButton.removeEventListener('click', exportSelected);
      presetListView.undoButton.removeEventListener('click', undoDelete);
      importCustomPresetButton.removeEventListener('click', onImportClick);
      importCustomPresetInput.removeEventListener('change', onImportChange);
      presetDropdown.destroy();
      presetController.dispose();
    },
  };
}
