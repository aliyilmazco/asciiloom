import type { AsciiOptions, DitherMode, RgbColor } from '../core/types.js';
import { RAMPS } from '../core/presets.js';

export const CUSTOM_PRESET_STORAGE_KEY = 'readme-ascii-studio.custom-presets.v1';
export const CUSTOM_PRESET_SCHEMA_VERSION = 2;
export const MAX_CUSTOM_PRESETS = 100;
export const MAX_PRESET_IMPORT_BYTES = 1_048_576;

const MAX_PRESET_NAME_LENGTH = 80;

const OPTION_KEYS_V1 = [
  'width',
  'cellAspectRatio',
  'ramp',
  'invert',
  'autoLevels',
  'lowPercentile',
  'highPercentile',
  'contrast',
  'brightness',
  'gamma',
  'detail',
  'dither',
  'edgeGlyphs',
  'edgeThreshold',
  'background',
  'trimLineEnds',
] as const;
const OPTION_KEYS_V2 = [...OPTION_KEYS_V1, 'renderMode', 'edgeStyle'] as const;

const DITHER_MODES = new Set<DitherMode>(['none', 'floyd-steinberg', 'atkinson', 'bayer']);
const SUPPORTED_RAMPS = new Set<string>(Object.values(RAMPS));

export interface PresetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CustomPresetSettings {
  options: AsciiOptions;
  collapsible: boolean;
}

export interface CustomPreset {
  schemaVersion: typeof CUSTOM_PRESET_SCHEMA_VERSION;
  name: string;
  settings: CustomPresetSettings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function presetError(message: string): never {
  throw new Error(`Invalid preset: ${message}`);
}

function readName(value: unknown): string {
  if (typeof value !== 'string') presetError('name must be a string.');
  const name = value.trim();
  if (name.length === 0) presetError('name is required.');
  if (name.length > MAX_PRESET_NAME_LENGTH)
    presetError(`name must be ${MAX_PRESET_NAME_LENGTH} characters or fewer.`);
  return name;
}

function readNumber(
  value: unknown,
  label: string,
  min: number,
  max: number,
  integer = false,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    presetError(`${label} must be between ${min} and ${max}.`);
  }
  if (integer && !Number.isInteger(value)) presetError(`${label} must be an integer.`);
  return value;
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') presetError(`${label} must be a boolean.`);
  return value;
}

function readBackground(value: unknown): RgbColor {
  if (!isRecord(value) || !hasExactKeys(value, ['r', 'g', 'b']))
    presetError('background must contain r, g, and b.');
  return {
    r: readNumber(value.r, 'background.r', 0, 255, true),
    g: readNumber(value.g, 'background.g', 0, 255, true),
    b: readNumber(value.b, 'background.b', 0, 255, true),
  };
}

type LegacyAsciiOptions = Omit<AsciiOptions, 'renderMode' | 'edgeStyle'>;

function readSupportedRamp(value: unknown): string {
  if (typeof value !== 'string' || Array.from(value).length < 2) {
    presetError('ramp must contain at least two characters.');
  }
  if (!SUPPORTED_RAMPS.has(value)) {
    presetError('ramp is not supported by the browser interface.');
  }
  return value;
}

function readDither(value: unknown): DitherMode {
  if (typeof value !== 'string' || !DITHER_MODES.has(value as DitherMode)) {
    presetError('dither is not supported.');
  }
  return value as DitherMode;
}

function readLegacyOptions(value: Record<string, unknown>): LegacyAsciiOptions {
  const lowPercentile = readNumber(value.lowPercentile, 'lowPercentile', 0, 1);
  const highPercentile = readNumber(value.highPercentile, 'highPercentile', 0, 1);
  if (lowPercentile >= highPercentile) {
    presetError('lowPercentile must be lower than highPercentile.');
  }

  return {
    width: readNumber(value.width, 'width', 24, 180, true),
    cellAspectRatio: readNumber(value.cellAspectRatio, 'cellAspectRatio', 0.32, 0.78),
    ramp: readSupportedRamp(value.ramp),
    invert: readBoolean(value.invert, 'invert'),
    autoLevels: readBoolean(value.autoLevels, 'autoLevels'),
    lowPercentile,
    highPercentile,
    contrast: readNumber(value.contrast, 'contrast', 0.5, 2),
    brightness: readNumber(value.brightness, 'brightness', -0.45, 0.45),
    gamma: readNumber(value.gamma, 'gamma', 0.45, 2.2),
    detail: readNumber(value.detail, 'detail', 0, 2),
    dither: readDither(value.dither),
    edgeGlyphs: readBoolean(value.edgeGlyphs, 'edgeGlyphs'),
    edgeThreshold: readNumber(value.edgeThreshold, 'edgeThreshold', 0, 1),
    background: readBackground(value.background),
    trimLineEnds: readBoolean(value.trimLineEnds, 'trimLineEnds'),
  };
}

function readOptions(value: unknown, schemaVersion: 1 | 2): AsciiOptions {
  const expectedKeys = schemaVersion === 1 ? OPTION_KEYS_V1 : OPTION_KEYS_V2;
  if (!isRecord(value) || !hasExactKeys(value, expectedKeys)) {
    presetError('settings.options has an unsupported shape.');
  }
  const legacy = readLegacyOptions(value);
  if (schemaVersion === 1) {
    return { ...legacy, renderMode: 'tone', edgeStyle: 'ascii' };
  }
  if (value.renderMode !== 'tone' && value.renderMode !== 'braille') {
    presetError('renderMode must be tone or braille.');
  }
  if (value.edgeStyle !== 'ascii' && value.edgeStyle !== 'unicode') {
    presetError('edgeStyle must be ascii or unicode.');
  }
  if (value.renderMode === 'braille' && legacy.edgeGlyphs) {
    presetError('Braille render mode cannot be combined with edge glyphs.');
  }
  return {
    ...legacy,
    renderMode: value.renderMode,
    edgeStyle: value.edgeStyle,
  };
}

function cloneOptions(options: AsciiOptions): AsciiOptions {
  return { ...options, background: { ...options.background } };
}

function clonePreset(preset: CustomPreset): CustomPreset {
  return {
    schemaVersion: CUSTOM_PRESET_SCHEMA_VERSION,
    name: preset.name,
    settings: settingsForCustomPreset(preset),
  };
}

function settingsMatch(left: CustomPresetSettings, right: CustomPresetSettings): boolean {
  const leftOptions = left.options;
  const rightOptions = right.options;
  return (
    left.collapsible === right.collapsible &&
    leftOptions.width === rightOptions.width &&
    leftOptions.cellAspectRatio === rightOptions.cellAspectRatio &&
    leftOptions.ramp === rightOptions.ramp &&
    leftOptions.renderMode === rightOptions.renderMode &&
    leftOptions.invert === rightOptions.invert &&
    leftOptions.autoLevels === rightOptions.autoLevels &&
    leftOptions.lowPercentile === rightOptions.lowPercentile &&
    leftOptions.highPercentile === rightOptions.highPercentile &&
    leftOptions.contrast === rightOptions.contrast &&
    leftOptions.brightness === rightOptions.brightness &&
    leftOptions.gamma === rightOptions.gamma &&
    leftOptions.detail === rightOptions.detail &&
    leftOptions.dither === rightOptions.dither &&
    leftOptions.edgeGlyphs === rightOptions.edgeGlyphs &&
    leftOptions.edgeStyle === rightOptions.edgeStyle &&
    leftOptions.edgeThreshold === rightOptions.edgeThreshold &&
    leftOptions.trimLineEnds === rightOptions.trimLineEnds &&
    leftOptions.background.r === rightOptions.background.r &&
    leftOptions.background.g === rightOptions.background.g &&
    leftOptions.background.b === rightOptions.background.b
  );
}

function parsePreset(value: unknown): CustomPreset {
  if (!isRecord(value) || !hasExactKeys(value, ['schemaVersion', 'name', 'settings'])) {
    presetError('preset must contain only schemaVersion, name, and settings.');
  }
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) {
    presetError('schemaVersion must be 1 or 2.');
  }
  const schemaVersion = value.schemaVersion;
  if (!isRecord(value.settings) || !hasExactKeys(value.settings, ['options', 'collapsible'])) {
    presetError('settings must contain only options and collapsible.');
  }

  return {
    schemaVersion: CUSTOM_PRESET_SCHEMA_VERSION,
    name: readName(value.name),
    settings: {
      options: readOptions(value.settings.options, schemaVersion),
      collapsible: readBoolean(value.settings.collapsible, 'collapsible'),
    },
  };
}

function allocateUniqueName(name: string, used: Set<string>): string {
  const normalized = name.toLowerCase();
  if (!used.has(normalized)) {
    used.add(normalized);
    return name;
  }

  for (let sequence = 2; sequence <= MAX_CUSTOM_PRESETS + 1; sequence += 1) {
    const suffix = ` (${sequence})`;
    const base = name.slice(0, MAX_PRESET_NAME_LENGTH - suffix.length).trimEnd();
    const candidate = `${base}${suffix}`;
    const normalizedCandidate = candidate.toLowerCase();
    if (!used.has(normalizedCandidate)) {
      used.add(normalizedCandidate);
      return candidate;
    }
  }
  presetError('a unique name could not be allocated within the preset limit.');
}

export function settingsForCustomPreset(preset: CustomPreset): CustomPresetSettings {
  return {
    options: cloneOptions(preset.settings.options),
    collapsible: preset.settings.collapsible,
  };
}

export function isCustomPresetDirty(preset: CustomPreset, settings: CustomPresetSettings): boolean {
  const normalized = parsePreset({
    schemaVersion: CUSTOM_PRESET_SCHEMA_VERSION,
    name: preset.name,
    settings,
  });
  return !settingsMatch(preset.settings, normalized.settings);
}

export function addCustomPreset(
  existing: readonly CustomPreset[],
  name: string,
  settings: CustomPresetSettings,
): CustomPreset[] {
  const candidate = parsePreset({
    schemaVersion: CUSTOM_PRESET_SCHEMA_VERSION,
    name,
    settings,
  });
  if (existing.length + 1 > MAX_CUSTOM_PRESETS) {
    presetError(`at most ${MAX_CUSTOM_PRESETS} presets may be saved.`);
  }
  const cloned = existing.map(clonePreset);
  const used = new Set(cloned.map((preset) => preset.name.toLowerCase()));
  return [...cloned, { ...candidate, name: allocateUniqueName(candidate.name, used) }];
}

export function removeCustomPreset(
  existing: readonly CustomPreset[],
  name: string,
): CustomPreset[] {
  return existing.filter((preset) => preset.name !== name).map(clonePreset);
}

export function updateCustomPreset(
  existing: readonly CustomPreset[],
  name: string,
  settings: CustomPresetSettings,
): CustomPreset[] {
  const candidate = parsePreset({
    schemaVersion: CUSTOM_PRESET_SCHEMA_VERSION,
    name,
    settings,
  });
  let found = false;
  const updated = existing.map((preset) => {
    if (preset.name !== name) return clonePreset(preset);
    found = true;
    return candidate;
  });
  if (!found) throw new Error('Saved preset was not found.');
  return updated;
}

export function serializeCustomPreset(preset: CustomPreset): string {
  return `${JSON.stringify(parsePreset(preset), null, 2)}\n`;
}

export function parseCustomPresetJson(json: string): CustomPreset[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    presetError('JSON could not be parsed.');
  }
  const records = Array.isArray(raw) ? raw : [raw];
  if (records.length === 0) presetError('at least one preset is required.');
  if (records.length > MAX_CUSTOM_PRESETS) {
    presetError(`at most ${MAX_CUSTOM_PRESETS} presets may be saved.`);
  }
  return records.map(parsePreset);
}

export function mergeImportedPresets(
  existing: readonly CustomPreset[],
  imported: readonly CustomPreset[],
): CustomPreset[] {
  if (existing.length + imported.length > MAX_CUSTOM_PRESETS) {
    presetError(`at most ${MAX_CUSTOM_PRESETS} presets may be saved.`);
  }
  const merged = existing.map(clonePreset);
  const used = new Set(merged.map(({ name }) => name.toLowerCase()));
  for (const value of imported) {
    const preset = parsePreset(value);
    merged.push({ ...preset, name: allocateUniqueName(preset.name, used) });
  }
  return merged;
}

export function readStoredCustomPresets(storage: PresetStorage): CustomPreset[] | null {
  const stored = storage.getItem(CUSTOM_PRESET_STORAGE_KEY);
  if (stored === null) return null;
  const raw: unknown = JSON.parse(stored);
  if (!Array.isArray(raw)) presetError('stored presets must be an array.');
  if (raw.length === 0) return [];
  return mergeImportedPresets([], raw.map(parsePreset));
}

export function loadCustomPresets(storage: PresetStorage | undefined): CustomPreset[] {
  if (!storage) return [];
  try {
    return readStoredCustomPresets(storage) ?? [];
  } catch {
    return [];
  }
}

export function saveCustomPresets(
  storage: PresetStorage | undefined,
  presets: readonly CustomPreset[],
): boolean {
  if (!storage) return false;
  const serialized = JSON.stringify(presets.map(parsePreset));
  try {
    storage.setItem(CUSTOM_PRESET_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}
