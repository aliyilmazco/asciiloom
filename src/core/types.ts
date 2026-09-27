export type DitherMode = 'none' | 'floyd-steinberg' | 'atkinson' | 'bayer';
export type OutputFormat = 'text' | 'markdown' | 'svg';
export type RenderMode = 'tone' | 'braille' | 'shape';
export type EdgeStyle = 'ascii' | 'unicode';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface RgbaImage {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  channels?: 3 | 4;
}

export interface AsciiOptions {
  width: number;
  cellAspectRatio: number;
  ramp: string;
  renderMode: RenderMode;
  invert: boolean;
  autoLevels: boolean;
  lowPercentile: number;
  highPercentile: number;
  contrast: number;
  brightness: number;
  gamma: number;
  detail: number;
  dither: DitherMode;
  edgeGlyphs: boolean;
  edgeStyle: EdgeStyle;
  edgeThreshold: number;
  background: RgbColor;
  trimLineEnds: boolean;
}

export interface ConversionResult {
  art: string;
  width: number;
  height: number;
  values: Float64Array;
}

/** Maps a cell's dithered lightness to a ramp glyph. */
export interface GlyphQuantizer {
  /** Lightness (0 dark … 1 light) each ramp glyph renders. */
  readonly lightness: Float64Array;
  /** Ramp index for cell `cell` at lightness `value`; `bias` is an ordered-dither offset in glyph steps. */
  pick(value: number, cell: number, bias: number): number;
}

export interface MarkdownOptions {
  language?: string;
  collapsible?: boolean;
  open?: boolean;
  summary?: string;
}

export interface SvgOptions {
  title?: string;
  fontSize?: number;
  /** Character cell width ÷ height the art was converted for; sets the row spacing. */
  cellAspectRatio?: number;
  foreground?: string;
  background?: string | null;
  padding?: number;
}

export interface Preset {
  id: string;
  label: string;
  description: string;
  options: Partial<AsciiOptions>;
}
