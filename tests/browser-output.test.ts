import { describe, expect, it, vi } from 'vitest';
import { copyText, downloadGenerated, generatedOutputs } from '../src/browser/output.js';
import { DEFAULT_OPTIONS } from '../src/core/presets.js';

describe('browser output helpers', () => {
  it('builds text, Markdown, and SVG from one conversion result', () => {
    const outputs = generatedOutputs('##\n..', 'example', DEFAULT_OPTIONS, true);

    expect(outputs.text).toBe('##\n..\n');
    expect(outputs.markdown).toContain('<summary>example</summary>');
    expect(outputs.markdown).toContain('##\n..');
    expect(outputs.svg).toContain('>example rendered as ASCII art</title>');
  });

  it.each([
    ['text', 'txt', 'text/plain;charset=utf-8'],
    ['markdown', 'md', 'text/markdown;charset=utf-8'],
    ['svg', 'svg', 'image/svg+xml;charset=utf-8'],
  ] as const)(
    'downloads %s with the expected extension and MIME type',
    (format, extension, mimeType) => {
      const clicked = vi.fn();
      const revoked: string[] = [];
      let anchor: { href: string; download: string; click(): void } | undefined;
      let blobType = '';
      const document = {
        createElement: () => {
          anchor = { href: '', download: '', click: clicked };
          return anchor;
        },
        defaultView: { setTimeout: (callback: () => void) => callback() },
      } as unknown as Document;
      const url = {
        createObjectURL: (blob: Blob) => {
          blobType = blob.type;
          return 'blob:generated';
        },
        revokeObjectURL: (value: string) => revoked.push(value),
      } as unknown as typeof URL;

      downloadGenerated('content', format, 'source-name', document, url);

      expect(clicked).toHaveBeenCalledOnce();
      expect(anchor?.download).toBe(`source-name.${extension}`);
      expect(blobType).toBe(mimeType);
      expect(revoked).toEqual(['blob:generated']);
    },
  );

  it('removes the clipboard fallback textarea even when legacy copy throws', async () => {
    const removed = vi.fn();
    const fallback = {
      value: '',
      style: {},
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
      remove: removed,
    };
    const document = {
      createElement: () => fallback,
      body: { append: vi.fn() },
      execCommand: () => {
        throw new Error('copy unavailable');
      },
    } as unknown as Document;
    const navigator = {
      clipboard: { writeText: () => Promise.reject(new Error('permission denied')) },
    } as unknown as Navigator;

    await expect(copyText('content', navigator, document)).resolves.toBe(false);
    expect(removed).toHaveBeenCalledOnce();
  });

  it('restores focus after using the legacy clipboard fallback', async () => {
    document.body.innerHTML = '<button type="button">Copy</button>';
    const button = document.querySelector('button')!;
    button.focus();
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: () => true,
    });
    const navigator = {
      clipboard: { writeText: () => Promise.reject(new Error('permission denied')) },
    } as unknown as Navigator;

    await expect(copyText('content', navigator, document)).resolves.toBe(true);

    expect(document.activeElement).toBe(button);
    expect(document.querySelector('textarea')).toBeNull();
  });
});
// @vitest-environment happy-dom
