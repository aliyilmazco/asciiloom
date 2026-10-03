// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import { createOutputController } from '../src/browser/output-controller.js';
import { optionsForPreset } from '../src/core/presets.js';

function installPage(): void {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  document.documentElement.innerHTML = /<html[^>]*>([\s\S]*)<\/html>/u.exec(html)?.[1] ?? '';
}

beforeEach(installPage);

it('starts unavailable and presents every generated format with metadata', () => {
  const controller = createOutputController({
    document,
    window,
    navigator,
    urlApi: URL,
    setStatus: vi.fn(),
  });
  expect(document.querySelector<HTMLButtonElement>('#copyButton')!.disabled).toBe(true);
  expect(document.querySelector<HTMLButtonElement>('#copyButton')!.textContent).toBe(
    'Copy Markdown',
  );

  controller.showGenerated({
    art: 'A',
    width: 1,
    height: 1,
    imageName: 'demo',
    options: optionsForPreset('readme'),
    collapsible: false,
  });

  expect(document.querySelector('#asciiPreview')?.textContent).toBe('A');
  expect(document.querySelector('#resultMeta')?.textContent).toBe(
    '1 columns × 1 rows · 10 glyph levels · atkinson',
  );
  expect(document.querySelector<HTMLTextAreaElement>('#output')?.value).toMatch(/^```text\nA/u);
  expect(document.querySelector<HTMLButtonElement>('#copyButton')!.disabled).toBe(false);
  controller.dispose();
});

it.each([
  [
    'Braille 2×4 subcells',
    { ...optionsForPreset('readme'), renderMode: 'braille' as const, edgeGlyphs: false },
  ],
  [
    'Structural Unicode',
    {
      ...optionsForPreset('logo'),
      renderMode: 'tone' as const,
      edgeGlyphs: true,
      edgeStyle: 'unicode' as const,
    },
  ],
] as const)('reports renderer metadata as %s', (summary, options) => {
  const controller = createOutputController({
    document,
    window,
    navigator,
    urlApi: URL,
    setStatus: vi.fn(),
  });

  controller.showGenerated({
    art: 'A',
    width: 12,
    height: 4,
    imageName: 'demo',
    options,
    collapsible: false,
  });

  expect(document.querySelector('#resultMeta')?.textContent).toBe(
    `12 columns × 4 rows · ${summary} · ${options.dither}`,
  );
  controller.dispose();
});

it('updates collapsible Markdown from the last generated output without replacing the render', () => {
  const controller = createOutputController({
    document,
    window,
    navigator,
    urlApi: URL,
    setStatus: vi.fn(),
  });
  controller.showGenerated({
    art: 'A',
    width: 1,
    height: 1,
    imageName: 'demo',
    options: optionsForPreset('readme'),
    collapsible: false,
  });
  const preview = document.querySelector('#asciiPreview')?.textContent;
  const metadata = document.querySelector('#resultMeta')?.textContent;

  controller.updateCollapsible(true);
  expect(document.querySelector<HTMLTextAreaElement>('#output')?.value).toContain('<details open>');
  expect(document.querySelector<HTMLTextAreaElement>('#output')?.value).toContain(
    '<summary>demo</summary>',
  );
  expect(document.querySelector('#asciiPreview')?.textContent).toBe(preview);
  expect(document.querySelector('#resultMeta')?.textContent).toBe(metadata);

  controller.updateCollapsible(false);
  expect(document.querySelector<HTMLTextAreaElement>('#output')?.value).not.toContain('<details');
  controller.dispose();
});

it('ignores collapsible refreshes without available output and after disposal', () => {
  const controller = createOutputController({
    document,
    window,
    navigator,
    urlApi: URL,
    setStatus: vi.fn(),
  });
  const output = document.querySelector<HTMLTextAreaElement>('#output')!;

  controller.updateCollapsible(true);
  expect(output.value).toBe('');
  expect(document.querySelector<HTMLButtonElement>('#copyButton')?.disabled).toBe(true);

  controller.showGenerated({
    art: 'A',
    width: 1,
    height: 1,
    imageName: 'demo',
    options: optionsForPreset('readme'),
    collapsible: false,
  });
  controller.showError('render failed');
  controller.updateCollapsible(true);
  expect(output.value).toBe('render failed');

  controller.dispose();
  controller.updateCollapsible(true);
  expect(output.value).toBe('render failed');
});

it('switches formats, reports copy outcomes, and downloads the selected format', async () => {
  const copy = vi.fn(async () => true);
  const download = vi.fn();
  const setStatus = vi.fn();
  const controller = createOutputController({
    document,
    window,
    navigator,
    urlApi: URL,
    setStatus,
    copy,
    download,
  });
  controller.showGenerated({
    art: 'A',
    width: 1,
    height: 1,
    imageName: 'demo',
    options: optionsForPreset('readme'),
    collapsible: false,
  });

  document.querySelector<HTMLButtonElement>('[data-output="text"]')!.click();
  expect(document.querySelector<HTMLButtonElement>('#copyButton')!.textContent).toBe('Copy ASCII');
  document.querySelector<HTMLButtonElement>('[data-output="markdown"]')!.click();
  expect(document.querySelector<HTMLButtonElement>('#copyButton')!.textContent).toBe(
    'Copy Markdown',
  );
  document.querySelector<HTMLButtonElement>('[data-output="svg"]')!.click();
  expect(document.querySelector<HTMLButtonElement>('#copyButton')!.textContent).toBe('Copy SVG');
  document.querySelector<HTMLButtonElement>('#copyButton')!.click();
  await vi.waitFor(() => expect(copy).toHaveBeenCalled());
  expect(setStatus).toHaveBeenCalledWith('Copied svg output to clipboard.');
  document.querySelector<HTMLButtonElement>('#downloadButton')!.click();
  expect(download).toHaveBeenCalledWith(
    expect.stringContaining('<svg'),
    'svg',
    'demo',
    document,
    URL,
  );
  controller.dispose();
});

it('reports the format captured when an asynchronous copy started', async () => {
  let finishCopy!: (value: boolean) => void;
  const copy = vi.fn(
    () =>
      new Promise<boolean>((resolveCopy) => {
        finishCopy = resolveCopy;
      }),
  );
  const setStatus = vi.fn();
  const controller = createOutputController({
    document,
    window,
    navigator,
    urlApi: URL,
    setStatus,
    copy,
  });
  controller.showGenerated({
    art: 'A',
    width: 1,
    height: 1,
    imageName: 'demo',
    options: optionsForPreset('readme'),
    collapsible: false,
  });

  document.querySelector<HTMLButtonElement>('#copyButton')!.click();
  await vi.waitFor(() => expect(copy).toHaveBeenCalled());
  document.querySelector<HTMLButtonElement>('[data-output="svg"]')!.click();
  finishCopy(true);
  await vi.waitFor(() =>
    expect(setStatus).toHaveBeenCalledWith('Copied markdown output to clipboard.'),
  );
  expect(document.querySelector<HTMLButtonElement>('#copyButton')?.textContent).toBe('Copied');
  controller.dispose();
  expect(document.querySelector<HTMLButtonElement>('#copyButton')?.textContent).toBe('Copy SVG');
});

it('suppresses stale copy completions after output lifecycle changes', async () => {
  const finishCopies: Array<(value: boolean) => void> = [];
  const copy = vi.fn(
    () =>
      new Promise<boolean>((resolveCopy) => {
        finishCopies.push(resolveCopy);
      }),
  );
  const setStatus = vi.fn();
  const controller = createOutputController({
    document,
    window,
    navigator,
    urlApi: URL,
    setStatus,
    copy,
  });
  const generated = {
    art: 'A',
    width: 1,
    height: 1,
    imageName: 'demo',
    options: optionsForPreset('readme'),
    collapsible: false,
  };
  controller.showGenerated(generated);

  document.querySelector<HTMLButtonElement>('#copyButton')!.click();
  await vi.waitFor(() => expect(copy).toHaveBeenCalledTimes(1));
  controller.invalidate();
  finishCopies[0]!(true);
  await Promise.resolve();

  controller.showGenerated(generated);
  document.querySelector<HTMLButtonElement>('#copyButton')!.click();
  await vi.waitFor(() => expect(copy).toHaveBeenCalledTimes(2));
  controller.showError('new render failed');
  finishCopies[1]!(false);
  await Promise.resolve();

  expect(setStatus).not.toHaveBeenCalled();
  expect(document.querySelector('#asciiPreview')?.textContent).toBe('new render failed');
  controller.dispose();
});

it('only reports the latest contextual clipboard operation when copies finish out of order', async () => {
  const finishCopies: Array<(value: boolean) => void> = [];
  const copy = vi.fn(
    () =>
      new Promise<boolean>((resolveCopy) => {
        finishCopies.push(resolveCopy);
      }),
  );
  const setStatus = vi.fn();
  const controller = createOutputController({
    document,
    window,
    navigator,
    urlApi: URL,
    setStatus,
    copy,
  });
  controller.showGenerated({
    art: 'A',
    width: 1,
    height: 1,
    imageName: 'demo',
    options: optionsForPreset('readme'),
    collapsible: false,
  });

  document.querySelector<HTMLButtonElement>('#copyButton')!.click();
  document.querySelector<HTMLButtonElement>('[data-output="svg"]')!.click();
  document.querySelector<HTMLButtonElement>('#copyButton')!.click();
  await vi.waitFor(() => expect(copy).toHaveBeenCalledTimes(2));
  finishCopies[1]!(true);
  await vi.waitFor(() => expect(setStatus).toHaveBeenCalledWith('Copied svg output to clipboard.'));
  finishCopies[0]!(false);
  await Promise.resolve();

  expect(setStatus).toHaveBeenCalledTimes(1);
  expect(document.querySelector<HTMLButtonElement>('#copyButton')?.textContent).toBe('Copied');
  controller.dispose();
  expect(document.querySelector<HTMLButtonElement>('#copyButton')?.textContent).toBe('Copy SVG');
});

it('shows errors and suppresses late clipboard feedback after disposal', async () => {
  let finishCopy!: (value: boolean) => void;
  const copy = vi.fn(
    () =>
      new Promise<boolean>((resolveCopy) => {
        finishCopy = resolveCopy;
      }),
  );
  const setStatus = vi.fn();
  const controller = createOutputController({
    document,
    window,
    navigator,
    urlApi: URL,
    setStatus,
    copy,
  });
  controller.showGenerated({
    art: 'A',
    width: 1,
    height: 1,
    imageName: 'demo',
    options: optionsForPreset('readme'),
    collapsible: false,
  });
  document.querySelector<HTMLButtonElement>('#copyButton')!.click();
  await vi.waitFor(() => expect(copy).toHaveBeenCalled());
  controller.dispose();
  finishCopy(false);
  await Promise.resolve();
  expect(setStatus).not.toHaveBeenCalledWith(expect.stringContaining('failed'));

  const second = createOutputController({ document, window, navigator, urlApi: URL, setStatus });
  second.showGenerated({
    art: 'stale',
    width: 5,
    height: 1,
    imageName: 'stale',
    options: optionsForPreset('readme'),
    collapsible: false,
  });
  second.showError('worker failed');
  expect(document.querySelector('#asciiPreview')?.textContent).toBe('worker failed');
  expect(document.querySelector<HTMLTextAreaElement>('#output')?.value).toBe('worker failed');
  document.querySelector<HTMLButtonElement>('[data-output="svg"]')!.click();
  expect(document.querySelector<HTMLTextAreaElement>('#output')?.value).toBe('worker failed');
  second.dispose();
});

it('removes tab and action listeners idempotently', () => {
  const controller = createOutputController({
    document,
    window,
    navigator,
    urlApi: URL,
    setStatus: vi.fn(),
  });
  controller.dispose();
  controller.dispose();
  document.querySelector<HTMLButtonElement>('[data-output="text"]')!.click();
  expect(document.querySelector('[data-output="markdown"]')?.getAttribute('aria-pressed')).toBe(
    'true',
  );
});

it('reports unavailable copy and download actions when invoked defensively', async () => {
  const setStatus = vi.fn();
  const controller = createOutputController({
    document,
    window,
    navigator,
    urlApi: URL,
    setStatus,
    download: vi.fn(),
  });
  const copy = document.querySelector<HTMLButtonElement>('#copyButton')!;
  const download = document.querySelector<HTMLButtonElement>('#downloadButton')!;
  for (const button of [copy, download]) button.disabled = false;
  copy.click();
  download.click();
  await Promise.resolve();
  expect(setStatus).toHaveBeenCalledWith('No generated output is available to copy.', 'error');
  expect(setStatus).toHaveBeenCalledWith('No generated output is available to download.', 'error');
  controller.dispose();
});

it('covers contextual copy success and clipboard failure feedback', async () => {
  const copy = vi
    .fn<(text: string, navigator: Navigator, document: Document) => Promise<boolean>>()
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false);
  const setStatus = vi.fn();
  const controller = createOutputController({
    document,
    window,
    navigator,
    urlApi: URL,
    setStatus,
    copy,
  });
  controller.showGenerated({
    art: 'A',
    width: 1,
    height: 1,
    imageName: 'demo',
    options: optionsForPreset('readme'),
    collapsible: false,
  });
  const copyButton = document.querySelector<HTMLButtonElement>('#copyButton')!;
  copyButton.click();
  await vi.waitFor(() =>
    expect(setStatus).toHaveBeenCalledWith('Copied markdown output to clipboard.'),
  );
  copyButton.click();
  await vi.waitFor(() =>
    expect(setStatus).toHaveBeenCalledWith(
      'Copy failed. Select the generated output and copy it manually.',
      'error',
    ),
  );
  controller.dispose();
});

it('uses the default format fallback and ignores public updates after disposal', () => {
  const controller = createOutputController({
    document,
    window,
    navigator,
    urlApi: URL,
    setStatus: vi.fn(),
  });
  const text = document.querySelector<HTMLButtonElement>('[data-output="text"]')!;
  text.removeAttribute('data-output');
  text.click();
  expect(document.querySelector('[data-output="markdown"]')?.getAttribute('aria-pressed')).toBe(
    'true',
  );
  const previewBefore = document.querySelector('#asciiPreview')?.textContent;
  const outputBefore = document.querySelector<HTMLTextAreaElement>('#output')?.value;
  const copyDisabledBefore = document.querySelector<HTMLButtonElement>('#copyButton')?.disabled;
  controller.dispose();
  controller.invalidate();
  controller.showGenerated({
    art: 'late',
    width: 1,
    height: 1,
    imageName: 'late',
    options: optionsForPreset('readme'),
    collapsible: false,
  });
  controller.showError('late error');
  expect(document.querySelector('#asciiPreview')?.textContent).toBe(previewBefore);
  expect(document.querySelector<HTMLTextAreaElement>('#output')?.value).toBe(outputBefore);
  expect(document.querySelector<HTMLButtonElement>('#copyButton')?.disabled).toBe(
    copyDisabledBefore,
  );
});

it('fails fast when a required output element is missing', () => {
  document.querySelector('#formatHint')!.remove();
  expect(() =>
    createOutputController({
      document,
      window,
      navigator,
      urlApi: URL,
      setStatus: vi.fn(),
    }),
  ).toThrow('Missing required element: #formatHint');
});
