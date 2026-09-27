const BRAILLE_BASE = 0x2800;
const BRAILLE_BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
] as const;

export function renderBrailleCells(
  indices: Uint16Array,
  outputWidth: number,
  outputHeight: number,
  trimLineEnds: boolean,
): string {
  const subcellWidth = outputWidth * 2;
  const subcellHeight = outputHeight * 4;
  if (indices.length !== subcellWidth * subcellHeight) {
    throw new RangeError(
      'Braille subcell field must contain outputWidth × 2 × outputHeight × 4 entries.',
    );
  }

  const lines: string[] = [];
  for (let cellY = 0; cellY < outputHeight; cellY += 1) {
    let line = '';
    for (let cellX = 0; cellX < outputWidth; cellX += 1) {
      let mask = 0;
      for (let dotY = 0; dotY < 4; dotY += 1) {
        for (let dotX = 0; dotX < 2; dotX += 1) {
          const subcellX = cellX * 2 + dotX;
          const subcellY = cellY * 4 + dotY;
          if ((indices[subcellY * subcellWidth + subcellX] ?? 1) === 0) {
            mask |= BRAILLE_BITS[dotY]?.[dotX] ?? 0;
          }
        }
      }
      // U+2800 (blank pattern) keeps every cell in the Braille font; ASCII spaces come from the
      // monospace font, whose advance differs, and would shift the dots on each row.
      line += String.fromCodePoint(BRAILLE_BASE + mask);
    }
    lines.push(trimLineEnds ? line.replace(/\u2800+$/u, '') : line);
  }
  return lines.join('\n');
}
