import type { AsciiOptions, DitherMode, EdgeStyle, RenderMode, RgbColor } from './types.js';

export const MAX_OUTPUT_WIDTH = 400;
export const MAX_OUTPUT_HEIGHT = 400;
export const MAX_RAMP_LENGTH = 65_536;
export const MIN_GAMMA = 0.1;
export const MAX_GAMMA = 10;
export const DITHER_MODES = [
  'none',
  'floyd-steinberg',
  'atkinson',
  'bayer',
] as const satisfies readonly DitherMode[];
export const RENDER_MODES = ['tone', 'braille', 'shape'] as const satisfies readonly RenderMode[];
/** Subcell samples per character cell (x, y) for modes that look inside a cell. */
export const SUBCELL_GRID = {
  braille: [2, 4],
  shape: [3, 4],
} as const satisfies Record<Exclude<RenderMode, 'tone'>, readonly [number, number]>;
export const EDGE_STYLES = ['ascii', 'unicode'] as const satisfies readonly EdgeStyle[];

export interface OutputDimensions {
  width: number;
  height: number;
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
}

function assertPositiveSourceDimension(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite number greater than 0.`);
  }
}

function assertOutputWidth(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 2 || value > MAX_OUTPUT_WIDTH) {
    throw new RangeError(`${name} must be an integer between 2 and ${MAX_OUTPUT_WIDTH}.`);
  }
}

function assertCellAspectRatio(value: number): void {
  assertFinite('cellAspectRatio', value);
  if (value <= 0 || value > 2) {
    throw new RangeError('cellAspectRatio must be greater than 0 and at most 2.');
  }
}

function assertOutputHeight(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_OUTPUT_HEIGHT) {
    throw new RangeError(`outputHeight must be an integer between 1 and ${MAX_OUTPUT_HEIGHT}.`);
  }
}

function assertBoolean(name: string, value: unknown): void {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${name} must be a boolean.`);
  }
}

function validateBackground(value: RgbColor): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('background must contain exactly r, g, and b.');
  }

  const keys = Object.keys(value);
  if (keys.length !== 3 || !['r', 'g', 'b'].every((key) => keys.includes(key))) {
    throw new TypeError('background must contain exactly r, g, and b.');
  }

  for (const name of ['r', 'g', 'b'] as const) {
    const channel = value[name];
    if (!Number.isInteger(channel) || channel < 0 || channel > 255) {
      throw new RangeError(`background.${name} must be an integer between 0 and 255.`);
    }
  }
}

export function resolveOutputDimensions(
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  cellAspectRatio: number,
  requestedHeight?: number,
): OutputDimensions {
  assertPositiveSourceDimension('sourceWidth', sourceWidth);
  assertPositiveSourceDimension('sourceHeight', sourceHeight);
  assertOutputWidth('outputWidth', outputWidth);
  assertCellAspectRatio(cellAspectRatio);

  const height =
    requestedHeight === undefined
      ? Math.max(1, Math.round((sourceHeight / sourceWidth) * outputWidth * cellAspectRatio))
      : requestedHeight;
  if (
    requestedHeight === undefined &&
    (!Number.isInteger(height) || height < 1 || height > MAX_OUTPUT_HEIGHT)
  ) {
    throw new RangeError(
      `Calculated output height ${height} exceeds the ${MAX_OUTPUT_HEIGHT}-row limit. In the CLI, pass --height; in the browser, choose a less extreme source or crop.`,
    );
  }
  assertOutputHeight(height);

  return { width: outputWidth, height };
}

export function validateAsciiOptions(options: AsciiOptions): void {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new TypeError('options must be an object.');
  }

  assertFinite('width', options.width);
  assertFinite('contrast', options.contrast);
  assertFinite('brightness', options.brightness);
  assertFinite('gamma', options.gamma);
  assertFinite('detail', options.detail);
  assertFinite('edgeThreshold', options.edgeThreshold);
  assertFinite('lowPercentile', options.lowPercentile);
  assertFinite('highPercentile', options.highPercentile);
  assertOutputWidth('width', options.width);
  assertCellAspectRatio(options.cellAspectRatio);

  if (options.gamma < MIN_GAMMA || options.gamma > MAX_GAMMA) {
    throw new RangeError(`gamma must be between ${MIN_GAMMA} and ${MAX_GAMMA}.`);
  }
  if (options.contrast < 0) {
    throw new RangeError('contrast must not be negative.');
  }
  if (options.brightness < -1 || options.brightness > 1) {
    throw new RangeError('brightness must be between -1 and 1.');
  }
  if (options.detail < 0) {
    throw new RangeError('detail must not be negative.');
  }
  if (options.edgeThreshold < 0 || options.edgeThreshold > 1) {
    throw new RangeError('edgeThreshold must be between 0 and 1.');
  }
  if (
    options.lowPercentile < 0 ||
    options.highPercentile > 1 ||
    options.lowPercentile > options.highPercentile
  ) {
    throw new RangeError(
      'Percentiles must be between 0 and 1 with lowPercentile no greater than highPercentile.',
    );
  }

  for (const name of ['invert', 'autoLevels', 'edgeGlyphs', 'trimLineEnds'] as const) {
    assertBoolean(name, options[name]);
  }

  if (!DITHER_MODES.includes(options.dither as DitherMode)) {
    throw new RangeError(`dither must be one of: ${DITHER_MODES.join(', ')}.`);
  }

  if (!RENDER_MODES.includes(options.renderMode as RenderMode)) {
    throw new RangeError(`renderMode must be one of: ${RENDER_MODES.join(', ')}.`);
  }
  if (!EDGE_STYLES.includes(options.edgeStyle as EdgeStyle)) {
    throw new RangeError(`edgeStyle must be one of: ${EDGE_STYLES.join(', ')}.`);
  }
  if (options.renderMode !== 'tone' && options.edgeGlyphs) {
    const mode = options.renderMode === 'braille' ? 'Braille' : 'Shape';
    throw new RangeError(`${mode} render mode cannot be combined with edge glyphs.`);
  }

  if (typeof options.ramp !== 'string') {
    throw new TypeError('ramp must be a string.');
  }
  const rampLength = Array.from(options.ramp).length;
  if (rampLength < 2) {
    throw new RangeError('ramp must contain at least two characters.');
  }
  if (rampLength > MAX_RAMP_LENGTH) {
    throw new RangeError(`ramp must contain at most ${MAX_RAMP_LENGTH} characters.`);
  }
  for (const character of options.ramp) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      throw new RangeError('ramp cannot contain unpaired UTF-16 surrogates.');
    }
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      throw new RangeError('ramp cannot contain control characters.');
    }
  }

  validateBackground(options.background);
}
