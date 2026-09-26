import type { AsciiOptions, Preset } from './types.js';

// Ramps run darkest → lightest. Short ramps are ordered so no adjacent pair is inverted in
// measured glyph ink coverage for Menlo, SF Mono, and Courier New.
export const RAMPS = {
  readme: '@#%*=+:-. ',
  detailed: '@$B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+<>i!lI;:,"^\'. ',
  soft: 'MWN$@#%*=+:-,. ',
  minimal: '#*=+:-. ',
  blocks: '█▓▒░ ',
  'blocks-fine': '█▉▊▋▌▍▎▏ ',
} as const;

export const DEFAULT_OPTIONS: AsciiOptions = {
  width: 88,
  cellAspectRatio: 0.5,
  ramp: RAMPS.readme,
  renderMode: 'tone',
  invert: false,
  autoLevels: true,
  lowPercentile: 0.01,
  highPercentile: 0.99,
  contrast: 1.08,
  brightness: 0,
  gamma: 1,
  detail: 0.55,
  dither: 'atkinson',
  edgeGlyphs: false,
  edgeStyle: 'ascii',
  edgeThreshold: 0.2,
  background: { r: 255, g: 255, b: 255 },
  trimLineEnds: true,
};

export const PRESETS = [
  {
    id: 'readme',
    label: 'README balanced',
    description: 'Reliable pure ASCII, moderate detail, and a width that fits most README layouts.',
    options: {
      width: 88,
      ramp: RAMPS.readme,
      contrast: 1.08,
      gamma: 1,
      detail: 0.55,
      dither: 'atkinson',
      edgeGlyphs: false,
    },
  },
  {
    id: 'portrait',
    label: 'Portrait',
    description: 'Long density ramp and stronger local detail for faces and textured photos.',
    options: {
      width: 96,
      ramp: RAMPS.detailed,
      contrast: 1.12,
      gamma: 1.04,
      detail: 0.8,
      dither: 'atkinson',
      edgeGlyphs: false,
    },
  },
  {
    id: 'logo',
    label: 'Logo / line art',
    description: 'Short ramp and structural edge glyphs for icons, logos, and drawings.',
    options: {
      width: 76,
      ramp: RAMPS.minimal,
      contrast: 1.3,
      gamma: 0.95,
      detail: 1.05,
      dither: 'none',
      edgeGlyphs: true,
      edgeThreshold: 0.17,
    },
  },
  {
    id: 'ultra',
    label: 'Ultra detail',
    description: 'Wider output for desktop READMEs and downloadable SVG previews.',
    options: {
      width: 120,
      ramp: RAMPS.detailed,
      contrast: 1.1,
      gamma: 1,
      detail: 0.9,
      dither: 'floyd-steinberg',
      edgeGlyphs: false,
    },
  },
  {
    id: 'unicode',
    label: 'Unicode blocks',
    description:
      'Compact high-contrast output; not strict ASCII but renders well in GitHub code blocks.',
    options: {
      width: 92,
      ramp: RAMPS.blocks,
      contrast: 1.08,
      detail: 0.45,
      dither: 'atkinson',
      edgeGlyphs: false,
    },
  },
] as const satisfies readonly Preset[];

export function getPreset(id: string): (typeof PRESETS)[number] | undefined {
  return PRESETS.find((preset) => preset.id === id);
}

export function optionsForPreset(id: string): AsciiOptions {
  const preset = getPreset(id);
  if (!preset) {
    throw new Error(`Unknown preset "${id}".`);
  }
  const presetOptions: Partial<AsciiOptions> = { ...preset.options };
  return {
    ...DEFAULT_OPTIONS,
    ...presetOptions,
    background: { ...DEFAULT_OPTIONS.background, ...presetOptions.background },
  };
}
