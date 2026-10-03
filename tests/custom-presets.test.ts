import { describe, expect, it } from 'vitest';
import {
  addCustomPreset,
  CUSTOM_PRESET_SCHEMA_VERSION,
  CUSTOM_PRESET_STORAGE_KEY,
  MAX_CUSTOM_PRESETS,
  MAX_PRESET_IMPORT_BYTES,
  loadCustomPresets,
  mergeImportedPresets,
  parseCustomPresetJson,
  removeCustomPreset,
  saveCustomPresets,
  serializeCustomPreset,
  settingsForCustomPreset,
  isCustomPresetDirty,
  updateCustomPreset,
} from '../src/browser/custom-presets.js';
import { DEFAULT_OPTIONS } from '../src/core/presets.js';
import type { AsciiOptions } from '../src/core/types.js';

function settings(overrides: Partial<AsciiOptions> = {}, collapsible = true) {
  return {
    options: {
      ...DEFAULT_OPTIONS,
      width: 104,
      dither: 'bayer' as const,
      ...overrides,
      background: overrides.background ?? { r: 12, g: 34, b: 56 },
    },
    collapsible,
  };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('custom presets', () => {
  it('allocates conflicts with locale-independent case folding', () => {
    const first = addCustomPreset([], 'ISTANBUL', settings());
    const second = addCustomPreset(first, 'istanbul', settings());
    expect(second.map(({ name }) => name)).toEqual(['ISTANBUL', 'istanbul (2)']);
  });

  it('saves and restores every conversion setting and the Markdown details preference', () => {
    const preset = addCustomPreset([], '  README hero  ', settings())[0]!;
    const applied = settingsForCustomPreset(preset);

    expect(preset.name).toBe('README hero');
    expect(applied).toEqual(settings());
    expect(applied.options).not.toBe(preset.settings.options);
    expect(applied.options.background).not.toBe(preset.settings.options.background);
  });

  it('persists custom presets without images or generated output', () => {
    const storage = memoryStorage();
    const presets = addCustomPreset([], 'Logo', settings({ width: 76 }, false));

    expect(saveCustomPresets(storage, presets)).toBe(true);
    expect(JSON.parse(storage.getItem(CUSTOM_PRESET_STORAGE_KEY)!)).toEqual(presets);
    expect(loadCustomPresets(storage)).toEqual(presets);
  });

  it('removes a selected custom preset without affecting other saved entries', () => {
    const presets = addCustomPreset(
      addCustomPreset([], 'Portrait', settings()),
      'Logo',
      settings({ width: 76 }),
    );

    expect(removeCustomPreset(presets, 'Portrait').map((preset) => preset.name)).toEqual(['Logo']);
  });

  it('detects changes in conversion settings and the Markdown details preference', () => {
    const preset = addCustomPreset([], 'Tracked', settings())[0]!;

    expect(isCustomPresetDirty(preset, settings())).toBe(false);
    expect(isCustomPresetDirty(preset, settings({ width: 105 }))).toBe(true);
    expect(isCustomPresetDirty(preset, settings({}, false))).toBe(true);
  });

  it('updates only the explicitly selected preset while preserving its name', () => {
    const presets = addCustomPreset(
      addCustomPreset([], 'Portrait', settings()),
      'Logo',
      settings({ width: 76 }),
    );
    const updated = updateCustomPreset(presets, 'Portrait', settings({ width: 120 }, false));

    expect(updated.map((preset) => preset.name)).toEqual(['Portrait', 'Logo']);
    expect(settingsForCustomPreset(updated[0]!)).toEqual(settings({ width: 120 }, false));
    expect(settingsForCustomPreset(updated[1]!)).toEqual(settings({ width: 76 }));
    expect(() => updateCustomPreset(presets, 'Missing', settings())).toThrow(
      'Saved preset was not found.',
    );
  });

  it('exports the selected preset as a versioned JSON document', () => {
    const preset = addCustomPreset([], 'Shareable', settings())[0]!;
    const exported = JSON.parse(serializeCustomPreset(preset));

    expect(exported).toEqual({
      schemaVersion: CUSTOM_PRESET_SCHEMA_VERSION,
      name: 'Shareable',
      settings: settings(),
    });
  });

  it('imports either one preset or a list of presets', () => {
    const first = addCustomPreset([], 'One', settings())[0]!;
    const second = addCustomPreset([], 'Two', settings({ width: 76 }))[0]!;

    expect(parseCustomPresetJson(JSON.stringify(first))).toEqual([first]);
    expect(parseCustomPresetJson(JSON.stringify([first, second]))).toEqual([first, second]);
  });

  it('migrates schema v1 options in memory and always exports schema v2', () => {
    const v1Options = { ...settings().options } as Record<string, unknown>;
    delete v1Options.renderMode;
    delete v1Options.edgeStyle;
    const [migrated] = parseCustomPresetJson(
      JSON.stringify({
        schemaVersion: 1,
        name: 'Legacy',
        settings: { options: v1Options, collapsible: true },
      }),
    );

    expect(migrated).toMatchObject({
      schemaVersion: 2,
      settings: { options: { renderMode: 'tone', edgeStyle: 'ascii' } },
    });
    expect(JSON.parse(serializeCustomPreset(migrated!))).toMatchObject({ schemaVersion: 2 });
  });

  it('accepts mixed v1/v2 arrays and rejects unknown future versions atomically', () => {
    const current = addCustomPreset([], 'Current', settings({ renderMode: 'braille' }))[0]!;
    const legacy = JSON.parse(serializeCustomPreset(current));
    legacy.schemaVersion = 1;
    delete legacy.settings.options.renderMode;
    delete legacy.settings.options.edgeStyle;

    expect(parseCustomPresetJson(JSON.stringify([legacy, current]))).toHaveLength(2);
    expect(() =>
      parseCustomPresetJson(JSON.stringify([current, { ...current, schemaVersion: 3 }])),
    ).toThrow('Invalid preset: schemaVersion must be 1 or 2.');
  });

  it('tracks renderer fields in dirty-state comparisons', () => {
    const preset = addCustomPreset([], 'Renderer', settings())[0]!;

    expect(isCustomPresetDirty(preset, settings({ renderMode: 'braille' }))).toBe(true);
    expect(isCustomPresetDirty(preset, settings({ edgeStyle: 'unicode' }))).toBe(true);
  });

  it('keeps existing names and makes saved and imported collisions unique', () => {
    const saved = addCustomPreset([], 'Hero', settings());
    const withManualCollision = addCustomPreset(saved, 'hero', settings({ width: 76 }));
    const imported = parseCustomPresetJson(serializeCustomPreset(saved[0]!));
    const merged = mergeImportedPresets(withManualCollision, imported);

    expect(merged.map((preset) => preset.name)).toEqual(['Hero', 'hero (2)', 'Hero (3)']);
  });

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

    expect(MAX_CUSTOM_PRESETS).toBe(100);
    expect(MAX_PRESET_IMPORT_BYTES).toBe(1_048_576);
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

  it('rejects incompatible imports before any persisted preset can change', () => {
    const storage = memoryStorage();
    const valid = addCustomPreset([], 'Safe', settings());
    const invalid = JSON.stringify({ schemaVersion: 3, name: 'Bad', settings: settings() });

    saveCustomPresets(storage, valid);
    expect(() => parseCustomPresetJson(invalid)).toThrow('schemaVersion must be 1 or 2.');
    expect(loadCustomPresets(storage).map((preset) => preset.name)).toEqual(['Safe']);
  });

  it('rejects character ramps the browser controls cannot represent', () => {
    const preset = addCustomPreset([], 'Safe', settings())[0]!;
    const unsupported = {
      ...preset,
      settings: {
        ...preset.settings,
        options: { ...preset.settings.options, ramp: 'custom ramp ' },
      },
    };

    expect(() => parseCustomPresetJson(JSON.stringify(unsupported))).toThrow(
      'ramp is not supported by the browser interface.',
    );
  });

  it('recovers safely from empty, malformed, or invalid local storage data', () => {
    expect(loadCustomPresets(memoryStorage())).toEqual([]);
    expect(loadCustomPresets(memoryStorage({ [CUSTOM_PRESET_STORAGE_KEY]: '{not json' }))).toEqual(
      [],
    );
    expect(loadCustomPresets(memoryStorage({ [CUSTOM_PRESET_STORAGE_KEY]: '[]' }))).toEqual([]);
    expect(saveCustomPresets(undefined, [])).toBe(false);
  });
});
