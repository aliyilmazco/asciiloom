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

export interface MarkdownOptions {
  language?: string;
  collapsible?: boolean;
  open?: boolean;
  summary?: string;
}

export interface SvgOptions {
  title?: string;
  fontSize?: number;
  lineHeight?: number;
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
