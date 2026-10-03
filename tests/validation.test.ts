import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '../src/core/presets.js';
import {
  MAX_GAMMA,
  MAX_OUTPUT_HEIGHT,
  MAX_OUTPUT_WIDTH,
  MAX_RAMP_LENGTH,
  MIN_GAMMA,
  resolveOutputDimensions,
  validateAsciiOptions,
} from '../src/core/validation.js';
import type { AsciiOptions } from '../src/core/types.js';

function options(overrides: Partial<AsciiOptions> = {}): AsciiOptions {
  return {
    ...DEFAULT_OPTIONS,
    ...overrides,
    background: overrides.background ?? { ...DEFAULT_OPTIONS.background },
  };
}

describe('resolveOutputDimensions', () => {
  it('resolves bounded derived and explicit dimensions', () => {
    expect(resolveOutputDimensions(1600, 900, 80, 0.5)).toEqual({ width: 80, height: 23 });
    expect(resolveOutputDimensions(1600, 900, 80, 0.5, 40)).toEqual({ width: 80, height: 40 });
    expect(MAX_OUTPUT_WIDTH).toBe(400);
    expect(MAX_OUTPUT_HEIGHT).toBe(400);
  });

  it('rejects an automatically derived height before allocation', () => {
    expect(() => resolveOutputDimensions(1, 10_000, 88, 0.5)).toThrow(
      'Calculated output height 440000 exceeds the 400-row limit. In the CLI, pass --height; in the browser, choose a less extreme source or crop.',
    );
  });

  it.each([
    ['sourceWidth', 0, 100, 88, 0.5],
    ['sourceWidth', Number.POSITIVE_INFINITY, 100, 88, 0.5],
    ['sourceHeight', 100, Number.NaN, 88, 0.5],
  ] as const)('rejects an invalid %s', (name, sourceWidth, sourceHeight, outputWidth, aspect) => {
    expect(() => resolveOutputDimensions(sourceWidth, sourceHeight, outputWidth, aspect)).toThrow(
      `${name} must be a finite number greater than 0.`,
    );
  });

  it('rejects invalid width, aspect, and explicit height values', () => {
    expect(() => resolveOutputDimensions(100, 100, 1, 0.5)).toThrow(
      'outputWidth must be an integer between 2 and 400.',
    );
    expect(() => resolveOutputDimensions(100, 100, 80, 2.1)).toThrow(
      'cellAspectRatio must be greater than 0 and at most 2.',
    );
    expect(() => resolveOutputDimensions(100, 100, 80, 0.5, 1.5)).toThrow(
      'outputHeight must be an integer between 1 and 400.',
    );
    expect(() => resolveOutputDimensions(100, 100, 80, 0.5, null as never)).toThrow(
      'outputHeight must be an integer between 1 and 400.',
    );
  });
});

describe('validateAsciiOptions', () => {
  it('validates renderer and edge style enums', () => {
    expect(() =>
      validateAsciiOptions({ ...DEFAULT_OPTIONS, renderMode: 'dots' as 'tone' }),
    ).toThrow('renderMode must be one of: tone, braille, shape.');
    expect(() => validateAsciiOptions({ ...DEFAULT_OPTIONS, edgeStyle: 'box' as 'ascii' })).toThrow(
      'edgeStyle must be one of: ascii, unicode.',
    );
  });

  it('rejects edge glyphs with the incompatible Braille cell model', () => {
    expect(() =>
      validateAsciiOptions({ ...DEFAULT_OPTIONS, renderMode: 'braille', edgeGlyphs: true }),
    ).toThrow('Braille render mode cannot be combined with edge glyphs.');
  });

  it('accepts ASCII edges, Unicode structural edges, and Braille without edges', () => {
    expect(() => validateAsciiOptions(DEFAULT_OPTIONS)).not.toThrow();
    expect(() =>
      validateAsciiOptions({ ...DEFAULT_OPTIONS, edgeGlyphs: true, edgeStyle: 'unicode' }),
    ).not.toThrow();
    expect(() =>
      validateAsciiOptions({ ...DEFAULT_OPTIONS, renderMode: 'braille', edgeGlyphs: false }),
    ).not.toThrow();
  });

  it('accepts the default options and the maximum ramp capacity', () => {
    expect(() => validateAsciiOptions(DEFAULT_OPTIONS)).not.toThrow();
    expect(() =>
      validateAsciiOptions(options({ ramp: 'x'.repeat(MAX_RAMP_LENGTH) })),
    ).not.toThrow();
  });

  it('rejects malformed runtime options', () => {
    expect(() => validateAsciiOptions(options({ dither: 'invalid' as never }))).toThrow(
      'dither must be one of: none, floyd-steinberg, atkinson, bayer.',
    );
    expect(() => validateAsciiOptions({ ...DEFAULT_OPTIONS, invert: 'false' } as never)).toThrow(
      'invert must be a boolean.',
    );
    expect(() =>
      validateAsciiOptions({ ...DEFAULT_OPTIONS, background: { r: 0, g: 0 } } as never),
    ).toThrow('background must contain exactly r, g, and b.');
    expect(() =>
      validateAsciiOptions({ ...DEFAULT_OPTIONS, background: { r: 0, g: 0, b: 0, a: 1 } } as never),
    ).toThrow('background must contain exactly r, g, and b.');
  });

  it('bounds ramps to Uint16 index capacity', () => {
    expect(() => validateAsciiOptions(options({ ramp: 'x'.repeat(MAX_RAMP_LENGTH + 1) }))).toThrow(
      'ramp must contain at most 65536 characters.',
    );
  });

  it('rejects unpaired UTF-16 surrogates in ramps', () => {
    expect(() => validateAsciiOptions({ ...DEFAULT_OPTIONS, ramp: '@\ud800' })).toThrow(
      'ramp cannot contain unpaired UTF-16 surrogates.',
    );
  });

  it('bounds gamma to the shared inclusive rendering range', () => {
    expect(MIN_GAMMA).toBe(0.1);
    expect(MAX_GAMMA).toBe(10);

    for (const gamma of [MIN_GAMMA, MAX_GAMMA]) {
      expect(() => validateAsciiOptions(options({ gamma }))).not.toThrow();
    }

    for (const gamma of [Number.MIN_VALUE, MIN_GAMMA - 0.01, MAX_GAMMA + 0.01]) {
      expect(() => validateAsciiOptions(options({ gamma }))).toThrow(
        'gamma must be between 0.1 and 10.',
      );
    }
  });

  it('retains the established numeric and ramp constraints', () => {
    expect(() => validateAsciiOptions(options({ width: 1 }))).toThrow(
      'width must be an integer between 2 and 400.',
    );
    expect(() => validateAsciiOptions(options({ brightness: Number.NaN }))).toThrow(
      'brightness must be a finite number.',
    );
    expect(() => validateAsciiOptions(options({ gamma: 0 }))).toThrow(
      'gamma must be between 0.1 and 10.',
    );
    expect(() => validateAsciiOptions(options({ detail: -0.1 }))).toThrow(
      'detail must not be negative.',
    );
    expect(() => validateAsciiOptions(options({ brightness: -1.01 }))).toThrow(
      'brightness must be between -1 and 1.',
    );
    expect(() => validateAsciiOptions(options({ brightness: 1.01 }))).toThrow(
      'brightness must be between -1 and 1.',
    );
    expect(() =>
      validateAsciiOptions(options({ lowPercentile: 0.8, highPercentile: 0.2 })),
    ).toThrow(
      'Percentiles must be between 0 and 1 with lowPercentile no greater than highPercentile.',
    );
    expect(() => validateAsciiOptions(options({ ramp: '@\n ' }))).toThrow(
      'ramp cannot contain control characters.',
    );
    expect(() => validateAsciiOptions(options({ ramp: '@\u0000 ' }))).toThrow(
      'ramp cannot contain control characters.',
    );
  });
});
