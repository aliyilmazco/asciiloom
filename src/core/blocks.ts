import type { GlyphQuantizer } from './types.js';

export const FILL_STEPS = 8;
// Tone error and ink-placement agreement both count as per-cell squared lightness error; weighting
// placement above 2 keeps a partial glyph out of a cell whose ink sits on the opposite edge.
const PLACEMENT_WEIGHT = 4;

export type FillEdge = 'bottom' | 'left';

// Unicode block elements. A glyph's index is the number of eighths of the cell it inks, growing
// from the named edge.
const FILL_GLYPHS: Readonly<Record<FillEdge, string>> = {
  bottom: ' ▁▂▃▄▅▆▇█',
  left: ' ▏▎▍▌▋▊▉█',
};
const SHADE_INK: Readonly<Record<string, number>> = { '░': 0.25, '▒': 0.5, '▓': 0.75 };

/** Subcell strips (x, y) sampled per cell for ramps that fill from an edge. */
export const FILL_GRID = {
  bottom: [1, FILL_STEPS],
  left: [FILL_STEPS, 1],
} as const satisfies Record<FillEdge, readonly [number, number]>;

/** Ink fraction of a block element, or undefined for any other character. */
export function blockGlyphInk(character: string): number | undefined {
  const eighths = Math.max(
    FILL_GLYPHS.bottom.indexOf(character),
    FILL_GLYPHS.left.indexOf(character),
  );
  return eighths >= 0 ? eighths / FILL_STEPS : SHADE_INK[character];
}

/**
 * The edge a ramp's partial blocks grow from, when every glyph fills from that edge and at least
 * one is partial. Such glyphs place ink, so they must be chosen from where ink sits in the cell,
 * not from the cell's mean tone alone.
 */
export function fillEdge(ramp: readonly string[]): FillEdge | undefined {
  if (ramp.every((character) => character === ' ' || character === '█')) return undefined;
  return (['bottom', 'left'] as const).find((edge) =>
    ramp.every((character) => FILL_GLYPHS[edge].includes(character)),
  );
}

/**
 * Picks, per cell, the fill glyph that best matches both the dithered tone and where the ink lies
 * along the fill axis. `field` holds processed lightness on the `FILL_GRID[edge]` strip grid of an
 * image `width` cells wide.
 */
export function createFillQuantizer(
  ramp: readonly string[],
  edge: FillEdge,
  field: Float64Array,
  width: number,
): GlyphQuantizer {
  const eighths = ramp.map((character) => FILL_GLYPHS[edge].indexOf(character));
  const lightness = Float64Array.from(eighths, (filled) => 1 - filled / FILL_STEPS);
  const ink = new Float64Array(FILL_STEPS);
  // excess[n] = Σ over the n strips nearest the fill edge of (strip ink − cell mean ink): how much
  // more ink than average a glyph filling n strips would find under itself.
  const excess = new Float64Array(FILL_STEPS + 1);

  return {
    lightness,
    pick(value, cell, bias) {
      const x = cell % width;
      const y = (cell - x) / width;
      let meanInk = 0;
      for (let strip = 0; strip < FILL_STEPS; strip += 1) {
        const index =
          edge === 'bottom'
            ? (y * FILL_STEPS + FILL_STEPS - 1 - strip) * width + x
            : cell * FILL_STEPS + strip;
        ink[strip] = 1 - (field[index] ?? 1);
        meanInk += ink[strip]!;
      }
      meanInk /= FILL_STEPS;
      for (let strip = 0; strip < FILL_STEPS; strip += 1) {
        excess[strip + 1] = excess[strip]! + ink[strip]! - meanInk;
      }

      const targetInk = 1 - Math.min(1, Math.max(0, value + bias / FILL_STEPS));
      let best = 0;
      let bestCost = Infinity;
      for (let glyph = 0; glyph < eighths.length; glyph += 1) {
        const filled = eighths[glyph]!;
        const toneError = targetInk - filled / FILL_STEPS;
        const cost = toneError * toneError - (PLACEMENT_WEIGHT * excess[filled]!) / FILL_STEPS;
        if (cost < bestCost) {
          bestCost = cost;
          best = glyph;
        }
      }
      return best;
    },
  };
}
