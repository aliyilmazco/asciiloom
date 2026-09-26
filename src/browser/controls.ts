import {
  CHARACTER_STYLES,
  getCharacterStyle,
  resolveCharacterStyleId,
} from '../core/character-styles.js';
import { DEFAULT_OPTIONS } from '../core/presets.js';
import type { AsciiOptions, DitherMode, RgbColor } from '../core/types.js';
import { createDropdown, type DropdownController, type DropdownOption } from './dropdown.js';

export interface ConversionControlElements {
  widthInput: HTMLInputElement;
  widthValue: HTMLOutputElement;
  aspectInput: HTMLInputElement;
  aspectValue: HTMLOutputElement;
  characterStyleInput: HTMLInputElement;
  ditherInput: HTMLInputElement;
  backgroundInput: HTMLInputElement;
  contrastInput: HTMLInputElement;
  contrastValue: HTMLOutputElement;
  gammaInput: HTMLInputElement;
  gammaValue: HTMLOutputElement;
  detailInput: HTMLInputElement;
  detailValue: HTMLOutputElement;
  brightnessInput: HTMLInputElement;
  brightnessValue: HTMLOutputElement;
  autoLevelsInput: HTMLInputElement;
  invertInput: HTMLInputElement;
  edgeGlyphsInput: HTMLInputElement;
  collapsibleInput: HTMLInputElement;
}

export interface ConversionControls {
  elements: ConversionControlElements;
  renderInputs: readonly HTMLInputElement[];
  read(): AsciiOptions;
  apply(options: AsciiOptions): void;
  updateDisplayedValues(): void;
  dispose(): void;
}

export const CHARACTER_STYLE_ENTRIES: readonly DropdownOption[] = [
  {
    value: 'custom',
    label: 'Custom glyph configuration',
    description: 'Current glyph settings do not match a built-in style',
    selectable: false,
  },
  ...CHARACTER_STYLES.map(({ id, label, description, preview }) => ({
    value: id,
    label,
    description,
    preview,
  })),
];

export const DITHER_ENTRIES = [
  {
    value: 'none',
    label: 'None',
    description: 'Clean tone mapping without diffusion',
  },
  {
    value: 'atkinson',
    label: 'Atkinson',
    description: 'Crisp texture with restrained diffusion',
  },
  {
    value: 'floyd-steinberg',
    label: 'Floyd–Steinberg',
    description: 'Fine-grained error diffusion',
  },
  {
    value: 'bayer',
    label: 'Bayer 4×4',
    description: 'Ordered pattern for graphic texture',
  },
] as const satisfies readonly DropdownOption[];

function element<T extends HTMLElement>(document: Document, id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing required element: #${id}`);
  return found as T;
}

function numberFrom(input: HTMLInputElement): number {
  const value = Number(input.value);
  if (!Number.isFinite(value)) throw new Error(`Invalid number in ${input.id}.`);
  return value;
}

function parseHexColor(value: string): RgbColor {
  const match = /^#([0-9a-f]{6})$/iu.exec(value);
  if (!match) return { ...DEFAULT_OPTIONS.background };
  const hex = match[1]!;
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function colorToHex(color: RgbColor): string {
  return `#${[color.r, color.g, color.b]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

type GlyphOptions = Pick<AsciiOptions, 'ramp' | 'renderMode' | 'edgeGlyphs' | 'edgeStyle'>;

function glyphOptionsFrom(options: AsciiOptions): GlyphOptions {
  return {
    ramp: options.ramp,
    renderMode: options.renderMode,
    edgeGlyphs: options.edgeGlyphs,
    edgeStyle: options.edgeStyle,
  };
}

function updateRangeValue(input: HTMLInputElement, output: HTMLOutputElement, value: string): void {
  output.value = value;
  input.setAttribute('aria-valuetext', value);
}

export function createConversionControls(document: Document): ConversionControls {
  const elements: ConversionControlElements = {
    widthInput: element(document, 'width'),
    widthValue: element(document, 'widthValue'),
    aspectInput: element(document, 'aspect'),
    aspectValue: element(document, 'aspectValue'),
    characterStyleInput: element(document, 'characterStyle'),
    ditherInput: element(document, 'dither'),
    backgroundInput: element(document, 'background'),
    contrastInput: element(document, 'contrast'),
    contrastValue: element(document, 'contrastValue'),
    gammaInput: element(document, 'gamma'),
    gammaValue: element(document, 'gammaValue'),
    detailInput: element(document, 'detail'),
    detailValue: element(document, 'detailValue'),
    brightnessInput: element(document, 'brightness'),
    brightnessValue: element(document, 'brightnessValue'),
    autoLevelsInput: element(document, 'autoLevels'),
    invertInput: element(document, 'invert'),
    edgeGlyphsInput: element(document, 'edgeGlyphs'),
    collapsibleInput: element(document, 'collapsible'),
  };
  const characterStyleDropdown: DropdownController = createDropdown(
    document,
    'characterStyle',
    CHARACTER_STYLE_ENTRIES,
  );
  const ditherDropdown: DropdownController = createDropdown(document, 'dither', DITHER_ENTRIES);

  let retainedOptions = {
    lowPercentile: DEFAULT_OPTIONS.lowPercentile,
    highPercentile: DEFAULT_OPTIONS.highPercentile,
    edgeThreshold: DEFAULT_OPTIONS.edgeThreshold,
    trimLineEnds: DEFAULT_OPTIONS.trimLineEnds,
  };
  let retainedGlyphOptions: GlyphOptions = glyphOptionsFrom(DEFAULT_OPTIONS);

  const onCharacterStyleInput = (): void => {
    const style = getCharacterStyle(elements.characterStyleInput.value);
    if (!style) return;
    retainedGlyphOptions = { ...style.options };
    elements.edgeGlyphsInput.checked = style.options.edgeGlyphs;
    elements.edgeGlyphsInput.disabled = style.options.renderMode !== 'tone';
  };

  const onEdgeGlyphsInput = (): void => {
    if (retainedGlyphOptions.renderMode !== 'tone') {
      elements.edgeGlyphsInput.checked = false;
      return;
    }
    if (retainedGlyphOptions.edgeStyle === 'unicode' && !elements.edgeGlyphsInput.checked) {
      const fallbackId = resolveCharacterStyleId({
        ...DEFAULT_OPTIONS,
        ...retainedGlyphOptions,
        edgeGlyphs: false,
        edgeStyle: 'ascii',
      });
      const fallback = fallbackId === 'custom' ? undefined : getCharacterStyle(fallbackId);
      retainedGlyphOptions = fallback
        ? { ...fallback.options }
        : { ...retainedGlyphOptions, edgeGlyphs: false, edgeStyle: 'ascii' };
      characterStyleDropdown.setValue(fallbackId);
      return;
    }
    retainedGlyphOptions = {
      ...retainedGlyphOptions,
      edgeGlyphs: elements.edgeGlyphsInput.checked,
      edgeStyle: 'ascii',
    };
  };

  elements.characterStyleInput.addEventListener('input', onCharacterStyleInput);
  elements.edgeGlyphsInput.addEventListener('input', onEdgeGlyphsInput);

  const updateDisplayedValues = (): void => {
    updateRangeValue(elements.widthInput, elements.widthValue, elements.widthInput.value);
    updateRangeValue(
      elements.aspectInput,
      elements.aspectValue,
      numberFrom(elements.aspectInput).toFixed(2),
    );
    updateRangeValue(
      elements.contrastInput,
      elements.contrastValue,
      numberFrom(elements.contrastInput).toFixed(2),
    );
    updateRangeValue(
      elements.gammaInput,
      elements.gammaValue,
      numberFrom(elements.gammaInput).toFixed(2),
    );
    updateRangeValue(
      elements.detailInput,
      elements.detailValue,
      numberFrom(elements.detailInput).toFixed(2),
    );
    updateRangeValue(
      elements.brightnessInput,
      elements.brightnessValue,
      numberFrom(elements.brightnessInput).toFixed(2),
    );
  };

  const renderInputs = [
    elements.widthInput,
    elements.aspectInput,
    elements.characterStyleInput,
    elements.ditherInput,
    elements.backgroundInput,
    elements.contrastInput,
    elements.gammaInput,
    elements.detailInput,
    elements.brightnessInput,
    elements.autoLevelsInput,
    elements.invertInput,
    elements.edgeGlyphsInput,
    elements.collapsibleInput,
  ] as const;

  return {
    elements,
    renderInputs,

    read(): AsciiOptions {
      return {
        ...DEFAULT_OPTIONS,
        ...retainedOptions,
        ...retainedGlyphOptions,
        width: Math.round(numberFrom(elements.widthInput)),
        cellAspectRatio: numberFrom(elements.aspectInput),
        contrast: numberFrom(elements.contrastInput),
        gamma: numberFrom(elements.gammaInput),
        detail: numberFrom(elements.detailInput),
        brightness: numberFrom(elements.brightnessInput),
        dither: elements.ditherInput.value as DitherMode,
        autoLevels: elements.autoLevelsInput.checked,
        invert: elements.invertInput.checked,
        edgeGlyphs:
          retainedGlyphOptions.renderMode !== 'tone' ? false : elements.edgeGlyphsInput.checked,
        background: parseHexColor(elements.backgroundInput.value),
      };
    },

    apply(options: AsciiOptions): void {
      retainedOptions = {
        lowPercentile: options.lowPercentile,
        highPercentile: options.highPercentile,
        edgeThreshold: options.edgeThreshold,
        trimLineEnds: options.trimLineEnds,
      };
      retainedGlyphOptions = glyphOptionsFrom(options);
      elements.widthInput.value = String(options.width);
      elements.aspectInput.value = String(options.cellAspectRatio);
      characterStyleDropdown.setValue(resolveCharacterStyleId(options));
      ditherDropdown.setValue(options.dither);
      elements.contrastInput.value = String(options.contrast);
      elements.gammaInput.value = String(options.gamma);
      elements.detailInput.value = String(options.detail);
      elements.brightnessInput.value = String(options.brightness);
      elements.autoLevelsInput.checked = options.autoLevels;
      elements.invertInput.checked = options.invert;
      elements.edgeGlyphsInput.checked = options.edgeGlyphs;
      elements.edgeGlyphsInput.disabled = options.renderMode !== 'tone';
      elements.backgroundInput.value = colorToHex(options.background);
      updateDisplayedValues();
    },

    updateDisplayedValues,

    dispose(): void {
      elements.characterStyleInput.removeEventListener('input', onCharacterStyleInput);
      elements.edgeGlyphsInput.removeEventListener('input', onEdgeGlyphsInput);
      characterStyleDropdown.destroy();
      ditherDropdown.destroy();
    },
  };
}
