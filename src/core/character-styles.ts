import { RAMPS } from './presets.js';
import type { AsciiOptions } from './types.js';

export type CharacterStyleId =
  'readme' | 'detailed' | 'soft' | 'minimal' | 'blocks' | 'blocks-fine' | 'braille' | 'structure';

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
  if (options.renderMode === 'braille') return 'braille';
  if (options.edgeGlyphs && options.edgeStyle === 'unicode') return 'structure';
  const toneStyle = CHARACTER_STYLES.find(
    (style) =>
      style.id !== 'braille' && style.id !== 'structure' && style.options.ramp === options.ramp,
  );
  return toneStyle?.id ?? 'custom';
}
