import type { MarkdownOptions } from './types.js';

function longestRun(text: string, character: '`' | '~'): number {
  let longest = 0;
  let current = 0;
  for (const item of text) {
    if (item === character) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function chooseFence(art: string): string {
  const backticks = '`'.repeat(Math.max(3, longestRun(art, '`') + 1));
  const tildes = '~'.repeat(Math.max(3, longestRun(art, '~') + 1));
  return tildes.length < backticks.length ? tildes : backticks;
}

export function normalizeArt(art: string): string {
  if (typeof art !== 'string') throw new TypeError('art must be a string.');
  return art.replace(/\r\n?/gu, '\n');
}

export function toMarkdown(art: string, options: MarkdownOptions = {}): string {
  const language = options.language ?? 'text';
  if (typeof language !== 'string' || !/^[A-Za-z0-9_+-]*$/u.test(language)) {
    throw new TypeError('language must be a single Markdown info-string token.');
  }
  const normalized = normalizeArt(art);
  const fence = chooseFence(normalized);
  const block = `${fence}${language}\n${normalized}\n${fence}`;

  if (!options.collapsible) return `${block}\n`;

  const summary = options.summary?.trim() || 'ASCII art';
  const open = options.open ? ' open' : '';
  return `<details${open}>\n<summary>${escapeHtml(summary)}</summary>\n\n${block}\n\n</details>\n`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
