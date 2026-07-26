import {
  addCustomPreset,
  isCustomPresetDirty,
  loadCustomPresets,
  mergeImportedPresets,
  readStoredCustomPresets,
  removeCustomPreset,
  saveCustomPresets,
  settingsForCustomPreset,
  updateCustomPreset,
  type CustomPreset,
  type CustomPresetSettings,
  type PresetStorage,
} from './custom-presets.js';

export interface UndoScheduler {
  schedule(callback: () => void, delay: number): unknown;
  cancel(handle: unknown): void;
}

export interface PresetControllerOptions {
  storage: PresetStorage | undefined;
  initialPresets?: readonly CustomPreset[];
  scheduler?: UndoScheduler;
  undoDurationMs?: number;
  onUndoExpired?: () => void;
}

export interface PresetControllerSnapshot {
  presets: readonly CustomPreset[];
  selectedName: string | null;
  activeName: string | null;
  undoAvailable: boolean;
}

export interface PresetController {
  snapshot(): PresetControllerSnapshot;
  selected(): CustomPreset | undefined;
  active(): CustomPreset | undefined;
  select(name: string): void;
  apply(name: string): CustomPresetSettings;
  clearSelection(): void;
  add(name: string, settings: CustomPresetSettings): CustomPreset;
  update(settings: CustomPresetSettings): CustomPreset;
  importPresets(imported: readonly CustomPreset[]): readonly CustomPreset[];
  remove(name: string): CustomPreset;
  undo(): CustomPreset | undefined;
  isDirty(settings: CustomPresetSettings): boolean;
  dispose(): void;
}

const defaultScheduler: UndoScheduler = {
  schedule: (callback, delay) => globalThis.setTimeout(callback, delay),
  cancel: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function clonePreset(preset: CustomPreset): CustomPreset {
  return {
    schemaVersion: preset.schemaVersion,
    name: preset.name,
    settings: settingsForCustomPreset(preset),
  };
}

function findPreset(
  presets: readonly CustomPreset[],
  name: string | null,
): CustomPreset | undefined {
  return name === null ? undefined : presets.find((preset) => preset.name === name);
}

export function createPresetController(options: PresetControllerOptions): PresetController {
  const scheduler = options.scheduler ?? defaultScheduler;
  const undoDurationMs = options.undoDurationMs ?? 8_000;
  let presets = (options.initialPresets ?? loadCustomPresets(options.storage)).map(clonePreset);
  let selectedName: string | null = presets[0]?.name ?? null;
  let activeName: string | null = null;
  let deletedPreset: CustomPreset | null = null;
  let undoHandle: unknown;

  const reconcile = (latest: readonly CustomPreset[]): void => {
    presets = latest.map(clonePreset);
    if (selectedName !== null && !findPreset(presets, selectedName)) selectedName = null;
    if (activeName !== null && !findPreset(presets, activeName)) activeName = null;
  };

  const refreshBeforeMutation = (): void => {
    if (!options.storage) return;
    let latest: CustomPreset[] | null;
    try {
      latest = readStoredCustomPresets(options.storage);
    } catch {
      throw new Error(
        'Saved presets could not be read from browser storage. Check browser storage permissions and try again.',
      );
    }
    if (latest !== null) reconcile(latest);
  };

  const persist = (next: CustomPreset[]): void => {
    if (!saveCustomPresets(options.storage, next)) {
      throw new Error(
        'Saved presets could not be written to browser storage. Check browser storage permissions and try again.',
      );
    }
    presets = next;
  };

  const clearUndoTimer = (): void => {
    if (undoHandle === undefined) return;
    scheduler.cancel(undoHandle);
    undoHandle = undefined;
  };

  const presetByName = (name: string): CustomPreset => {
    const preset = findPreset(presets, name);
    if (!preset) throw new Error('Saved preset was not found.');
    return preset;
  };

  return {
    snapshot(): PresetControllerSnapshot {
      return {
        presets: presets.map(clonePreset),
        selectedName,
        activeName,
        undoAvailable: deletedPreset !== null,
      };
    },

    selected(): CustomPreset | undefined {
      const preset = findPreset(presets, selectedName);
      return preset ? clonePreset(preset) : undefined;
    },

    active(): CustomPreset | undefined {
      const preset = findPreset(presets, activeName);
      return preset ? clonePreset(preset) : undefined;
    },

    select(name: string): void {
      presetByName(name);
      selectedName = name;
    },

    apply(name: string): CustomPresetSettings {
      const preset = presetByName(name);
      selectedName = name;
      activeName = name;
      return settingsForCustomPreset(preset);
    },

    clearSelection(): void {
      selectedName = null;
      activeName = null;
    },

    add(name: string, settings: CustomPresetSettings): CustomPreset {
      refreshBeforeMutation();
      const next = addCustomPreset(presets, name, settings);
      persist(next);
      const added = next.at(-1)!;
      selectedName = added.name;
      activeName = added.name;
      return clonePreset(added);
    },

    update(settings: CustomPresetSettings): CustomPreset {
      refreshBeforeMutation();
      if (activeName === null || activeName !== selectedName) {
        throw new Error('Apply a saved preset before updating it.');
      }
      const next = updateCustomPreset(presets, activeName, settings);
      persist(next);
      return clonePreset(presetByName(activeName));
    },

    importPresets(imported: readonly CustomPreset[]): readonly CustomPreset[] {
      refreshBeforeMutation();
      const next = mergeImportedPresets(presets, imported);
      persist(next);
      selectedName = next.at(-1)?.name ?? null;
      return next.map(clonePreset);
    },

    remove(name: string): CustomPreset {
      refreshBeforeMutation();
      const removed = clonePreset(presetByName(name));
      const next = removeCustomPreset(presets, name);
      persist(next);
      if (selectedName === name) selectedName = null;
      if (activeName === name) activeName = null;

      clearUndoTimer();
      deletedPreset = removed;
      undoHandle = scheduler.schedule(() => {
        deletedPreset = null;
        undoHandle = undefined;
        options.onUndoExpired?.();
      }, undoDurationMs);
      return clonePreset(removed);
    },

    undo(): CustomPreset | undefined {
      if (!deletedPreset) return undefined;
      refreshBeforeMutation();
      const next = mergeImportedPresets(presets, [deletedPreset]);
      persist(next);
      const restored = next.at(-1)!;
      selectedName = restored.name;
      deletedPreset = null;
      clearUndoTimer();
      return clonePreset(restored);
    },

    isDirty(settings: CustomPresetSettings): boolean {
      const active = findPreset(presets, activeName);
      return active !== undefined && isCustomPresetDirty(active, settings);
    },

    dispose(): void {
      clearUndoTimer();
      deletedPreset = null;
    },
  };
}
