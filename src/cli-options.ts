import { parseArgs } from 'node:util';
import {
  CHARACTER_STYLES,
  applyCharacterStyle,
  isCharacterStyleId,
} from './core/character-styles.js';
import { PRESETS, RAMPS, optionsForPreset } from './core/presets.js';
import type { AsciiOptions, DitherMode, RgbColor } from './core/types.js';
import { validateAsciiOptions } from './core/validation.js';

export type CliFormat = 'text' | 'markdown' | 'svg' | 'all';

export interface HelpCommand {
  help: true;
}

export interface CliCommand {
  help: false;
  input: string;
  options: AsciiOptions;
  oversample: number;
  height?: number;
  format: CliFormat;
  outputPath?: string;
  collapsible: boolean;
  title?: string;
}

function numeric(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number.`);
  return parsed;
}

function integer(name: string, value: string | undefined, fallback: number): number {
  const parsed = numeric(name, value, fallback);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer.`);
  return parsed;
}

function inRange(name: string, value: number, min: number, max: number): number {
  if (value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}.`);
  return value;
}

function positive(name: string, value: number, max: number): number {
  if (value <= 0 || value > max)
    throw new Error(`${name} must be greater than 0 and at most ${max}.`);
  return value;
}

function atLeast(name: string, value: number, min: number): number {
  if (value < min) throw new Error(`${name} must be at least ${min}.`);
  return value;
}

function parseHexColor(value: string | undefined, fallback: RgbColor): RgbColor {
  if (value === undefined) return { ...fallback };
  const match = /^#?([0-9a-f]{6})$/iu.exec(value);
  if (!match) throw new Error('background must be a six-digit hex color such as #ffffff.');
  const hex = match[1]!;
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function parseDither(value: string | undefined, fallback: DitherMode): DitherMode {
  if (value === undefined) return fallback;
  const allowed: DitherMode[] = ['none', 'floyd-steinberg', 'atkinson', 'bayer'];
  if (!allowed.includes(value as DitherMode))
    throw new Error(`dither must be one of: ${allowed.join(', ')}.`);
  return value as DitherMode;
}

function parseFormat(value: string | undefined): CliFormat {
  const aliases = new Map<string, CliFormat>([
    ['text', 'text'],
    ['txt', 'text'],
    ['markdown', 'markdown'],
    ['md', 'markdown'],
    ['svg', 'svg'],
    ['all', 'all'],
  ]);
  const result = aliases.get(value ?? 'markdown');
  if (!result) throw new Error('format must be text, markdown, svg, or all.');
  return result;
}

function parseRamp(value: string | undefined, fallback: string): string {
  if (value === undefined) return fallback;
  return Object.hasOwn(RAMPS, value) ? RAMPS[value as keyof typeof RAMPS] : value;
}

const NUMERIC_OPTIONS = new Set([
  '--width',
  '-w',
  '--height',
  '--aspect',
  '--contrast',
  '--brightness',
  '--gamma',
  '--detail',
  '--edge-threshold',
  '--oversample',
]);

function normalizeNegativeOptionValues(args: string[]): string[] {
  const normalized: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === '--') {
      normalized.push(...args.slice(index));
      break;
    }
    const next = args[index + 1];
    if (
      NUMERIC_OPTIONS.has(argument) &&
      next !== undefined &&
      /^-(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(next)
    ) {
      normalized.push(`${argument}=${next}`);
      index += 1;
    } else {
      normalized.push(argument);
    }
  }
  return normalized;
}

export function parseCliCommand(args: string[]): CliCommand | HelpCommand {
  const parsed = parseArgs({
    args: normalizeNegativeOptionValues(args),
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      preset: { type: 'string', short: 'p' },
      style: { type: 'string' },
      width: { type: 'string', short: 'w' },
      height: { type: 'string' },
      aspect: { type: 'string' },
      ramp: { type: 'string' },
      dither: { type: 'string' },
      contrast: { type: 'string' },
      brightness: { type: 'string' },
      gamma: { type: 'string' },
      detail: { type: 'string' },
      background: { type: 'string' },
      invert: { type: 'boolean' },
      'edge-glyphs': { type: 'boolean' },
      'edge-threshold': { type: 'string' },
      'no-auto-levels': { type: 'boolean' },
      'keep-trailing-spaces': { type: 'boolean' },
      oversample: { type: 'string' },
      format: { type: 'string', short: 'f' },
      output: { type: 'string', short: 'o' },
      collapsible: { type: 'boolean' },
      title: { type: 'string' },
    },
  });

  if (parsed.values.help) return { help: true };
  if (parsed.positionals.length !== 1) throw new Error('Exactly one input image path is required.');

  const presetId = parsed.values.preset ?? 'readme';
  if (!PRESETS.some((preset) => preset.id === presetId)) {
    throw new Error(
      `Unknown preset "${presetId}". Available presets: ${PRESETS.map((preset) => preset.id).join(', ')}.`,
    );
  }

  const presetOptions = optionsForPreset(presetId);
  const styleId = parsed.values.style;
  if (styleId !== undefined && !isCharacterStyleId(styleId)) {
    throw new Error(
      `Unknown style "${styleId}". Available styles: ${CHARACTER_STYLES.map(({ id }) => id).join(', ')}.`,
    );
  }
  if (styleId === 'braille' && parsed.values.ramp !== undefined) {
    throw new Error('--style braille cannot be combined with --ramp.');
  }
  if (styleId === 'braille' && parsed.values['edge-glyphs']) {
    throw new Error('--style braille cannot be combined with --edge-glyphs.');
  }
  const baseOptions =
    styleId === undefined ? presetOptions : applyCharacterStyle(presetOptions, styleId);
  const format = parseFormat(parsed.values.format);
  const outputPath = parsed.values.output;
  if (outputPath !== undefined && outputPath.trim().length === 0) {
    throw new Error('--output must not be empty.');
  }
  if (format === 'all' && !outputPath)
    throw new Error('--output is required when --format all is used.');

  const options: AsciiOptions = {
    ...baseOptions,
    width: inRange('width', integer('width', parsed.values.width, baseOptions.width), 2, 400),
    cellAspectRatio: positive(
      'aspect',
      numeric('aspect', parsed.values.aspect, baseOptions.cellAspectRatio),
      2,
    ),
    ramp: parseRamp(parsed.values.ramp, baseOptions.ramp),
    dither: parseDither(parsed.values.dither, baseOptions.dither),
    contrast: atLeast(
      'contrast',
      numeric('contrast', parsed.values.contrast, baseOptions.contrast),
      0,
    ),
    brightness: inRange(
      'brightness',
      numeric('brightness', parsed.values.brightness, baseOptions.brightness),
      -1,
      1,
    ),
    gamma: positive(
      'gamma',
      numeric('gamma', parsed.values.gamma, baseOptions.gamma),
      Number.POSITIVE_INFINITY,
    ),
    detail: atLeast('detail', numeric('detail', parsed.values.detail, baseOptions.detail), 0),
    background: parseHexColor(parsed.values.background, baseOptions.background),
    invert: parsed.values.invert ?? baseOptions.invert,
    edgeGlyphs: parsed.values['edge-glyphs'] ?? baseOptions.edgeGlyphs,
    edgeThreshold: inRange(
      'edge-threshold',
      numeric('edge-threshold', parsed.values['edge-threshold'], baseOptions.edgeThreshold),
      0,
      1,
    ),
    autoLevels: parsed.values['no-auto-levels'] ? false : baseOptions.autoLevels,
    trimLineEnds: parsed.values['keep-trailing-spaces'] ? false : baseOptions.trimLineEnds,
  };
  validateAsciiOptions(options);

  return {
    help: false,
    input: parsed.positionals[0]!,
    options,
    oversample: inRange('oversample', integer('oversample', parsed.values.oversample, 3), 1, 5),
    height:
      parsed.values.height === undefined
        ? undefined
        : inRange('height', integer('height', parsed.values.height, 1), 1, 400),
    format,
    outputPath,
    collapsible: parsed.values.collapsible ?? false,
    title: parsed.values.title,
  };
}
