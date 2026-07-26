import { describe, expect, it } from 'vitest';
import {
  classifyEdgeDirection,
  glyphForConnectivity,
  renderStructuralCharacters,
} from '../src/core/structure.js';

describe('Structural Unicode renderer', () => {
  it.each([
    [0, 'vertical'],
    [Math.PI / 4, 'rising-diagonal'],
    [Math.PI / 2, 'horizontal'],
    [(3 * Math.PI) / 4, 'falling-diagonal'],
  ] as const)('classifies Sobel normal angle %f', (normalAngle, expected) => {
    expect(classifyEdgeDirection(normalAngle)).toBe(expected);
  });

  it.each([
    [0b1010, 'horizontal', '─'],
    [0b0101, 'vertical', '│'],
    [0b0110, 'horizontal', '┌'],
    [0b1100, 'horizontal', '┐'],
    [0b0011, 'horizontal', '└'],
    [0b1001, 'horizontal', '┘'],
    [0b0111, 'vertical', '├'],
    [0b1101, 'vertical', '┤'],
    [0b1110, 'horizontal', '┬'],
    [0b1011, 'horizontal', '┴'],
    [0b1111, 'vertical', '┼'],
    [0b0010, 'horizontal', '─'],
    [0b0001, 'vertical', '│'],
  ] as const)('maps mask %i to %s', (mask, direction, glyph) => {
    expect(glyphForConnectivity(mask, direction)).toBe(glyph);
  });

  it('uses diagonals directly and leaves weak cells on their tone glyph', () => {
    const art = renderStructuralCharacters({
      indices: Uint16Array.from([0, 0, 0]),
      ramp: ['#', ' '],
      values: Float64Array.from([0.5, 0.5, 0.5]),
      edges: {
        magnitude: Float64Array.from([1, 1, 0.1]),
        angle: Float64Array.from([Math.PI / 4, (3 * Math.PI) / 4, 0]),
      },
      width: 3,
      height: 1,
      threshold: 0.2,
      trimLineEnds: false,
    });
    expect(art).toBe('╱╲#');
  });

  it('derives a cross from compatible cardinal neighbors', () => {
    const magnitude = new Float64Array(9);
    const angle = new Float64Array(9);
    for (const index of [1, 3, 4, 5, 7]) magnitude[index] = 1;
    angle[1] = 0;
    angle[7] = 0;
    angle[3] = Math.PI / 2;
    angle[5] = Math.PI / 2;
    const art = renderStructuralCharacters({
      indices: new Uint16Array(9),
      ramp: ['#', ' '],
      values: new Float64Array(9).fill(0.5),
      edges: { magnitude, angle },
      width: 3,
      height: 3,
      threshold: 0.2,
      trimLineEnds: false,
    });
    expect(Array.from(art.split('\n')[1] ?? '')[1]).toBe('┼');
  });

  it('keeps hard black and white boundaries eligible when the edge is strong', () => {
    const art = renderStructuralCharacters({
      indices: Uint16Array.from([0, 1]),
      ramp: ['#', ' '],
      values: Float64Array.from([0, 1]),
      edges: {
        magnitude: Float64Array.from([0.8, 0.8]),
        angle: Float64Array.from([0, 0]),
      },
      width: 2,
      height: 1,
      threshold: 0.2,
      trimLineEnds: false,
    });
    expect(art).toBe('││');
  });

  it('rejects mismatched field lengths before rendering', () => {
    expect(() =>
      renderStructuralCharacters({
        indices: new Uint16Array(1),
        ramp: ['#', ' '],
        values: new Float64Array(2),
        edges: { magnitude: new Float64Array(1), angle: new Float64Array(1) },
        width: 1,
        height: 1,
        threshold: 0.2,
        trimLineEnds: true,
      }),
    ).toThrow('Structural fields must match width × height.');
  });
});
