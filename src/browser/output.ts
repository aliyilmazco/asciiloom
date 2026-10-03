import { toMarkdown } from '../core/markdown.js';
import { toSvg } from '../core/svg.js';
import type { AsciiOptions, OutputFormat } from '../core/types.js';

export interface GeneratedOutputs extends Record<OutputFormat, string> {
  text: string;
  markdown: string;
  svg: string;
}

const DOWNLOAD_DETAILS: Record<OutputFormat, { extension: string; mimeType: string }> = {
  text: { extension: 'txt', mimeType: 'text/plain;charset=utf-8' },
  markdown: { extension: 'md', mimeType: 'text/markdown;charset=utf-8' },
  svg: { extension: 'svg', mimeType: 'image/svg+xml;charset=utf-8' },
};

export function generatedOutputs(
  art: string,
  name: string,
  options: AsciiOptions,
  collapsible: boolean,
): GeneratedOutputs {
  return {
    text: `${art}\n`,
    markdown: toMarkdown(art, { collapsible, open: true, summary: name }),
    svg: toSvg(art, {
      title: `${name} rendered as ASCII art`,
      cellAspectRatio: options.cellAspectRatio,
      foreground: options.invert ? '#f0f6fc' : '#24292f',
      background: options.invert ? '#0d1117' : '#ffffff',
    }),
  };
}

export function downloadContent(
  content: string,
  mimeType: string,
  filename: string,
  document: Document,
  urlApi: typeof URL,
): void {
  const objectUrl = urlApi.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;

  try {
    anchor.click();
  } finally {
    const schedule =
      document.defaultView?.setTimeout.bind(document.defaultView) ?? globalThis.setTimeout;
    schedule(() => urlApi.revokeObjectURL(objectUrl), 0);
  }
}

export function downloadGenerated(
  content: string,
  format: OutputFormat,
  baseName: string,
  document: Document,
  urlApi: typeof URL,
): void {
  const details = DOWNLOAD_DETAILS[format];
  downloadContent(
    content,
    details.mimeType,
    `${baseName || 'ascii-art'}.${details.extension}`,
    document,
    urlApi,
  );
}

export async function copyText(
  content: string,
  navigator: Navigator,
  document: Document,
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const fallback = document.createElement('textarea');
    fallback.value = content;
    fallback.setAttribute('aria-hidden', 'true');
    fallback.style.position = 'fixed';
    fallback.style.opacity = '0';
    document.body.append(fallback);

    try {
      fallback.focus();
      fallback.select();
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      fallback.remove();
      if (previouslyFocused?.isConnected && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    }
  }
}
