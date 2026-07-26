import type { AsciiOptions, OutputFormat } from '../core/types.js';
import { resolveCharacterStyleId } from '../core/character-styles.js';
import { toMarkdown } from '../core/markdown.js';
import { createCopiedFeedback } from './copied-feedback.js';
import { copyText, downloadGenerated, generatedOutputs, type GeneratedOutputs } from './output.js';

export interface GeneratedOutputInput {
  art: string;
  width: number;
  height: number;
  imageName: string;
  options: AsciiOptions;
  collapsible: boolean;
}

export interface OutputControllerDependencies {
  document: Document;
  window: Window;
  navigator: Navigator;
  urlApi: typeof URL;
  setStatus(message: string, state?: 'ready' | 'busy' | 'error'): void;
  copy?: typeof copyText;
  download?: typeof downloadGenerated;
}

export interface OutputController {
  invalidate(): void;
  showGenerated(input: GeneratedOutputInput): void;
  updateCollapsible(collapsible: boolean): void;
  showError(message: string): void;
  dispose(): void;
}

const FORMAT_LABELS: Record<OutputFormat, { copy: string; download: string; hint: string }> = {
  text: {
    copy: 'Copy ASCII',
    download: 'Download .txt',
    hint: 'Plain text. Wrap it in a fenced code block before pasting into a README.',
  },
  markdown: {
    copy: 'Copy Markdown',
    download: 'Download .md',
    hint: 'Paste directly into README.md. The fence length is chosen automatically so ASCII punctuation cannot break the block.',
  },
  svg: {
    copy: 'Copy SVG',
    download: 'Download .svg',
    hint: 'Save beside your README, then embed it with: ![ASCII art](./ascii-art.svg)',
  },
};

function glyphSummary(options: AsciiOptions): string {
  const style = resolveCharacterStyleId(options);
  if (style === 'braille') return 'Braille 2×4 subcells';
  if (style === 'structure') return 'Structural Unicode';
  return `${Array.from(options.ramp).length} glyph levels`;
}

export function createOutputController(
  dependencies: OutputControllerDependencies,
): OutputController {
  const { document, window, navigator, urlApi, setStatus } = dependencies;
  const copy = dependencies.copy ?? copyText;
  const download = dependencies.download ?? downloadGenerated;

  function element<T extends HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (!found) throw new Error(`Missing required element: #${id}`);
    return found as T;
  }

  const asciiPreview = element<HTMLElement>('asciiPreview');
  const resultMeta = element<HTMLElement>('resultMeta');
  const output = element<HTMLTextAreaElement>('output');
  const formatHint = element<HTMLElement>('formatHint');
  const copyButton = element<HTMLButtonElement>('copyButton');
  const downloadButton = element<HTMLButtonElement>('downloadButton');
  const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-output]'));
  const copiedFeedback = createCopiedFeedback(window);

  let selectedFormat: OutputFormat = 'markdown';
  let generated: GeneratedOutputs = { text: '', markdown: '', svg: '' };
  let lastGeneratedInput: GeneratedOutputInput | null = null;
  let imageName = 'ascii-art';
  let available = false;
  let errorMessage: string | null = null;
  let outputRevision = 0;
  let copyRevision = 0;
  let disposed = false;

  function refresh(): void {
    output.value = errorMessage ?? generated[selectedFormat];
    const label = FORMAT_LABELS[selectedFormat];
    copiedFeedback.reset(copyButton);
    copyButton.textContent = label.copy;
    copyButton.disabled = !available;
    downloadButton.disabled = !available;
    downloadButton.textContent = label.download;
    formatHint.textContent = label.hint;

    for (const button of tabButtons) {
      const active = button.dataset.output === selectedFormat;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  function invalidate(): void {
    if (disposed) return;
    outputRevision += 1;
    available = false;
    errorMessage = null;
    refresh();
  }

  async function copySelected(): Promise<void> {
    if (disposed) return;
    if (!available) {
      setStatus('No generated output is available to copy.', 'error');
      return;
    }
    const format = selectedFormat;
    const revision = outputRevision;
    const operationRevision = ++copyRevision;
    const copied = await copy(generated[format], navigator, document);
    if (disposed || revision !== outputRevision || operationRevision !== copyRevision) return;
    if (!copied) {
      setStatus('Copy failed. Select the generated output and copy it manually.', 'error');
      return;
    }
    copiedFeedback.show(copyButton);
    setStatus(`Copied ${format} output to clipboard.`);
  }

  function downloadSelected(): void {
    if (disposed) return;
    if (!available) {
      setStatus('No generated output is available to download.', 'error');
      return;
    }
    download(generated[selectedFormat], selectedFormat, imageName, document, urlApi);
  }

  const onOutputTabClick = (event: MouseEvent): void => {
    const button = event.currentTarget as HTMLButtonElement;
    selectedFormat = (button.dataset.output ?? 'markdown') as OutputFormat;
    refresh();
  };
  const onCopySelectedClick = (): void => void copySelected();

  for (const button of tabButtons) button.addEventListener('click', onOutputTabClick);
  copyButton.addEventListener('click', onCopySelectedClick);
  downloadButton.addEventListener('click', downloadSelected);
  refresh();

  return {
    invalidate,

    showGenerated(input): void {
      if (disposed) return;
      outputRevision += 1;
      generated = generatedOutputs(input.art, input.imageName, input.options, input.collapsible);
      lastGeneratedInput = input;
      imageName = input.imageName;
      available = true;
      errorMessage = null;
      asciiPreview.textContent = input.art;
      resultMeta.textContent = `${input.width} columns × ${input.height} rows · ${glyphSummary(input.options)} · ${input.options.dither}`;
      refresh();
    },

    updateCollapsible(collapsible): void {
      if (
        disposed ||
        !available ||
        !lastGeneratedInput ||
        lastGeneratedInput.collapsible === collapsible
      ) {
        return;
      }
      outputRevision += 1;
      lastGeneratedInput = { ...lastGeneratedInput, collapsible };
      generated = {
        ...generated,
        markdown: toMarkdown(lastGeneratedInput.art, {
          collapsible,
          open: true,
          summary: lastGeneratedInput.imageName,
        }),
      };
      refresh();
    },

    showError(message): void {
      if (disposed) return;
      outputRevision += 1;
      available = false;
      errorMessage = message;
      refresh();
      asciiPreview.textContent = message;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const button of tabButtons) button.removeEventListener('click', onOutputTabClick);
      copyButton.removeEventListener('click', onCopySelectedClick);
      downloadButton.removeEventListener('click', downloadSelected);
      copiedFeedback.dispose();
    },
  };
}
