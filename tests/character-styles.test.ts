import { describe, expect, it } from 'vitest';
import {
  CHARACTER_STYLES,
  applyCharacterStyle,
  getCharacterStyle,
  resolveCharacterStyleId,
} from '../src/core/character-styles.js';
import { DEFAULT_OPTIONS, RAMPS, optionsForPreset } from '../src/core/presets.js';

describe('character style registry', () => {
  it('publishes the stable style identifiers in UI order', () => {
    expect(CHARACTER_STYLES.map(({ id }) => id)).toEqual([
      'readme',
      'detailed',
      'soft',
      'minimal',
      'calibrated',
      'alphanumeric',
      'blocks',
      'blocks-fine',
      'bars',
      'braille',
      'structure',
    ]);
  });

  it('applies only glyph-related fields without mutating the source', () => {
    const source = optionsForPreset('portrait');
    const snapshot = structuredClone(source);
    const styled = applyCharacterStyle(source, 'braille');

    expect(source).toEqual(snapshot);
    expect(styled).toMatchObject({
      width: source.width,
      contrast: source.contrast,
      renderMode: 'braille',
      edgeGlyphs: false,
      edgeStyle: 'ascii',
    });
  });

  it('uses renderer precedence and keeps legacy ASCII edges orthogonal', () => {
    expect(resolveCharacterStyleId(optionsForPreset('logo'))).toBe('minimal');
    expect(
      resolveCharacterStyleId({
        ...DEFAULT_OPTIONS,
        ramp: RAMPS['blocks-fine'],
        edgeGlyphs: true,
      }),
    ).toBe('blocks-fine');
    expect(
      resolveCharacterStyleId({
        ...DEFAULT_OPTIONS,
        ramp: 'custom ramp ',
        edgeGlyphs: true,
        edgeStyle: 'unicode',
      }),
    ).toBe('structure');
    expect(resolveCharacterStyleId({ ...DEFAULT_OPTIONS, renderMode: 'braille' })).toBe('braille');
  });

  it('returns custom for an unknown tone ramp and undefined for an unknown id', () => {
    expect(resolveCharacterStyleId({ ...DEFAULT_OPTIONS, ramp: 'custom ramp ' })).toBe('custom');
    expect(getCharacterStyle('missing')).toBeUndefined();
  });
});
