// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { CHARACTER_STYLE_ENTRIES, createConversionControls } from '../src/browser/controls.js';
import { CHARACTER_STYLES } from '../src/core/character-styles.js';
import { DEFAULT_OPTIONS, RAMPS } from '../src/core/presets.js';
import { optionsForPreset } from '../src/core/presets.js';

function dropdownShell(id: string, value: string): string {
  return `
    <span id="${id}Label">${id}</span>
    <div class="dropdown" data-dropdown="${id}" data-dropdown-meta="${id}">
      <input id="${id}" type="hidden" value="${value}" />
      <button
        id="${id}Trigger"
        type="button"
        role="combobox"
        aria-expanded="false"
        aria-controls="${id}Listbox"
        aria-labelledby="${id}Label ${id}Value"
      >
        <span id="${id}Value"></span>
        <small id="${id}ValueDescription"></small>
        <span id="${id}ValuePreview" hidden></span>
      </button>
      <div id="${id}Popover" hidden>
        <span id="${id}Meta"></span>
        <div id="${id}Listbox" role="listbox"></div>
      </div>
    </div>
  `;
}

function installControls(): void {
  document.body.innerHTML = `
    <span id="widthLabel">Width <output id="widthValue" aria-hidden="true"></output></span>
    <input id="width" value="88" aria-labelledby="widthLabel" />
    <span id="aspectLabel">Character aspect <output id="aspectValue" aria-hidden="true"></output></span>
    <input id="aspect" value="0.5" aria-labelledby="aspectLabel" />
    ${dropdownShell('characterStyle', 'readme')}
    ${dropdownShell('dither', 'atkinson')}
    <input id="background" value="#ffffff" />
    <span id="contrastLabel">Contrast <output id="contrastValue" aria-hidden="true"></output></span>
    <input id="contrast" value="1.08" aria-labelledby="contrastLabel" />
    <span id="gammaLabel">Gamma <output id="gammaValue" aria-hidden="true"></output></span>
    <input id="gamma" value="1" aria-labelledby="gammaLabel" />
    <span id="detailLabel">Local detail <output id="detailValue" aria-hidden="true"></output></span>
    <input id="detail" value="0.55" aria-labelledby="detailLabel" />
    <span id="brightnessLabel">Brightness <output id="brightnessValue" aria-hidden="true"></output></span>
    <input id="brightness" value="0" aria-labelledby="brightnessLabel" />
    <input id="autoLevels" type="checkbox" checked />
    <input id="invert" type="checkbox" />
    <input id="edgeGlyphs" type="checkbox" />
    <input id="collapsible" type="checkbox" />
  `;
}

describe('browser conversion controls', () => {
  it('applies and reads every visible option while retaining hidden options', () => {
    installControls();
    const controls = createConversionControls(document);
    const options = {
      ...DEFAULT_OPTIONS,
      width: 76,
      cellAspectRatio: 0.62,
      ramp: RAMPS.minimal,
      dither: 'none' as const,
      contrast: 1.3,
      gamma: 0.95,
      detail: 1.05,
      brightness: -0.1,
      autoLevels: false,
      invert: true,
      edgeGlyphs: true,
      edgeThreshold: 0.17,
      background: { r: 12, g: 34, b: 56 },
      trimLineEnds: false,
    };

    controls.apply(options);

    expect(controls.read()).toEqual(options);
    expect(document.querySelector<HTMLOutputElement>('#widthValue')!.value).toBe('76');
    expect(document.querySelector<HTMLOutputElement>('#aspectValue')!.value).toBe('0.62');
    expect(document.querySelector<HTMLInputElement>('#background')!.value).toBe('#0c2238');
    expect(document.querySelector('#characterStyleValue')?.textContent).toBe('Minimal ASCII');
    expect(document.querySelector('#ditherValue')?.textContent).toBe('None');

    controls.dispose();
  });

  it('exposes one event target for each render-affecting control', () => {
    installControls();
    const controls = createConversionControls(document);

    expect(controls.renderInputs.map((input) => input.id)).toEqual([
      'width',
      'aspect',
      'characterStyle',
      'dither',
      'background',
      'contrast',
      'gamma',
      'detail',
      'brightness',
      'autoLevels',
      'invert',
      'edgeGlyphs',
      'collapsible',
    ]);

    controls.dispose();
  });

  it('keeps stable range labels while exposing formatted current values', () => {
    installControls();
    const controls = createConversionControls(document);
    controls.apply({
      ...DEFAULT_OPTIONS,
      width: 96,
      contrast: 1.12,
      gamma: 1.04,
      detail: 0.8,
    });

    expect(document.querySelector('#width')?.getAttribute('aria-labelledby')).toBe('widthLabel');
    expect(document.querySelector('#width')?.getAttribute('aria-valuetext')).toBe('96');
    expect(document.querySelector('#contrast')?.getAttribute('aria-valuetext')).toBe('1.12');
    expect(document.querySelector('#widthValue')?.getAttribute('aria-hidden')).toBe('true');

    controls.dispose();
  });

  it('emits render input only for a user dropdown selection', () => {
    installControls();
    const controls = createConversionControls(document);
    const characterStyleInput = document.querySelector<HTMLInputElement>('#characterStyle')!;
    const onInput = vi.fn();
    characterStyleInput.addEventListener('input', onInput);

    controls.apply({ ...DEFAULT_OPTIONS, ramp: RAMPS.minimal });
    expect(onInput).not.toHaveBeenCalled();

    document.querySelector<HTMLButtonElement>('#characterStyleTrigger')!.click();
    document.querySelector<HTMLElement>('#characterStyleListbox [data-value="soft"]')!.click();

    expect(characterStyleInput.value).toBe('soft');
    expect(onInput).toHaveBeenCalledOnce();
    expect(controls.read().ramp).toBe(RAMPS.soft);

    controls.dispose();
  });

  it('exposes a display-only custom state and every selectable character style', () => {
    installControls();
    const controls = createConversionControls(document);

    expect(CHARACTER_STYLE_ENTRIES.map(({ value }) => value)).toEqual([
      'custom',
      ...CHARACTER_STYLES.map(({ id }) => id),
    ]);
    expect(
      Array.from(document.querySelectorAll('#characterStyleListbox [role="option"]')).map(
        (option) => option.getAttribute('data-value'),
      ),
    ).toEqual(CHARACTER_STYLES.map(({ id }) => id));

    controls.dispose();
  });

  it.each(CHARACTER_STYLES)('applies $id with one user input event', (style) => {
    installControls();
    const controls = createConversionControls(document);
    controls.apply({
      ...DEFAULT_OPTIONS,
      ramp: style.id === 'readme' ? RAMPS.minimal : RAMPS.readme,
    });
    const input = document.querySelector<HTMLInputElement>('#characterStyle')!;
    const onInput = vi.fn();
    input.addEventListener('input', onInput);

    document.querySelector<HTMLButtonElement>('#characterStyleTrigger')!.click();
    document
      .querySelector<HTMLElement>(`#characterStyleListbox [data-value="${style.id}"]`)!
      .click();

    expect(onInput).toHaveBeenCalledOnce();
    expect(controls.read()).toMatchObject(style.options);
    expect(document.querySelector<HTMLInputElement>('#edgeGlyphs')!.disabled).toBe(
      style.options.renderMode !== 'tone',
    );
    controls.dispose();
  });

  it('recognizes Logo as Minimal ASCII plus an independent ASCII edge overlay', () => {
    installControls();
    const controls = createConversionControls(document);

    controls.apply(optionsForPreset('logo'));

    expect(document.querySelector<HTMLInputElement>('#characterStyle')!.value).toBe('minimal');
    expect(document.querySelector<HTMLInputElement>('#edgeGlyphs')!.checked).toBe(true);
    expect(controls.read()).toEqual(optionsForPreset('logo'));
    controls.dispose();
  });

  it('returns Structural Unicode to its tonal fallback when its overlay is disabled', () => {
    installControls();
    const controls = createConversionControls(document);
    document.querySelector<HTMLButtonElement>('#characterStyleTrigger')!.click();
    document.querySelector<HTMLElement>('#characterStyleListbox [data-value="structure"]')!.click();
    const edgeGlyphs = document.querySelector<HTMLInputElement>('#edgeGlyphs')!;

    edgeGlyphs.checked = false;
    edgeGlyphs.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.querySelector<HTMLInputElement>('#characterStyle')!.value).toBe('minimal');
    expect(controls.read()).toMatchObject({
      ramp: RAMPS.minimal,
      renderMode: 'tone',
      edgeGlyphs: false,
      edgeStyle: 'ascii',
    });
    controls.dispose();
  });

  it('preserves an applied custom Structural Unicode fallback exactly', () => {
    installControls();
    const controls = createConversionControls(document);
    const custom = {
      ...DEFAULT_OPTIONS,
      ramp: 'custom ramp ',
      edgeGlyphs: true,
      edgeStyle: 'unicode' as const,
    };

    controls.apply(custom);

    expect(document.querySelector<HTMLInputElement>('#characterStyle')!.value).toBe('structure');
    expect(controls.read()).toEqual(custom);
    controls.dispose();
  });
});
