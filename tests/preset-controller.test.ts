import { describe, expect, it, vi } from 'vitest';
import {
  addCustomPreset,
  CUSTOM_PRESET_STORAGE_KEY,
  serializeCustomPreset,
  settingsForCustomPreset,
} from '../src/browser/custom-presets.js';
import { createPresetController } from '../src/browser/preset-controller.js';
import { DEFAULT_OPTIONS } from '../src/core/presets.js';
import type { AsciiOptions } from '../src/core/types.js';

function settings(overrides: Partial<AsciiOptions> = {}) {
  return {
    options: {
      ...DEFAULT_OPTIONS,
      ...overrides,
      background: overrides.background ?? { ...DEFAULT_OPTIONS.background },
    },
    collapsible: false,
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('saved-preset controller', () => {
  it('tracks selection, active editing, dirty state, and updates', () => {
    const initial = addCustomPreset([], 'Tracked', settings());
    const controller = createPresetController({
      storage: memoryStorage(),
      initialPresets: initial,
    });

    const applied = controller.apply('Tracked');
    expect(applied).toEqual(settings());
    expect(controller.snapshot()).toMatchObject({
      selectedName: 'Tracked',
      activeName: 'Tracked',
      undoAvailable: false,
    });

    const changed = settings({ width: 120 });
    expect(controller.isDirty(changed)).toBe(true);
    controller.update(changed);
    expect(controller.isDirty(changed)).toBe(false);
    expect(settingsForCustomPreset(controller.active()!)).toEqual(changed);
  });

  it('preserves the active dirty preset while another preset is selected for export', () => {
    const first = addCustomPreset([], 'First', settings());
    const initial = addCustomPreset(first, 'Second', settings({ width: 96 }));
    const controller = createPresetController({
      storage: memoryStorage(),
      initialPresets: initial,
    });

    controller.apply('First');
    const changed = settings({ width: 120 });
    expect(controller.isDirty(changed)).toBe(true);

    controller.select('Second');
    expect(controller.snapshot()).toMatchObject({
      selectedName: 'Second',
      activeName: 'First',
    });
    expect(controller.isDirty(changed)).toBe(true);

    controller.select('First');
    controller.update(changed);
    expect(controller.isDirty(changed)).toBe(false);
  });

  it('reconciles storage before writes so stale controllers do not overwrite other tabs', () => {
    const storage = memoryStorage();
    const firstTab = createPresetController({ storage });
    const secondTab = createPresetController({ storage });

    firstTab.add('From A', settings());
    secondTab.add('From B', settings({ width: 120 }));

    expect(secondTab.snapshot().presets.map(({ name }) => name)).toEqual(['From A', 'From B']);
    expect(
      createPresetController({ storage })
        .snapshot()
        .presets.map(({ name }) => name),
    ).toEqual(['From A', 'From B']);
  });

  it('defers v1 storage migration until a successful mutation and then writes only v2', () => {
    const current = addCustomPreset([], 'Legacy', settings())[0]!;
    const legacy = JSON.parse(serializeCustomPreset(current));
    legacy.schemaVersion = 1;
    delete legacy.settings.options.renderMode;
    delete legacy.settings.options.edgeStyle;
    const values = new Map([[CUSTOM_PRESET_STORAGE_KEY, JSON.stringify([legacy])]]);
    const setItem = vi.fn((key: string, value: string) => values.set(key, value));
    const controller = createPresetController({
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem,
      },
    });

    expect(controller.apply('Legacy').options).toMatchObject({
      renderMode: 'tone',
      edgeStyle: 'ascii',
    });
    expect(setItem).not.toHaveBeenCalled();

    controller.add('Current', settings({ renderMode: 'braille' }));

    expect(setItem).toHaveBeenCalledOnce();
    expect(
      JSON.parse(values.get(CUSTOM_PRESET_STORAGE_KEY)!).every(
        ({ schemaVersion }: { schemaVersion: number }) => schemaVersion === 2,
      ),
    ).toBe(true);
  });

  it('keeps a surviving dirty active preset associated across another preset delete and undo', () => {
    const first = addCustomPreset([], 'Active', settings());
    const initial = addCustomPreset(first, 'Export', settings({ width: 96 }));
    const controller = createPresetController({
      storage: memoryStorage(),
      initialPresets: initial,
    });
    const changed = settings({ width: 120 });

    controller.apply('Active');
    controller.select('Export');
    controller.remove('Export');
    expect(controller.isDirty(changed)).toBe(true);

    controller.undo();
    expect(controller.snapshot()).toMatchObject({
      selectedName: 'Export',
      activeName: 'Active',
    });
    expect(controller.isDirty(changed)).toBe(true);

    controller.select('Active');
    controller.update(changed);
    expect(controller.isDirty(changed)).toBe(false);
  });

  it('deletes and restores a preset during the undo window', () => {
    let expire: (() => void) | undefined;
    const cancel = vi.fn();
    const controller = createPresetController({
      storage: memoryStorage(),
      initialPresets: addCustomPreset([], 'Temporary', settings()),
      scheduler: {
        schedule: (callback) => {
          expire = callback;
          return 42;
        },
        cancel,
      },
    });

    controller.apply('Temporary');
    controller.remove('Temporary');
    expect(controller.snapshot()).toMatchObject({
      selectedName: null,
      activeName: null,
      undoAvailable: true,
    });
    expect(controller.snapshot().presets).toHaveLength(0);

    const restored = controller.undo();
    expect(restored?.name).toBe('Temporary');
    expect(controller.snapshot()).toMatchObject({
      selectedName: 'Temporary',
      activeName: null,
      undoAvailable: false,
    });
    expect(cancel).toHaveBeenCalledWith(42);
    expect(expire).toBeTypeOf('function');
  });

  it('expires undo state without mutating the saved collection', () => {
    let expire: (() => void) | undefined;
    const onUndoExpired = vi.fn();
    const controller = createPresetController({
      storage: memoryStorage(),
      initialPresets: addCustomPreset([], 'Temporary', settings()),
      scheduler: {
        schedule: (callback) => {
          expire = callback;
          return 7;
        },
        cancel: () => undefined,
      },
      onUndoExpired,
    });

    controller.remove('Temporary');
    expire!();

    expect(controller.snapshot().undoAvailable).toBe(false);
    expect(controller.snapshot().presets).toHaveLength(0);
    expect(onUndoExpired).toHaveBeenCalledOnce();
  });

  it('keeps state unchanged when browser storage rejects a mutation', () => {
    const initial = addCustomPreset([], 'Safe', settings());
    const controller = createPresetController({
      initialPresets: initial,
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('denied');
        },
      },
    });

    expect(() => controller.remove('Safe')).toThrow('could not be written to browser storage');
    expect(controller.snapshot().presets.map((preset) => preset.name)).toEqual(['Safe']);
  });
});
