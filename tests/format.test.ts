import { describe, expect, it } from 'vitest';
import { toMarkdown } from '../src/core/markdown.js';
import { toSvg } from '../src/core/svg.js';

describe('toMarkdown', () => {
  it('uses a tilde fence when the art contains triple backticks', () => {
    const output = toMarkdown('```\nASCII');
    expect(output.startsWith('~~~text\n')).toBe(true);
    expect(output.endsWith('~~~\n')).toBe(true);
  });

  it('uses a backtick fence when the art contains triple tildes', () => {
    const output = toMarkdown('~~~\nASCII');
    expect(output.startsWith('```text\n')).toBe(true);
  });

  it('lengthens the fence when both delimiter characters occur', () => {
    const output = toMarkdown('``` ~~~');
    expect(output.startsWith('````text\n')).toBe(true);
    expect(output.endsWith('````\n')).toBe(true);
  });

  it('escapes a collapsible summary', () => {
    const output = toMarkdown('ASCII', { collapsible: true, summary: '<photo & art>', open: true });
    expect(output).toContain('<details open>');
    expect(output).toContain('<summary>&lt;photo &amp; art&gt;</summary>');
  });

  it('rejects a structural Markdown language value', () => {
    expect(() => toMarkdown('art', { language: 'text\n```\n<script>' })).toThrow(
      'language must be a single Markdown info-string token.',
    );
  });

  it('accepts safe optional Markdown language tokens', () => {
    expect(toMarkdown('art', { language: 'c++' })).toMatch(/^```c\+\+\n/u);
    expect(toMarkdown('art', { language: '' })).toMatch(/^```\n/u);
  });

  it('preserves terminal blank rows in Markdown', () => {
    const output = toMarkdown('A\n\n');
    expect(output).toContain('```text\nA\n\n\n```');
  });
});

describe('toSvg', () => {
  it('escapes text content and includes accessible title metadata', () => {
    const output = toSvg('<&>', { title: 'A & B' });
    expect(output).toContain('<title id="ascii-art-title">A &amp; B</title>');
    expect(output).toContain('&lt;&amp;&gt;');
    expect(output).toContain('aria-labelledby="ascii-art-title"');
  });

  it('rejects invalid SVG metrics', () => {
    expect(() => toSvg('art', { fontSize: null as never })).toThrow(
      'fontSize must be a finite number greater than 0.',
    );
    expect(() => toSvg('art', { fontSize: Number.POSITIVE_INFINITY })).toThrow(
      'fontSize must be a finite number greater than 0.',
    );
    expect(() => toSvg('art', { cellAspectRatio: 0 })).toThrow(
      'cellAspectRatio must be a finite number greater than 0.',
    );
    expect(() => toSvg('art', { padding: -1 })).toThrow(
      'padding must be a finite number greater than or equal to 0.',
    );
    expect(() => toSvg('art', { padding: null as never })).toThrow(
      'padding must be a finite number greater than or equal to 0.',
    );
  });

  it('pins every row to a grid of cells with the converted aspect', () => {
    const output = toSvg(`${'x'.repeat(100)}\n⣿⣿`, {
      fontSize: 10,
      padding: 0,
      cellAspectRatio: 0.4,
    });
    const cellWidth = Number(output.match(/<svg[^>]* width="([\d.]+)"/u)?.[1]) / 100;
    const rows = Array.from(
      output.matchAll(/<tspan[^>]* y="([\d.]+)" textLength="([\d.]+)"/gu),
      (match) => ({ y: Number(match[1]), length: Number(match[2]) }),
    );

    expect(cellWidth / (rows[1]!.y - rows[0]!.y)).toBeCloseTo(0.4, 2);
    expect(rows.map(({ length }) => length / cellWidth)).toEqual([100, 2]);
  });

  it('rejects calculated SVG axes above the safety limit', () => {
    expect(() => toSvg('x'.repeat(6000))).toThrow('SVG width must not exceed 32768 pixels.');
    expect(() => toSvg('x\n'.repeat(2400))).toThrow('SVG height must not exceed 32768 pixels.');
  });

  it('rejects XML 1.0 control characters before producing malformed SVG', () => {
    expect(() => toSvg('A\u0000B')).toThrow(
      'art contains a character that XML 1.0 cannot represent.',
    );
    expect(() => toSvg('art', { title: 'A\u0000B' })).toThrow(
      'title contains a character that XML 1.0 cannot represent.',
    );
    expect(() => toSvg('art', { foreground: '#fff\u0000' })).toThrow(
      'foreground contains a character that XML 1.0 cannot represent.',
    );
    expect(() => toSvg('art', { background: '#000\u0000' })).toThrow(
      'background contains a character that XML 1.0 cannot represent.',
    );
    expect(toSvg('😀', { title: 'Emoji 😀' })).toContain('Emoji 😀');
  });

  it('rejects non-string SVG text fields at runtime', () => {
    expect(() => toSvg(null as never)).toThrow('art must be a string.');
    expect(() => toSvg('art', { title: 42 as never })).toThrow('title must be a string.');
    expect(() => toSvg('art', { foreground: false as never })).toThrow(
      'foreground must be a string.',
    );
    expect(() => toSvg('art', { background: 42 as never })).toThrow('background must be a string.');
  });

  it('emits one SVG row for every logical input row', () => {
    const output = toSvg('\n\n');
    expect(output.match(/<tspan /gu)).toHaveLength(3);
  });

  it('uses conservative display cells for wide and zero-width Unicode', () => {
    const asciiWidth = Number(/width="(\d+)"/u.exec(toSvg('AA'))?.[1]);
    const cjkWidth = Number(/width="(\d+)"/u.exec(toSvg('界界'))?.[1]);
    const combiningWidth = Number(/width="(\d+)"/u.exec(toSvg('e\u0301e\u0301'))?.[1]);
    expect(cjkWidth).toBeGreaterThan(asciiWidth);
    expect(combiningWidth).toBe(asciiWidth);
  });
});
