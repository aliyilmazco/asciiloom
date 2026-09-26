import { describe, expect, it, vi } from 'vitest';
import { calculateOutputHeight, convertRgbaToAscii, relativeLuminance } from '../src/core/ascii.js';
import { DEFAULT_OPTIONS, RAMPS } from '../src/core/presets.js';
import type { AsciiOptions, RgbaImage } from '../src/core/types.js';

function options(overrides: Partial<AsciiOptions> = {}): AsciiOptions {
  return {
    ...DEFAULT_OPTIONS,
    width: 2,
    ramp: '@ ',
    autoLevels: false,
    contrast: 1,
    brightness: 0,
    gamma: 1,
    detail: 0,
    dither: 'none',
    trimLineEnds: false,
    ...overrides,
    background: overrides.background ?? { ...DEFAULT_OPTIONS.background },
  };
}

function grayscaleImage(
  width: number,
  height: number,
  valueAt: (x: number, y: number) => number,
): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = valueAt(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height, channels: 4 };
}

// Reference CIE L*/100 for an sRGB grey byte, and its inverse, from the standard formulas.
function lightnessOfByte(byte: number): number {
  const y = relativeLuminance(byte, byte, byte);
  return y > 216 / 24_389 ? 1.16 * Math.cbrt(y) - 0.16 : (y * 24_389) / 2700;
}

function byteForLightness(lightness: number): number {
  const y = lightness > 0.08 ? ((lightness + 0.16) / 1.16) ** 3 : (lightness * 2700) / 24_389;
  return Math.round(255 * (y <= 0.0031308 ? 12.92 * y : 1.055 * Math.pow(y, 1 / 2.4) - 0.055));
}

describe('calculateOutputHeight', () => {
  it('corrects for tall monospace character cells', () => {
    expect(calculateOutputHeight(1600, 900, 80, 0.5)).toBe(23);
  });

  it('rejects a derived output height above the shared safety limit', () => {
    expect(() => calculateOutputHeight(1, 10_000, 88, 0.5)).toThrow(
      'Calculated output height 440000 exceeds the 400-row limit.',
    );
  });
});

describe('relativeLuminance', () => {
  it('maps black to 0 and white to 1', () => {
    expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0, 10);
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 10);
  });

  it('weights green more strongly than blue', () => {
    expect(relativeLuminance(0, 255, 0)).toBeGreaterThan(relativeLuminance(0, 0, 255));
  });
});

describe('convertRgbaToAscii', () => {
  it('spreads an evenly perceived grey gradient across every Fine Blocks level', () => {
    const image = grayscaleImage(9, 1, (x) => byteForLightness(x / 8));
    const result = convertRgbaToAscii(
      image,
      options({
        width: 9,
        ramp: RAMPS['blocks-fine'],
        trimLineEnds: false,
      }),
      1,
    );

    expect(Array.from(result.art)).toEqual(['█', '▉', '▊', '▋', '▌', '▍', '▎', '▏', ' ']);
  });

  it('renders true 2×4 Braille subcells and averages them into text-cell values', () => {
    const result = convertRgbaToAscii(
      grayscaleImage(4, 4, () => 0),
      options({ width: 2, renderMode: 'braille' }),
      1,
    );

    expect(result.art).toBe('⣿⣿');
    expect(result.values).toHaveLength(2);
    expect(Array.from(result.values)).toEqual([0, 0]);
  });

  it('uses Unicode structure only when edgeStyle is unicode', () => {
    const image = grayscaleImage(4, 4, (x) => (x < 2 ? 0 : 255));
    const base = options({
      width: 4,
      ramp: RAMPS.minimal,
      edgeGlyphs: true,
      edgeThreshold: 0.05,
    });

    expect(convertRgbaToAscii(image, { ...base, edgeStyle: 'ascii' }, 4).art).toMatch(/[|/\\-]/u);
    expect(convertRgbaToAscii(image, { ...base, edgeStyle: 'unicode' }, 4).art).toMatch(
      /[─│╱╲┌┐└┘├┤┬┴┼]/u,
    );
  });

  it.each(['none', 'atkinson', 'floyd-steinberg', 'bayer'] as const)(
    'keeps Fine Blocks and Braille deterministic with %s dithering',
    (dither) => {
      const image = grayscaleImage(8, 8, (x, y) => Math.round(((x + y) / 14) * 255));
      const fineOptions = options({
        width: 4,
        ramp: RAMPS['blocks-fine'],
        dither,
      });
      const brailleOptions = { ...fineOptions, renderMode: 'braille' as const };
      expect(convertRgbaToAscii(image, fineOptions, 2).art).toBe(
        convertRgbaToAscii(image, fineOptions, 2).art,
      );
      expect(convertRgbaToAscii(image, brailleOptions, 2).art).toBe(
        convertRgbaToAscii(image, brailleOptions, 2).art,
      );
    },
  );

  it('applies background compositing and inversion to Braille subcells', () => {
    const transparent: RgbaImage = {
      data: new Uint8Array(2 * 4 * 4),
      width: 2,
      height: 4,
      channels: 4,
    };
    const base = options({ width: 2, renderMode: 'braille' });
    const light = convertRgbaToAscii(
      transparent,
      { ...base, background: { r: 255, g: 255, b: 255 } },
      1,
    ).art;
    const dark = convertRgbaToAscii(
      transparent,
      { ...base, background: { r: 0, g: 0, b: 0 } },
      1,
    ).art;

    expect(light).not.toBe(dark);
    expect(
      convertRgbaToAscii(
        transparent,
        { ...base, background: { r: 255, g: 255, b: 255 }, invert: true },
        1,
      ).art,
    ).toBe(dark);
  });

  it('maps dark pixels to dense glyphs and light pixels to spaces', () => {
    const image: RgbaImage = {
      width: 2,
      height: 1,
      channels: 4,
      data: new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]),
    };

    expect(convertRgbaToAscii(image, options(), 1).art).toBe('@ ');
  });

  it('rejects underflowing gamma and preserves white at the supported minimum', () => {
    const white: RgbaImage = {
      width: 2,
      height: 1,
      channels: 4,
      data: new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255]),
    };

    expect(() => convertRgbaToAscii(white, options({ gamma: Number.MIN_VALUE }), 1)).toThrow(
      'gamma must be between 0.1 and 10.',
    );
    expect(convertRgbaToAscii(white, options({ gamma: 0.1 }), 1).art).toBe('  ');
  });

  it('composites transparent pixels against the configured background', () => {
    const image: RgbaImage = {
      width: 2,
      height: 1,
      channels: 4,
      data: new Uint8Array([0, 0, 0, 255, 0, 0, 0, 0]),
    };

    expect(
      convertRgbaToAscii(image, options({ background: { r: 255, g: 255, b: 255 } }), 1).art,
    ).toBe('@ ');
  });

  it('keeps every row at the requested width when trailing spaces are retained', () => {
    const width = 12;
    const height = 6;
    const data = new Uint8Array(width * height * 4);
    for (let index = 0; index < data.length; index += 4) {
      const value = (index / 4) % 255;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }

    const result = convertRgbaToAscii(
      { data, width, height, channels: 4 },
      options({ width, ramp: '@%#*+=-:. ', dither: 'atkinson' }),
      height,
    );

    for (const line of result.art.split('\n')) expect(Array.from(line)).toHaveLength(width);
  });

  it('is deterministic for the same input and options', () => {
    const image: RgbaImage = {
      width: 4,
      height: 2,
      channels: 4,
      data: new Uint8Array([
        12, 40, 90, 255, 70, 90, 120, 255, 130, 160, 180, 255, 250, 240, 220, 255, 20, 10, 5, 255,
        80, 40, 110, 255, 160, 150, 140, 255, 240, 250, 255, 255,
      ]),
    };
    const selected = options({ width: 4, ramp: '@%#*+=-:. ', dither: 'floyd-steinberg' });
    const first = convertRgbaToAscii(image, selected, 2).art;
    const second = convertRgbaToAscii(image, selected, 2).art;
    expect(first).toBe(second);
  });

  it('applies the deterministic Bayer 4x4 threshold pattern', () => {
    const image = grayscaleImage(4, 4, () => byteForLightness(0.5));

    const result = convertRgbaToAscii(image, options({ width: 4, ramp: '@.', dither: 'bayer' }), 4);

    expect(result.art).toBe('@.@.\n.@.@\n@.@.\n.@.@');
  });

  it('maps vertical, horizontal, and diagonal gradients to structural edge glyphs', () => {
    const edgeOptions = options({
      width: 5,
      ramp: '@%#*+=-:. ',
      edgeGlyphs: true,
      edgeThreshold: 0.01,
    });

    expect(
      convertRgbaToAscii(
        grayscaleImage(5, 5, (x) => 50 + x * 40),
        edgeOptions,
        5,
      ).art,
    ).toBe('|||||\n|||||\n|||||\n|||||\n|||||');
    expect(
      convertRgbaToAscii(
        grayscaleImage(5, 5, (_x, y) => 50 + y * 40),
        edgeOptions,
        5,
      ).art,
    ).toBe('-----\n-----\n-----\n-----\n-----');
    expect(
      convertRgbaToAscii(
        grayscaleImage(5, 5, (x, y) => 40 + (x + y) * 25),
        edgeOptions,
        5,
      ).art,
    ).toContain('/');

    const withoutOverlay = convertRgbaToAscii(
      grayscaleImage(5, 5, (x) => 50 + x * 40),
      { ...edgeOptions, edgeThreshold: 1 },
      5,
    ).art;
    expect(withoutOverlay).not.toContain('|');
  });

  it('preserves structural edge glyphs on hard black and white boundaries', () => {
    const result = convertRgbaToAscii(
      grayscaleImage(8, 4, (x) => (x < 4 ? 0 : 255)),
      options({
        width: 8,
        ramp: '@ ',
        edgeGlyphs: true,
        edgeThreshold: 0.1,
      }),
      4,
    );

    expect(result.art).toContain('|');
  });

  it('normalizes luminance using the configured low and high quantiles', () => {
    const values = [0, 64, 128, 255];
    const image = grayscaleImage(4, 1, (x) => values[x]!);

    const result = convertRgbaToAscii(
      image,
      options({
        width: 4,
        ramp: '@%# ',
        autoLevels: true,
        lowPercentile: 0.25,
        highPercentile: 0.75,
      }),
      1,
    );

    const low = lightnessOfByte(0) * 0.25 + lightnessOfByte(64) * 0.75;
    const high = lightnessOfByte(128) * 0.75 + lightnessOfByte(255) * 0.25;
    expect(Array.from(result.values)).toEqual([
      0,
      expect.closeTo((lightnessOfByte(64) - low) / (high - low), 9),
      expect.closeTo((lightnessOfByte(128) - low) / (high - low), 9),
      1,
    ]);
    expect(result.art).toBe('@@# ');
  });

  it('leaves local luminance unchanged when detail recovery is disabled', () => {
    const levels = [80, 180, 80, 180, 180, 80, 180, 80];
    const image = grayscaleImage(4, 2, (x, y) => levels[y * 4 + x]!);
    const withoutDetail = convertRgbaToAscii(image, options({ width: 4, detail: 0 }), 2);
    const withDetail = convertRgbaToAscii(image, options({ width: 4, detail: 0.5 }), 2);

    expect(Array.from(withoutDetail.values)).toEqual(
      levels.map((value) => expect.closeTo(lightnessOfByte(value), 12)),
    );
    expect(Array.from(withDetail.values)).not.toEqual(Array.from(withoutDetail.values));
  });

  it('maps through the maximum Uint16-sized ramp without wrapping the last index', () => {
    const image = grayscaleImage(2, 1, (x) => (x === 0 ? 0 : 255));
    const ramp = `${'@'.repeat(65_535)} `;

    expect(convertRgbaToAscii(image, options({ ramp }), 1).art).toBe('@ ');
  });

  it('rejects invalid option ranges before converting image data', () => {
    const image: RgbaImage = {
      width: 2,
      height: 1,
      channels: 4,
      data: new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]),
    };

    expect(() => convertRgbaToAscii(image, options({ detail: -0.1 }))).toThrow(
      'detail must not be negative.',
    );
    expect(() => convertRgbaToAscii(image, options({ edgeThreshold: 1.1 }))).toThrow(
      'edgeThreshold must be between 0 and 1.',
    );
    expect(() =>
      convertRgbaToAscii(image, options({ lowPercentile: 0.8, highPercentile: 0.2 })),
    ).toThrow('Percentiles must be between 0 and 1');
    expect(() =>
      convertRgbaToAscii(image, options({ background: { r: 256, g: 255, b: 255 } })),
    ).toThrow('background.r must be an integer between 0 and 255.');
  });

  it('sorts luminance samples once when applying both auto-level percentiles', () => {
    const image: RgbaImage = {
      width: 2,
      height: 1,
      channels: 4,
      data: new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]),
    };
    const sort = vi.spyOn(Array.prototype, 'sort');

    try {
      convertRgbaToAscii(image, options({ autoLevels: true }), 1);
      expect(sort).toHaveBeenCalledTimes(1);
    } finally {
      sort.mockRestore();
    }
  });
});
