import { escapeHtml, normalizeArt } from './markdown.js';
import type { SvgOptions } from './types.js';

const MAX_SVG_AXIS = 32_768;
const GLYPH_DESCENT_RATIO = 0.2;
const ZERO_WIDTH_CHARACTER = /\p{Mark}|\u{200d}/u;
const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

function containsInvalidXmlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (
      codePoint <= 0x08 ||
      codePoint === 0x0b ||
      codePoint === 0x0c ||
      (codePoint >= 0x0e && codePoint <= 0x1f) ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      codePoint === 0xfffe ||
      codePoint === 0xffff
    ) {
      return true;
    }
  }
  return false;
}

export function assertXmlText(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a string.`);
  }
  if (containsInvalidXmlCharacter(value)) {
    throw new TypeError(`${name} contains a character that XML 1.0 cannot represent.`);
  }
}

function isWideCodePoint(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  );
}

export function displayCellWidth(value: string): number {
  let width = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (ZERO_WIDTH_CHARACTER.test(character) || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)) {
      continue;
    }
    width += isWideCodePoint(codePoint) || EXTENDED_PICTOGRAPHIC.test(character) ? 2 : 1;
  }
  return width;
}

function assertPositiveMetric(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite number greater than 0.`);
  }
}

function assertPadding(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('padding must be a finite number greater than or equal to 0.');
  }
}

export function toSvg(art: string, options: SvgOptions = {}): string {
  assertXmlText('art', art);
  const lines = normalizeArt(art).split('\n');
  const suppliedTitle = options.title ?? 'ASCII art';
  assertXmlText('title', suppliedTitle);
  const title = suppliedTitle.trim() || 'ASCII art';
  const fontSize = options.fontSize === undefined ? 14 : options.fontSize;
  const cellAspectRatio = options.cellAspectRatio === undefined ? 0.5 : options.cellAspectRatio;
  const padding = options.padding === undefined ? 12 : options.padding;
  const foreground = options.foreground ?? '#24292f';
  const background = options.background === undefined ? '#ffffff' : options.background;
  assertXmlText('foreground', foreground);
  if (background !== null) assertXmlText('background', background);
  assertPositiveMetric('fontSize', fontSize);
  assertPositiveMetric('cellAspectRatio', cellAspectRatio);
  assertPadding(padding);

  const maxCharacters = lines.reduce(
    (maximum, line) => Math.max(maximum, displayCellWidth(line)),
    1,
  );
  // Rows are one em apart so block glyphs tile without gaps; each cell is then as wide as the
  // width ÷ height the art was converted for, and textLength pins every row to that grid even when
  // a glyph falls back to a font with a different advance.
  const characterWidth = fontSize * cellAspectRatio;
  const rowAdvance = fontSize;
  const firstBaseline = padding + fontSize;
  const lastBaseline = firstBaseline + (lines.length - 1) * rowAdvance;
  const width = Math.ceil(maxCharacters * characterWidth + padding * 2);
  const height = Math.ceil(lastBaseline + fontSize * GLYPH_DESCENT_RATIO + padding);
  if (width > MAX_SVG_AXIS) {
    throw new RangeError(`SVG width must not exceed ${MAX_SVG_AXIS} pixels.`);
  }
  if (height > MAX_SVG_AXIS) {
    throw new RangeError(`SVG height must not exceed ${MAX_SVG_AXIS} pixels.`);
  }
  const titleId = 'ascii-art-title';

  const backgroundElement = background
    ? `  <rect width="100%" height="100%" rx="6" fill="${escapeHtml(background)}"/>\n`
    : '';

  const tspans = lines
    .map((line, index) => {
      const text = line || ' ';
      const y = firstBaseline + index * rowAdvance;
      const length = displayCellWidth(text) * characterWidth;
      return `    <tspan x="${padding}" y="${y.toFixed(2)}" textLength="${length.toFixed(2)}" lengthAdjust="spacing">${escapeHtml(text)}</tspan>`;
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${titleId}">`,
    `  <title id="${titleId}">${escapeHtml(title)}</title>`,
    backgroundElement.trimEnd(),
    `  <text xml:space="preserve" fill="${escapeHtml(foreground)}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', 'Apple Symbols', 'Segoe UI Symbol', monospace" font-size="${fontSize}" font-weight="400">`,
    tspans,
    '  </text>',
    '</svg>',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}
