import { describe, expect, it } from 'vitest';
import { handleRenderRequest } from '../src/browser/render-worker.js';
import { DEFAULT_OPTIONS } from '../src/core/presets.js';

function request(overrides: { data?: ArrayBuffer; outputHeight?: number } = {}) {
  return {
    revision: 42,
    data: overrides.data ?? new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]).buffer,
    width: 2,
    height: 1,
    outputHeight: overrides.outputHeight ?? 1,
    options: {
      ...DEFAULT_OPTIONS,
      width: 2,
      ramp: '@ ',
      autoLevels: false,
      contrast: 1,
      brightness: 0,
      gamma: 1,
      detail: 0,
      dither: 'none' as const,
      trimLineEnds: false,
      background: { ...DEFAULT_OPTIONS.background },
    },
  };
}

describe('render worker handler', () => {
  it('converts a transferred RGBA buffer and preserves the request revision', () => {
    expect(handleRenderRequest(request())).toEqual({
      revision: 42,
      ok: true,
      art: '@ ',
      width: 2,
      height: 1,
    });
  });

  it('serializes conversion errors without throwing across the worker boundary', () => {
    expect(handleRenderRequest(request({ outputHeight: 0 }))).toEqual({
      revision: 42,
      ok: false,
      message: 'outputHeight must be an integer between 1 and 400.',
    });
  });
});
