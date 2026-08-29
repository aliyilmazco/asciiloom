import { describe, expect, it } from 'vitest';
import { parseCliCommand } from '../src/cli-options.js';
import { RAMPS } from '../src/core/presets.js';

describe('parseCliCommand', () => {
  it('applies preset, then style, then explicit overrides', () => {
    const command = parseCliCommand([
      'photo.png',
      '--preset',
      'portrait',
      '--style',
      'blocks-fine',
      '--width',
      '72',
      '--edge-glyphs',
    ]);
    expect(command).toMatchObject({
      help: false,
      options: {
        width: 72,
        ramp: RAMPS['blocks-fine'],
        renderMode: 'tone',
        edgeGlyphs: true,
        edgeStyle: 'ascii',
      },
    });
  });

  it('parses Braille and Structural Unicode styles', () => {
    expect(parseCliCommand(['photo.png', '--style', 'braille'])).toMatchObject({
      help: false,
      options: { renderMode: 'braille', edgeGlyphs: false },
    });
    expect(parseCliCommand(['photo.png', '--style', 'structure'])).toMatchObject({
      help: false,
      options: { renderMode: 'tone', edgeGlyphs: true, edgeStyle: 'unicode' },
    });
  });

  it('rejects unknown and explicitly incompatible style combinations', () => {
    expect(() => parseCliCommand(['photo.png', '--style', 'missing'])).toThrow(
      'Unknown style "missing". Available styles: readme, detailed, soft, minimal, blocks, blocks-fine, braille, structure.',
    );
    expect(() => parseCliCommand(['photo.png', '--style', 'braille', '--ramp', '@ '])).toThrow(
      '--style braille cannot be combined with --ramp.',
    );
    expect(() => parseCliCommand(['photo.png', '--style', 'braille', '--edge-glyphs'])).toThrow(
      '--style braille cannot be combined with --edge-glyphs.',
    );
  });

  it('allows a custom tonal fallback behind Structural Unicode', () => {
    expect(parseCliCommand(['photo.png', '--style', 'structure', '--ramp', '@ '])).toMatchObject({
      help: false,
      options: { ramp: '@ ', edgeGlyphs: true, edgeStyle: 'unicode' },
    });
  });

  it('parses one image path and validates options before image decoding', () => {
    const command = parseCliCommand([
      'photo.png',
      '--width',
      '100',
      '--brightness',
      '0.2',
      '--edge-threshold',
      '0.4',
      '--format',
      'svg',
    ]);

    expect(command).toMatchObject({
      help: false,
      input: 'photo.png',
      format: 'svg',
      options: { width: 100, brightness: 0.2, edgeThreshold: 0.4 },
    });
  });

  it('rejects missing or extra image paths', () => {
    expect(() => parseCliCommand([])).toThrow('Exactly one input image path is required.');
    expect(() => parseCliCommand(['first.png', 'second.png'])).toThrow(
      'Exactly one input image path is required.',
    );
  });

  it('rejects invalid ranges and missing all-output destination', () => {
    expect(() => parseCliCommand(['photo.png', '--brightness', '1.1'])).toThrow(
      'brightness must be between -1 and 1.',
    );
    expect(() => parseCliCommand(['photo.png', '--edge-threshold', '-0.01'])).toThrow(
      'edge-threshold must be between 0 and 1.',
    );
    expect(() => parseCliCommand(['photo.png', '--width', '401'])).toThrow(
      'width must be between 2 and 400.',
    );
    expect(() => parseCliCommand(['photo.png', '--format', 'all'])).toThrow(
      '--output is required when --format all is used.',
    );
  });

  it('uses the shared inclusive gamma range', () => {
    expect(parseCliCommand(['photo.png', '--gamma', '0.1'])).toMatchObject({
      help: false,
      options: { gamma: 0.1 },
    });
    expect(parseCliCommand(['photo.png', '--gamma', '10'])).toMatchObject({
      help: false,
      options: { gamma: 10 },
    });

    for (const gamma of ['5e-324', '0.09', '10.01']) {
      expect(() => parseCliCommand(['photo.png', '--gamma', gamma])).toThrow(
        'gamma must be between 0.1 and 10.',
      );
    }
  });

  it('accepts negative numeric values in the documented space-separated form', () => {
    const command = parseCliCommand(['photo.png', '--brightness', '-0.2']);
    expect(command).toMatchObject({ help: false, options: { brightness: -0.2 } });
  });

  it('does not normalize option-looking positionals after the terminator', () => {
    expect(() => parseCliCommand(['--', '--brightness', '-0.2'])).toThrow(
      'Exactly one input image path is required.',
    );
  });

  it.each(['', '   '])('rejects an explicitly empty output path %j', (output) => {
    expect(() => parseCliCommand(['photo.png', '--output', output])).toThrow(
      '--output must not be empty.',
    );
  });

  it.each(['__proto__', 'constructor', 'toString'])(
    'rejects inherited object key %s as an output format',
    (format) => {
      expect(() => parseCliCommand(['photo.png', '--format', format])).toThrow(
        'format must be text, markdown, svg, or all.',
      );
    },
  );

  it.each(['__proto__', 'constructor', 'toString'])(
    'preserves inherited object key %s as a custom ramp',
    (ramp) => {
      const command = parseCliCommand(['photo.png', '--ramp', ramp]);

      expect(command.help).toBe(false);
      if (!command.help) expect(command.options.ramp).toBe(ramp);
    },
  );

  it('runs the assembled options through shared runtime validation', () => {
    expect(() => parseCliCommand(['photo.png', '--ramp', ''])).toThrow(
      'ramp must contain at least two characters.',
    );
    expect(() => parseCliCommand(['photo.png', '--dither', ''])).toThrow(
      'dither must be one of: none, floyd-steinberg, atkinson, bayer.',
    );
    expect(() => parseCliCommand(['photo.png', '--background', ''])).toThrow(
      'background must be a six-digit hex color such as #ffffff.',
    );
    expect(() => parseCliCommand(['photo.png', '--ramp', 'x'.repeat(65_537)])).toThrow(
      'ramp must contain at most 65536 characters.',
    );
  });
});
