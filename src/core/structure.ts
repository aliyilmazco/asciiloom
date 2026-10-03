export type EdgeDirection = 'horizontal' | 'vertical' | 'rising-diagonal' | 'falling-diagonal';

export interface EdgeField {
  magnitude: Float64Array;
  angle: Float64Array;
}

export interface StructuralRenderInput {
  indices: Uint16Array;
  ramp: readonly string[];
  values: Float64Array;
  edges: EdgeField;
  width: number;
  height: number;
  threshold: number;
  trimLineEnds: boolean;
}

const NORTH = 0b0001;
const EAST = 0b0010;
const SOUTH = 0b0100;
const WEST = 0b1000;
const EDGE_MIDTONE_MIN = 0.06;
const EDGE_MIDTONE_MAX = 0.94;
const STRONG_EDGE_MAGNITUDE = 0.5;

const CONNECTIVITY_GLYPHS = new Map<number, string>([
  [EAST | WEST, '─'],
  [NORTH | SOUTH, '│'],
  [EAST | SOUTH, '┌'],
  [WEST | SOUTH, '┐'],
  [NORTH | EAST, '└'],
  [NORTH | WEST, '┘'],
  [NORTH | EAST | SOUTH, '├'],
  [NORTH | SOUTH | WEST, '┤'],
  [EAST | SOUTH | WEST, '┬'],
  [NORTH | EAST | WEST, '┴'],
  [NORTH | EAST | SOUTH | WEST, '┼'],
]);

export function classifyEdgeDirection(normalAngle: number): EdgeDirection {
  let tangent = normalAngle + Math.PI / 2;
  while (tangent < 0) tangent += Math.PI;
  while (tangent >= Math.PI) tangent -= Math.PI;
  if (tangent < Math.PI / 8 || tangent >= (7 * Math.PI) / 8) return 'horizontal';
  if (tangent < (3 * Math.PI) / 8) return 'falling-diagonal';
  if (tangent < (5 * Math.PI) / 8) return 'vertical';
  return 'rising-diagonal';
}

export function glyphForConnectivity(
  mask: number,
  fallbackDirection: Extract<EdgeDirection, 'horizontal' | 'vertical'>,
): string {
  return CONNECTIVITY_GLYPHS.get(mask) ?? (fallbackDirection === 'horizontal' ? '─' : '│');
}

function isEligible(value: number, magnitude: number, threshold: number): boolean {
  const isMidtone = value > EDGE_MIDTONE_MIN && value < EDGE_MIDTONE_MAX;
  return magnitude >= threshold && (isMidtone || magnitude >= STRONG_EDGE_MAGNITUDE);
}

function directionAt(
  directions: readonly (EdgeDirection | undefined)[],
  width: number,
  height: number,
  x: number,
  y: number,
): EdgeDirection | undefined {
  if (x < 0 || y < 0 || x >= width || y >= height) return undefined;
  return directions[y * width + x];
}

export function renderStructuralCharacters(input: StructuralRenderInput): string {
  const { indices, ramp, values, edges, width, height, threshold, trimLineEnds } = input;
  const fieldLength = width * height;
  if (
    indices.length !== fieldLength ||
    values.length !== fieldLength ||
    edges.magnitude.length !== fieldLength ||
    edges.angle.length !== fieldLength
  ) {
    throw new RangeError('Structural fields must match width × height.');
  }

  const directions = Array.from<EdgeDirection | undefined>({ length: fieldLength });
  for (let index = 0; index < fieldLength; index += 1) {
    const magnitude = edges.magnitude[index] ?? 0;
    if (isEligible(values[index] ?? 0, magnitude, threshold)) {
      directions[index] = classifyEdgeDirection(edges.angle[index] ?? 0);
    }
  }

  const lines: string[] = [];
  for (let y = 0; y < height; y += 1) {
    let line = '';
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const direction = directions[index];
      if (direction === undefined) {
        line += ramp[indices[index] ?? 0] ?? ' ';
        continue;
      }
      if (direction === 'rising-diagonal') {
        line += '╱';
        continue;
      }
      if (direction === 'falling-diagonal') {
        line += '╲';
        continue;
      }

      let mask = 0;
      if (directionAt(directions, width, height, x, y - 1) === 'vertical') mask |= NORTH;
      if (directionAt(directions, width, height, x + 1, y) === 'horizontal') mask |= EAST;
      if (directionAt(directions, width, height, x, y + 1) === 'vertical') mask |= SOUTH;
      if (directionAt(directions, width, height, x - 1, y) === 'horizontal') mask |= WEST;
      line += glyphForConnectivity(mask, direction);
    }
    lines.push(trimLineEnds ? line.replace(/ +$/u, '') : line);
  }
  return lines.join('\n');
}
