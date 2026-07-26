import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, PRESETS, getPreset, optionsForPreset } from '../src/core/presets.js';

function assertBuiltInPresetIsReadonly(): void {
  const preset = getPreset('readme');
  if (preset) {
    // @ts-expect-error Built-in preset data must stay readonly for consumers.
    preset.options.width = 2;
  }
}

void assertBuiltInPresetIsReadonly;

describe('built-in presets', () => {
  it('finds known presets without silently selecting an unknown preset', () => {
    expect(getPreset('readme')?.id).toBe('readme');
    expect(getPreset('missing')).toBeUndefined();
    expect(() => optionsForPreset('missing')).toThrow('Unknown preset "missing".');
  });

  it('returns complete options with independent nested background values', () => {
    const first = optionsForPreset('readme');
    const second = optionsForPreset('readme');

    expect(first).toMatchObject(PRESETS[0]?.options ?? {});
    expect(first.background).not.toBe(DEFAULT_OPTIONS.background);
    expect(first.background).not.toBe(second.background);

    first.background.r = 0;
    expect(second.background.r).toBe(255);
    expect(DEFAULT_OPTIONS.background.r).toBe(255);
  });

  it('keeps every built-in preset on the legacy tone and ASCII-edge paths', () => {
    expect(
      PRESETS.map(({ id }) => optionsForPreset(id)).map(({ renderMode, edgeStyle }) => ({
        renderMode,
        edgeStyle,
      })),
    ).toEqual(PRESETS.map(() => ({ renderMode: 'tone', edgeStyle: 'ascii' })));
  });
});
