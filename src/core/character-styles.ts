import { RAMPS } from './presets.js';
import type { AsciiOptions } from './types.js';

export type CharacterStyleId =
  | 'readme'
  | 'shape'
  | 'detailed'
  | 'soft'
  | 'minimal'
  | 'calibrated'
  | 'alphanumeric'
  | 'classic'
  | 'jp2a'
  | 'bubbles'
  | 'matrix'
  | 'silhouette'
  | 'blocks'
  | 'blocks-fine'
  | 'bars'
  | 'braille'
  | 'structure';

export interface CharacterStyle {
  readonly id: CharacterStyleId;
  readonly label: string;
  readonly description: string;
  readonly portability: 'strict-ascii' | 'unicode';
  readonly preview: string;
  readonly options: Readonly<
    Pick<AsciiOptions, 'ramp' | 'renderMode' | 'edgeGlyphs' | 'edgeStyle'>
  >;
}

export const CHARACTER_STYLES = [
  {
    id: 'readme',
    label: 'README safe',
    description: 'Strict ASCII · portable punctuation',
    portability: 'strict-ascii',
    preview: RAMPS.readme,
    options: { ramp: RAMPS.readme, renderMode: 'tone', edgeGlyphs: false, edgeStyle: 'ascii' },
  },
  {
    id: 'shape',
    label: 'Shape match',
    description: 'Strict ASCII · glyph shapes traced to image detail',
    portability: 'strict-ascii',
    preview: '/(_)\\',
    options: { ramp: RAMPS.readme, renderMode: 'shape', edgeGlyphs: false, edgeStyle: 'ascii' },
  },
  {
    id: 'detailed',
    label: 'Detailed ASCII',
    description: 'Strict ASCII · smooth tonal transitions',
    portability: 'strict-ascii',
    preview: RAMPS.detailed,
    options: { ramp: RAMPS.detailed, renderMode: 'tone', edgeGlyphs: false, edgeStyle: 'ascii' },
  },
  {
    id: 'soft',
    label: 'Soft ASCII',
    description: 'Strict ASCII · gentle gradients',
    portability: 'strict-ascii',
    preview: RAMPS.soft,
    options: { ramp: RAMPS.soft, renderMode: 'tone', edgeGlyphs: false, edgeStyle: 'ascii' },
  },
  {
    id: 'minimal',
    label: 'Minimal ASCII',
    description: 'Strict ASCII · bold silhouettes',
    portability: 'strict-ascii',
    preview: RAMPS.minimal,
    options: { ramp: RAMPS.minimal, renderMode: 'tone', edgeGlyphs: false, edgeStyle: 'ascii' },
  },
  {
    id: 'calibrated',
    label: 'Calibrated ASCII',
    description: 'Strict ASCII · 14 levels measured stable across fonts',
    portability: 'strict-ascii',
    preview: RAMPS.calibrated,
    options: { ramp: RAMPS.calibrated, renderMode: 'tone', edgeGlyphs: false, edgeStyle: 'ascii' },
  },
  {
    id: 'alphanumeric',
    label: 'Letters only',
    description: 'Strict ASCII · letters, no punctuation noise',
    portability: 'strict-ascii',
    preview: RAMPS.alphanumeric,
    options: {
      ramp: RAMPS.alphanumeric,
      renderMode: 'tone',
      edgeGlyphs: false,
      edgeStyle: 'ascii',
    },
  },
  {
    id: 'classic',
    label: 'Classic 10-level',
    description: 'Strict ASCII · the well-known Paul Bourke ramp',
    portability: 'strict-ascii',
    preview: RAMPS.classic,
    options: { ramp: RAMPS.classic, renderMode: 'tone', edgeGlyphs: false, edgeStyle: 'ascii' },
  },
  {
    id: 'jp2a',
    label: 'jp2a',
    description: 'Strict ASCII · the jp2a terminal converter set',
    portability: 'strict-ascii',
    preview: RAMPS.jp2a,
    options: { ramp: RAMPS.jp2a, renderMode: 'tone', edgeGlyphs: false, edgeStyle: 'ascii' },
  },
  {
    id: 'bubbles',
    label: 'Bubbles',
    description: 'Strict ASCII · round @Oo dots',
    portability: 'strict-ascii',
    preview: RAMPS.bubbles,
    options: { ramp: RAMPS.bubbles, renderMode: 'tone', edgeGlyphs: false, edgeStyle: 'ascii' },
  },
  {
    id: 'matrix',
    label: 'Matrix binary',
    description: 'Strict ASCII · 0 and 1 digits',
    portability: 'strict-ascii',
    preview: RAMPS.matrix,
    options: { ramp: RAMPS.matrix, renderMode: 'tone', edgeGlyphs: false, edgeStyle: 'ascii' },
  },
  {
    id: 'silhouette',
    label: 'Silhouette',
    description: 'Strict ASCII · two-level # stencil for logos',
    portability: 'strict-ascii',
    preview: RAMPS.silhouette,
    options: {
      ramp: RAMPS.silhouette,
      renderMode: 'tone',
      edgeGlyphs: false,
      edgeStyle: 'ascii',
    },
  },
  {
    id: 'blocks',
    label: 'Unicode shades',
    description: 'Unicode · font-dependent block shading',
    portability: 'unicode',
    preview: RAMPS.blocks,
    options: { ramp: RAMPS.blocks, renderMode: 'tone', edgeGlyphs: false, edgeStyle: 'ascii' },
  },
  {
    id: 'blocks-fine',
    label: 'Fine blocks',
    description: 'Unicode · nine fractional block levels',
    portability: 'unicode',
    preview: RAMPS['blocks-fine'],
    options: {
      ramp: RAMPS['blocks-fine'],
      renderMode: 'tone',
      edgeGlyphs: false,
      edgeStyle: 'ascii',
    },
  },
  {
    id: 'bars',
    label: 'Vertical bars',
    description: 'Unicode · nine lower-block levels',
    portability: 'unicode',
    preview: RAMPS.bars,
    options: { ramp: RAMPS.bars, renderMode: 'tone', edgeGlyphs: false, edgeStyle: 'ascii' },
  },
  {
    id: 'braille',
    label: 'Braille subcells',
    description: 'Unicode · compact 2×4 subcells',
    portability: 'unicode',
    preview: '⣿⣷⣤⡀',
    options: { ramp: RAMPS.readme, renderMode: 'braille', edgeGlyphs: false, edgeStyle: 'ascii' },
  },
  {
    id: 'structure',
    label: 'Structural Unicode',
    description: 'Unicode · structure-optimized strokes',
    portability: 'unicode',
    preview: '─│╱╲┌┐└┘┼',
    options: {
      ramp: RAMPS.minimal,
      renderMode: 'tone',
      edgeGlyphs: true,
      edgeStyle: 'unicode',
    },
  },
] as const satisfies readonly CharacterStyle[];

export function getCharacterStyle(id: string): CharacterStyle | undefined {
  return CHARACTER_STYLES.find((style) => style.id === id);
}

export function isCharacterStyleId(value: string): value is CharacterStyleId {
  return getCharacterStyle(value) !== undefined;
}

export function applyCharacterStyle(options: AsciiOptions, id: CharacterStyleId): AsciiOptions {
  const style = getCharacterStyle(id);
  if (!style) throw new Error(`Unknown character style "${id}".`);
  return { ...options, ...style.options, background: { ...options.background } };
}

export function resolveCharacterStyleId(options: AsciiOptions): CharacterStyleId | 'custom' {
  if (options.renderMode !== 'tone') return options.renderMode;
  if (options.edgeGlyphs && options.edgeStyle === 'unicode') return 'structure';
  const toneStyle = CHARACTER_STYLES.find(
    (style) =>
      style.options.renderMode === 'tone' &&
      style.id !== 'structure' &&
      style.options.ramp === options.ramp,
  );
  return toneStyle?.id ?? 'custom';
}
