import type {
  AsciiOptions,
  ConversionResult,
  DitherMode,
  GlyphQuantizer,
  RgbColor,
  RgbaImage,
} from './types.js';
import { blockGlyphInk, createFillQuantizer, fillEdge } from './blocks.js';
import { renderBrailleCells } from './braille.js';
import { ASCII_GLYPH_INK, createShapeQuantizer, SHAPE_GLYPHS } from './shape.js';
import { renderStructuralCharacters, type EdgeField } from './structure.js';
import { resolveOutputDimensions, subcellGrid, validateAsciiOptions } from './validation.js';

const EPSILON = 1e-9;
const EDGE_MIDTONE_MIN = 0.06;
const EDGE_MIDTONE_MAX = 0.94;
const STRONG_EDGE_MAGNITUDE = 0.5;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function validateImage(image: RgbaImage): 3 | 4 {
  if (!Number.isInteger(image.width) || image.width < 1) {
    throw new RangeError('image.width must be a positive integer.');
  }
  if (!Number.isInteger(image.height) || image.height < 1) {
    throw new RangeError('image.height must be a positive integer.');
  }

  const pixelCount = image.width * image.height;
  const inferredChannels = image.data.length / pixelCount;
  const channels = image.channels ?? inferredChannels;
  if ((channels !== 3 && channels !== 4) || image.data.length !== pixelCount * channels) {
    throw new RangeError('RGBA image data length does not match width, height, and channel count.');
  }
  return channels;
}

function srgbChannelToLinear(value: number): number {
  const normalized = clamp(value / 255);
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

// CIE L* / 100. Glyph ramps step evenly in perceived lightness, so linear luminance (where
// mid-grey is ~0.21) must be mapped before quantizing or midtones collapse onto dark glyphs.
function perceptualLightness(luminance: number): number {
  const y = clamp(luminance);
  return y > 216 / 24_389 ? 1.16 * Math.cbrt(y) - 0.16 : (y * 24_389) / 2700;
}

export function calculateOutputHeight(
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  cellAspectRatio = 0.5,
): number {
  return resolveOutputDimensions(sourceWidth, sourceHeight, outputWidth, cellAspectRatio).height;
}

function compositeChannel(foreground: number, background: number, alpha: number): number {
  return foreground * alpha + background * (1 - alpha);
}

function pixelLuminance(
  data: Uint8Array | Uint8ClampedArray,
  offset: number,
  channels: 3 | 4,
  background: RgbColor,
): number {
  const alpha = channels === 4 ? (data[offset + 3] ?? 255) / 255 : 1;
  const r = compositeChannel(data[offset] ?? 0, background.r, alpha);
  const g = compositeChannel(data[offset + 1] ?? 0, background.g, alpha);
  const b = compositeChannel(data[offset + 2] ?? 0, background.b, alpha);
  return relativeLuminance(r, g, b);
}

function downsampleToCells(
  image: RgbaImage,
  channels: 3 | 4,
  outputWidth: number,
  outputHeight: number,
  background: RgbColor,
): Float64Array {
  const result = new Float64Array(outputWidth * outputHeight);

  for (let cellY = 0; cellY < outputHeight; cellY += 1) {
    const sourceY0 = Math.floor((cellY * image.height) / outputHeight);
    const sourceY1 = Math.max(
      sourceY0 + 1,
      Math.floor(((cellY + 1) * image.height) / outputHeight),
    );

    for (let cellX = 0; cellX < outputWidth; cellX += 1) {
      const sourceX0 = Math.floor((cellX * image.width) / outputWidth);
      const sourceX1 = Math.max(
        sourceX0 + 1,
        Math.floor(((cellX + 1) * image.width) / outputWidth),
      );
      let sum = 0;
      let samples = 0;

      for (let sourceY = sourceY0; sourceY < Math.min(sourceY1, image.height); sourceY += 1) {
        for (let sourceX = sourceX0; sourceX < Math.min(sourceX1, image.width); sourceX += 1) {
          const offset = (sourceY * image.width + sourceX) * channels;
          sum += pixelLuminance(image.data, offset, channels, background);
          samples += 1;
        }
      }

      result[cellY * outputWidth + cellX] = samples > 0 ? perceptualLightness(sum / samples) : 0;
    }
  }

  return result;
}

function percentile(sortedValues: readonly number[], fraction: number): number {
  if (sortedValues.length === 0) return 0;
  const position = clamp(fraction) * (sortedValues.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sortedValues[lower] ?? 0;
  const upperValue = sortedValues[upper] ?? lowerValue;
  const weight = position - lower;
  return lowerValue * (1 - weight) + upperValue * weight;
}

function applyAutoLevels(
  values: Float64Array,
  lowPercentile: number,
  highPercentile: number,
): Float64Array {
  // oxlint-disable-next-line unicorn/no-array-sort -- Array.from creates the private scratch array we intentionally sort in place.
  const sortedValues = Array.from(values).sort((a, b) => a - b);
  const low = percentile(sortedValues, lowPercentile);
  const high = percentile(sortedValues, highPercentile);
  if (high - low < EPSILON) return new Float64Array(values);

  const output = new Float64Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    output[index] = clamp(((values[index] ?? 0) - low) / (high - low));
  }
  return output;
}

function getCell(
  values: Float64Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const boundedX = Math.min(width - 1, Math.max(0, x));
  const boundedY = Math.min(height - 1, Math.max(0, y));
  return values[boundedY * width + boundedX] ?? 0;
}

function gaussianBlur3x3(values: Float64Array, width: number, height: number): Float64Array {
  const output = new Float64Array(values.length);
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1] as const;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let kernelIndex = 0;
      for (let kernelY = -1; kernelY <= 1; kernelY += 1) {
        for (let kernelX = -1; kernelX <= 1; kernelX += 1) {
          sum +=
            getCell(values, width, height, x + kernelX, y + kernelY) * (kernel[kernelIndex] ?? 0);
          kernelIndex += 1;
        }
      }
      output[y * width + x] = sum / 16;
    }
  }
  return output;
}

function sobelEdges(values: Float64Array, width: number, height: number): EdgeField {
  const magnitude = new Float64Array(values.length);
  const angle = new Float64Array(values.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = getCell(values, width, height, x - 1, y - 1);
      const b = getCell(values, width, height, x, y - 1);
      const c = getCell(values, width, height, x + 1, y - 1);
      const d = getCell(values, width, height, x - 1, y);
      const f = getCell(values, width, height, x + 1, y);
      const g = getCell(values, width, height, x - 1, y + 1);
      const h = getCell(values, width, height, x, y + 1);
      const i = getCell(values, width, height, x + 1, y + 1);

      const gx = -a + c - 2 * d + 2 * f - g + i;
      const gy = -a - 2 * b - c + g + 2 * h + i;
      const index = y * width + x;
      magnitude[index] = Math.min(1, Math.hypot(gx, gy) / 4);
      angle[index] = Math.atan2(gy, gx);
    }
  }

  return { magnitude, angle };
}

function applyToneAndDetail(
  source: Float64Array,
  width: number,
  height: number,
  options: AsciiOptions,
): Float64Array {
  const leveled = options.autoLevels
    ? applyAutoLevels(source, options.lowPercentile, options.highPercentile)
    : new Float64Array(source);
  const blurred = options.detail === 0 ? null : gaussianBlur3x3(leveled, width, height);
  const output = new Float64Array(leveled.length);

  for (let index = 0; index < leveled.length; index += 1) {
    const base = leveled[index] ?? 0;
    const highFrequency = blurred === null ? 0 : base - (blurred[index] ?? base);
    let value = base + highFrequency * options.detail;
    value = (value - 0.5) * options.contrast + 0.5 + options.brightness;
    value = Math.pow(clamp(value), 1 / options.gamma);
    if (options.invert) value = 1 - value;
    output[index] = clamp(value);
  }

  return output;
}

function levelQuantizer(lightness: Float64Array): GlyphQuantizer {
  // oxlint-disable-next-line unicorn/no-array-sort -- Uint32Array.from creates the private scratch array we intentionally sort in place.
  const order = Uint32Array.from(lightness.keys()).sort(
    (a, b) => (lightness[a] ?? 0) - (lightness[b] ?? 0),
  );
  const sorted = Float64Array.from(order, (index) => lightness[index] ?? 0);
  const last = sorted.length - 1;
  return {
    lightness,
    pick(value, _cell, bias) {
      if (value <= (sorted[0] ?? 0)) return order[0] ?? 0;
      if (value >= (sorted[last] ?? 1)) return order[last] ?? 0;
      let darker = 0;
      let lighter = last;
      while (lighter - darker > 1) {
        const middle = (darker + lighter) >> 1;
        if ((sorted[middle] ?? 0) <= value) darker = middle;
        else lighter = middle;
      }
      const low = sorted[darker] ?? 0;
      const span = (sorted[lighter] ?? 1) - low;
      const position = span < EPSILON ? 0 : (value - low) / span;
      return (position + bias >= 0.5 ? order[lighter] : order[darker]) ?? 0;
    },
  };
}

// Each glyph renders the lightness its measured ink implies, rescaled so the ramp's inkiest glyph
// is black and its emptiest is white. Ramps are not evenly spaced in ink (and community ramps are
// not even monotonic), so quantizing by ramp position would distort the image's tones.
function rampLightness(characters: readonly string[]): Float64Array {
  const ink = Float64Array.from(
    characters,
    (character) => ASCII_GLYPH_INK[character] ?? blockGlyphInk(character) ?? Number.NaN,
  );
  let darkest = -Infinity;
  let lightest = Infinity;
  for (const value of ink) {
    darkest = Math.max(darkest, value);
    lightest = Math.min(lightest, value);
  }
  if (Number.isNaN(darkest) || darkest - lightest < EPSILON) {
    return Float64Array.from(characters, (_, index) => index / (characters.length - 1));
  }
  return ink.map((value) => (darkest - value) / (darkest - lightest));
}

function addError(
  values: Float64Array,
  width: number,
  height: number,
  x: number,
  y: number,
  error: number,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const index = y * width + x;
  values[index] = clamp((values[index] ?? 0) + error);
}

function errorDiffuse(
  source: Float64Array,
  width: number,
  height: number,
  quantizer: GlyphQuantizer,
  mode: Extract<DitherMode, 'floyd-steinberg' | 'atkinson'>,
): Uint16Array {
  const work = new Float64Array(source);
  const indices = new Uint16Array(source.length);

  for (let y = 0; y < height; y += 1) {
    const reverse = y % 2 === 1;
    const start = reverse ? width - 1 : 0;
    const end = reverse ? -1 : width;
    const step = reverse ? -1 : 1;

    for (let x = start; x !== end; x += step) {
      const index = y * width + x;
      const oldValue = work[index] ?? 0;
      const glyph = quantizer.pick(oldValue, index, 0);
      indices[index] = glyph;
      const error = oldValue - (quantizer.lightness[glyph] ?? 0);
      const direction = reverse ? -1 : 1;

      if (mode === 'floyd-steinberg') {
        addError(work, width, height, x + direction, y, error * (7 / 16));
        addError(work, width, height, x - direction, y + 1, error * (3 / 16));
        addError(work, width, height, x, y + 1, error * (5 / 16));
        addError(work, width, height, x + direction, y + 1, error * (1 / 16));
      } else {
        const share = error / 8;
        addError(work, width, height, x + direction, y, share);
        addError(work, width, height, x + 2 * direction, y, share);
        addError(work, width, height, x - direction, y + 1, share);
        addError(work, width, height, x, y + 1, share);
        addError(work, width, height, x + direction, y + 1, share);
        addError(work, width, height, x, y + 2, share);
      }
    }
  }

  return indices;
}

const BAYER_4X4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

function mapToRampIndices(
  values: Float64Array,
  width: number,
  height: number,
  quantizer: GlyphQuantizer,
  mode: DitherMode,
): Uint16Array {
  if (mode === 'floyd-steinberg' || mode === 'atkinson') {
    return errorDiffuse(values, width, height, quantizer, mode);
  }

  const output = new Uint16Array(values.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const bias =
        mode === 'bayer' ? ((BAYER_4X4[(y % 4) * 4 + (x % 4)] ?? 0) + 0.5) / 16 - 0.5 : 0;
      output[index] = quantizer.pick(values[index] ?? 0, index, bias);
    }
  }
  return output;
}

function edgeCharacter(normalAngle: number): string {
  let tangent = normalAngle + Math.PI / 2;
  while (tangent < 0) tangent += Math.PI;
  while (tangent >= Math.PI) tangent -= Math.PI;

  if (tangent < Math.PI / 8 || tangent >= (7 * Math.PI) / 8) return '-';
  if (tangent < (3 * Math.PI) / 8) return '\\';
  if (tangent < (5 * Math.PI) / 8) return '|';
  return '/';
}

function renderCharacters(
  indices: Uint16Array,
  characters: readonly string[],
  values: Float64Array,
  width: number,
  height: number,
  options: AsciiOptions,
): string {
  const edges = options.edgeGlyphs ? sobelEdges(values, width, height) : null;
  if (edges && options.edgeStyle === 'unicode') {
    return renderStructuralCharacters({
      indices,
      ramp: characters,
      values,
      edges,
      width,
      height,
      threshold: options.edgeThreshold,
      trimLineEnds: options.trimLineEnds,
    });
  }
  const lines: string[] = [];

  for (let y = 0; y < height; y += 1) {
    let line = '';
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      let character = characters[indices[index] ?? 0] ?? ' ';
      const magnitude = edges?.magnitude[index] ?? 0;
      const value = values[index] ?? 0;
      const isMidtone = value > EDGE_MIDTONE_MIN && value < EDGE_MIDTONE_MAX;
      const isStrongEdge = magnitude >= Math.max(options.edgeThreshold, STRONG_EDGE_MAGNITUDE);
      if (edges && magnitude >= options.edgeThreshold && (isMidtone || isStrongEdge)) {
        character = edgeCharacter(edges.angle[index] ?? 0);
      }
      line += character;
    }
    lines.push(options.trimLineEnds ? line.replace(/ +$/u, '') : line);
  }

  return lines.join('\n');
}

function averageSubcells(
  subcells: Float64Array,
  outputWidth: number,
  outputHeight: number,
  scaleX: number,
  scaleY: number,
): Float64Array {
  const subcellWidth = outputWidth * scaleX;
  const output = new Float64Array(outputWidth * outputHeight);
  for (let cellY = 0; cellY < outputHeight; cellY += 1) {
    for (let cellX = 0; cellX < outputWidth; cellX += 1) {
      let sum = 0;
      for (let dotY = 0; dotY < scaleY; dotY += 1) {
        for (let dotX = 0; dotX < scaleX; dotX += 1) {
          sum += subcells[(cellY * scaleY + dotY) * subcellWidth + cellX * scaleX + dotX] ?? 0;
        }
      }
      output[cellY * outputWidth + cellX] = sum / (scaleX * scaleY);
    }
  }
  return output;
}

export function convertRgbaToAscii(
  image: RgbaImage,
  options: AsciiOptions,
  outputHeight?: number,
): ConversionResult {
  validateAsciiOptions(options);
  const channels = validateImage(image);
  const { width, height } = resolveOutputDimensions(
    image.width,
    image.height,
    options.width,
    options.cellAspectRatio,
    outputHeight,
  );
  const [scaleX, scaleY] = subcellGrid(options);
  const fieldWidth = width * scaleX;
  const fieldHeight = height * scaleY;
  const field = applyToneAndDetail(
    downsampleToCells(image, channels, fieldWidth, fieldHeight, options.background),
    fieldWidth,
    fieldHeight,
    options,
  );
  const values =
    scaleX * scaleY === 1 ? field : averageSubcells(field, width, height, scaleX, scaleY);

  if (options.renderMode === 'braille') {
    const dots = levelQuantizer(Float64Array.of(0, 1));
    const art = renderBrailleCells(
      mapToRampIndices(field, fieldWidth, fieldHeight, dots, options.dither),
      width,
      height,
      options.trimLineEnds,
    );
    return { art, width, height, values };
  }

  let characters: readonly string[];
  let quantizer: GlyphQuantizer;
  if (options.renderMode === 'shape') {
    characters = SHAPE_GLYPHS;
    quantizer = createShapeQuantizer(field, width);
  } else {
    characters = Array.from(options.ramp);
    const edge = fillEdge(characters);
    quantizer =
      edge === undefined
        ? levelQuantizer(rampLightness(characters))
        : createFillQuantizer(characters, edge, field, width);
  }
  const art = renderCharacters(
    mapToRampIndices(values, width, height, quantizer, options.dither),
    characters,
    values,
    width,
    height,
    options,
  );
  return { art, width, height, values };
}
