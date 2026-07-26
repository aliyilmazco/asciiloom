import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function page(): Promise<string> {
  return readFile(new URL('../index.html', import.meta.url), 'utf8');
}

async function mainSource(): Promise<string> {
  const [main, app, outputController, presetWorkflow] = await Promise.all([
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/browser/app.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/browser/output-controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/browser/preset-workflow.ts', import.meta.url), 'utf8'),
  ]);
  return `${main}\n${app}\n${outputController}\n${presetWorkflow}`;
}

async function styleSource(): Promise<string> {
  return readFile(new URL('../src/style.css', import.meta.url), 'utf8');
}

async function controlsSource(): Promise<string> {
  return readFile(new URL('../src/browser/controls.ts', import.meta.url), 'utf8');
}

async function styleSheet(): Promise<string> {
  return readFile(new URL('../src/style.css', import.meta.url), 'utf8');
}

describe('output format control accessibility', () => {
  it('uses state buttons instead of incomplete tab semantics', async () => {
    const html = await page();
    expect(html).toContain('role="group" aria-label="Output format"');
    expect(html).toContain('data-output="markdown" aria-pressed="true"');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tab"');
  });

  it('announces status changes and relates generated output to its hint', async () => {
    const html = await page();
    expect(html).toMatch(/id="status"\s+class="status-pill"\s+role="status"\s+aria-live="polite"/u);
    expect(html).toMatch(
      /id="output"\s+readonly\s+spellcheck="false"\s+aria-label="Generated output"\s+aria-describedby="formatHint"/u,
    );
    expect(html).toContain(
      'id="copyButton" class="button primary" type="button">Copy Markdown</button>',
    );
    expect(html).not.toContain('id="copyReadmeButton"');
  });
});

describe('terminal workspace contract', () => {
  it('uses designed custom dropdowns instead of operating-system select popups', async () => {
    const html = await page();
    const css = await styleSheet();

    expect(html).not.toMatch(/<select\b/u);
    expect(html.match(/role="combobox"/gu)).toHaveLength(3);
    expect(html.match(/role="listbox"/gu)).toHaveLength(3);

    for (const [id, name] of [
      ['preset', 'builtInPreset'],
      ['characterStyle', 'characterStyle'],
      ['dither', 'dither'],
    ]) {
      expect(html).toContain(`data-dropdown="${id}"`);
      expect(html).toMatch(new RegExp(`id="${id}"\\s+name="${name}"\\s+type="hidden"`, 'u'));
      expect(html).toContain(`aria-controls="${id}Listbox"`);
      expect(html).toContain(`id="${id}Listbox"`);
    }

    expect(css).toMatch(/\.dropdown-trigger\s*\{[^}]*min-height:\s*44px;/su);
    expect(css).toMatch(/\.dropdown-popover\s*\{[^}]*position:\s*absolute;/su);
    expect(css).toMatch(/\.dropdown-listbox\s*\{[^}]*overflow-y:\s*auto;/su);
    expect(css).toMatch(/\.dropdown-value-preview\s*\{[^}]*grid-column:\s*3;/su);
    expect(css).toMatch(/\.dropdown-chevron\s*\{[^}]*grid-column:\s*4;/su);

    const source = await mainSource();
    const controls = await controlsSource();
    expect(source).not.toContain('HTMLSelectElement');
    expect(controls).not.toContain('HTMLSelectElement');
    expect(source).not.toContain("createElement('option')");
    expect(controls).not.toContain("createElement('option')");
    expect(source).toContain("presetDropdown.input.addEventListener('input'");
    expect(source).toContain('conversionControls.dispose();');
  });

  it('keeps all conversion controls in the locked terminal groups', async () => {
    const html = await page();

    expect(html).toContain('INPUT / TUNING');
    expect(html).toContain('OUTPUT / EXPORT');
    for (const group of ['SOURCE', 'GEOMETRY', 'TONE', 'STRUCTURE']) {
      expect(html).toContain(`>${group}</h3>`);
    }
    for (const id of [
      'fileInput',
      'width',
      'aspect',
      'characterStyle',
      'background',
      'dither',
      'edgeGlyphs',
      'collapsible',
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('exposes separate saved-preset controls with accessible import and export actions', async () => {
    const html = await page();

    expect(html).toContain('BUILT-IN PRESETS');
    expect(html).toContain('SAVED PRESETS');
    expect(html).toMatch(
      /id="customPresetList"\s+class="custom-preset-list"\s+role="list"\s+aria-label="Saved presets"/u,
    );
    expect(html).toContain('id="customPresetForm" class="save-preset-form"');
    expect(html).toMatch(
      /id="customPresetName"\s+name="presetName"\s+type="text"\s+maxlength="80"/u,
    );
    expect(html).toContain('id="exportCustomPreset" class="button" type="button" disabled');
    expect(html).toMatch(/id="updateCustomPreset"[^>]*disabled>[\s\S]*?Update Preset/u);
    expect(html).toMatch(/id="customPresetState"\s+class="preset-state"\s+aria-live="polite"/u);
    expect(html).toMatch(/id="importCustomPresetButton"[^>]*>[\s\S]*?Import JSON/u);
    expect(html).toMatch(
      /id="importCustomPreset"[\s\S]*?accept="application\/json,.json"\s+hidden/u,
    );
    expect(html).toMatch(
      /id="presetNotice"\s+class="preset-notice"\s+role="status"\s+aria-live="polite"/u,
    );
    expect(html).toMatch(/id="undoDeletePreset"[^>]*hidden>[\s\S]*?Undo Delete/u);
  });

  it('provides skip navigation and stable source-image dimensions', async () => {
    const html = await page();

    expect(html).toContain('class="skip-link" href="#workspace"');
    expect(html).toContain('<main id="workspace" class="workspace">');
    expect(html).toContain('id="dropZone" class="drop-zone" for="fileInput"');
    expect(html).not.toContain('class="drop-zone" for="fileInput" role="button"');
    expect(html).toMatch(
      /id="fileInput"\s+class="file-input-overlay"\s+name="sourceImage"\s+type="file"\s+accept="image\/\*"\s+aria-label="Choose source image"/u,
    );
    expect(html).toContain(
      'id="sourcePreview" width="960" height="600" alt="Selected source preview"',
    );
    expect(html).toContain('PNG, JPEG, WebP, GIF · max 32 MiB / 40 MP');
  });

  it('matches browser chrome and wraps long source names', async () => {
    const html = await page();
    const css = await styleSource();

    expect(html).toContain('<meta name="theme-color" content="#020201" />');
    expect(css).toContain('--faint: #a99b70;');
    expect(css).toMatch(/\.meta-line \{[^}]*overflow-wrap: anywhere;/u);
  });

  it('gives interactive conversion controls stable form names', async () => {
    const html = await page();

    for (const name of [
      'sourceImage',
      'builtInPreset',
      'outputWidth',
      'characterAspect',
      'characterStyle',
      'backgroundColor',
      'contrast',
      'gamma',
      'detail',
      'brightness',
      'autoLevels',
      'invert',
      'dither',
      'edgeGlyphs',
      'collapsible',
    ]) {
      expect(html).toContain(`name="${name}"`);
    }
  });

  it('keeps range labels stable while hiding visual value outputs from accessible names', async () => {
    const html = await page();

    for (const id of ['width', 'aspect', 'contrast', 'gamma', 'detail', 'brightness']) {
      const labelId = `${id}Label`;
      const valueId = `${id}Value`;
      expect(html).toMatch(new RegExp(`<label class="field" for="${id}">`, 'u'));
      expect(html).toMatch(new RegExp(`<span id="${labelId}"[^>]*>`, 'u'));
      expect(html).toMatch(
        new RegExp(`<output id="${valueId}" aria-hidden="true">[^<]*</output>`, 'u'),
      );
      expect(html).toMatch(new RegExp(`id="${id}"[\\s\\S]*?aria-labelledby="${labelId}"`, 'u'));
    }
  });

  it('offers one contextual copy action instead of duplicate copy controls', async () => {
    const html = await page();

    expect(html).not.toContain('Copy README Markdown');
    expect(html).not.toContain('Copy Selected');
    expect(html.match(/id="copyButton"/gu)).toHaveLength(1);
  });

  it('renders the live ASCII preview in the normal text color', async () => {
    const css = await styleSheet();

    expect(css).toMatch(/#asciiPreview\s*{[^}]*color:\s*var\(--text\);/s);
  });

  it('keeps desktop output spacious while reducing duplicate mobile output height', async () => {
    const css = await styleSheet();
    const compactMediaStart = css.indexOf(
      '@media (max-width: 640px), (max-width: 980px) and (max-height: 500px)',
    );
    const compactMediaEnd = css.indexOf('@media (pointer: coarse)', compactMediaStart);
    const compactMedia = css.slice(compactMediaStart, compactMediaEnd);

    expect(css).toMatch(/#output\s*\{[^}]*min-height:\s*390px;/u);
    expect(compactMediaStart).toBeGreaterThan(-1);
    expect(compactMedia).toMatch(/\.preview-frame\s*\{[^}]*min-height:\s*240px;/u);
    expect(compactMedia).toMatch(
      /#output\s*\{[^}]*min-height:\s*min\(180px, 42dvh\);[^}]*max-height:\s*42dvh;/u,
    );
  });

  it('provides persistent destructive styling and touch-sized readable mobile controls', async () => {
    const css = await styleSheet();
    const compactMediaStart = css.indexOf(
      '@media (max-width: 640px), (max-width: 980px) and (max-height: 500px)',
    );
    const compactMediaEnd = css.indexOf('@media (pointer: coarse)', compactMediaStart);
    const compactMedia = css.slice(compactMediaStart, compactMediaEnd);

    expect(css).toMatch(
      /\.row-action\.delete\s*\{[^}]*border-color:\s*#9d4b4b;[^}]*color:\s*var\(--danger\);/su,
    );
    expect(css).toMatch(
      /@media \(max-width: 640px\) \{[\s\S]*?\.button,[\s\S]*?\.switch-field\s*\{[^}]*min-height:\s*44px;/u,
    );
    expect(css).toMatch(
      /@media \(pointer: coarse\) \{[\s\S]*?\.button,[\s\S]*?\.switch-field\s*\{[^}]*min-height:\s*44px;/u,
    );
    expect(compactMedia).toMatch(
      /\.dropdown-meta,[\s\S]*?\.preset-state\s*\{[^}]*font-size:\s*0\.68rem;/u,
    );
    expect(compactMedia).toMatch(/\.button,[\s\S]*?\.result-meta\s*\{[^}]*font-size:\s*0\.75rem;/u);
  });

  it('clears custom-preset editing state when a built-in preset is applied', async () => {
    const source = await mainSource();

    expect(source).toContain('presetController.clearSelection();');
  });

  it('preserves hidden conversion settings and the active dirty preset lifecycle', async () => {
    const source = await mainSource();
    const controls = await controlsSource();

    for (const option of ['lowPercentile', 'highPercentile', 'edgeThreshold', 'trimLineEnds']) {
      expect(controls).toContain(`${option}: options.${option}`);
    }
    expect(controls).toContain('...retainedOptions');
    for (const option of ['ramp', 'renderMode', 'edgeGlyphs', 'edgeStyle']) {
      expect(controls).toContain(`${option}: options.${option}`);
    }
    expect(controls).toContain('...retainedGlyphOptions');
    expect(source).toContain("presetDropdown.setValue('custom');");
    expect(source).toContain("window.addEventListener('beforeunload'");
  });

  it('uses worker rendering, guards editable paste, and avoids duplicate control scheduling', async () => {
    const source = await mainSource();

    expect(source).toContain('createRenderClient(');
    expect(source).toContain('await renderClient.render({');
    expect(source).not.toContain('convertRgbaToAscii');
    expect(source).toContain('if (isEditablePasteTarget(event.target)) return;');
    expect(source.match(/control\.addEventListener\('input'/gu)).toHaveLength(1);
    expect(source).not.toContain("control.addEventListener('change'");
  });

  it('keeps worker and bitmap resources alive across back-forward cache navigation', async () => {
    const source = await mainSource();

    expect(source).toContain("window.addEventListener('pagehide', onPageHide);");
    expect(source).toContain('if (!event.persisted) dispose();');
  });

  it('announces preset feedback only in the preset live region', async () => {
    const source = await mainSource();
    const feedbackFunction = /function setFeedback[\s\S]*?\n  \}/u.exec(source)?.[0] ?? '';

    expect(feedbackFunction).toContain('presetNotice.textContent = message;');
    expect(feedbackFunction).not.toContain('setStatus(');
  });
});
