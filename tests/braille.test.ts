import { describe, expect, it } from 'vitest';
import { renderBrailleCells } from '../src/core/braille.js';

const dotCases = [
  [0, 0, 0x01],
  [0, 1, 0x02],
  [0, 2, 0x04],
  [1, 0, 0x08],
  [1, 1, 0x10],
  [1, 2, 0x20],
  [0, 3, 0x40],
  [1, 3, 0x80],
] as const;

describe('Braille cell renderer', () => {
  it.each(dotCases)('maps subcell (%i,%i) to mask 0x%i', (x, y, mask) => {
    const subcells = new Uint16Array(8).fill(1);
    subcells[y * 2 + x] = 0;
    expect(renderBrailleCells(subcells, 1, 1, false)).toBe(String.fromCodePoint(0x2800 + mask));
  });

  it('keeps empty cells in the Braille font with U+2800 and fills full cells with U+28FF', () => {
    const leadingBlank = new Uint16Array(16).fill(1);
    leadingBlank[2] = 0;
    expect(renderBrailleCells(leadingBlank, 2, 1, true)).toBe('\u2800⠁');
    expect(renderBrailleCells(new Uint16Array(8), 1, 1, false)).toBe('⣿');
  });

  it('emits only Braille pattern scalars', () => {
    const art = renderBrailleCells(Uint16Array.from([0, 1, 1, 0, 0, 1, 1, 0]), 1, 1, false);
    for (const character of art) {
      const scalar = character.codePointAt(0)!;
      expect(scalar >= 0x2800 && scalar <= 0x28ff).toBe(true);
    }
  });

  it('preserves output dimensions and trims only trailing blank cells', () => {
    const subcells = new Uint16Array(4 * 8).fill(1);
    subcells[0] = 0;
    subcells[4 * 4] = 0;
    expect(renderBrailleCells(subcells, 2, 2, false).split('\n')).toEqual(['⠁\u2800', '⠁\u2800']);
    expect(renderBrailleCells(subcells, 2, 2, true).split('\n')).toEqual(['⠁', '⠁']);
  });

  it('rejects a subcell field with the wrong size', () => {
    expect(() => renderBrailleCells(new Uint16Array(7), 1, 1, true)).toThrow(
      'Braille subcell field must contain outputWidth × 2 × outputHeight × 4 entries.',
    );
  });
});
