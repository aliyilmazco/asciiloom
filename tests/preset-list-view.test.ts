// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { addCustomPreset } from '../src/browser/custom-presets.js';
import {
  createPresetListView,
  renderPresetListView,
  renderPresetState,
} from '../src/browser/preset-list-view.js';
import { DEFAULT_OPTIONS } from '../src/core/presets.js';

function installView() {
  document.body.innerHTML = `
    <span id="customPresetCount"></span>
    <span id="customPresetState"></span>
    <button id="updateCustomPreset"></button>
    <button id="exportCustomPreset"></button>
    <button id="undoDeletePreset"></button>
    <div id="customPresetList"></div>
  `;
  return createPresetListView(document);
}

function preset(name: string) {
  return addCustomPreset([], name, {
    options: { ...DEFAULT_OPTIONS, background: { ...DEFAULT_OPTIONS.background } },
    collapsible: false,
  })[0]!;
}

describe('saved-preset list view', () => {
  it('renders state and delegates row actions without owning preset mutations', () => {
    const view = installView();
    const onSelect = vi.fn();
    const onApply = vi.fn();
    const onDelete = vi.fn();
    const tracked = preset('Tracked');

    renderPresetListView(
      view,
      {
        presets: [tracked],
        selectedName: 'Tracked',
        activeName: 'Tracked',
        undoAvailable: true,
      },
      false,
      { onSelect, onApply, onDelete },
    );

    expect(view.count.textContent).toBe('1');
    expect(view.state.textContent).toBe('Saved');
    expect(view.undoButton.hidden).toBe(false);
    expect(view.list.querySelector('.custom-preset-row')?.classList).toContain('selected');

    const buttons = view.list.querySelectorAll('button');
    buttons[0]!.click();
    buttons[1]!.click();
    buttons[2]!.click();
    expect(onSelect).toHaveBeenCalledWith('Tracked');
    expect(onApply).toHaveBeenCalledWith('Tracked');
    expect(onDelete).toHaveBeenCalledWith('Tracked');
  });

  it('updates dirty state without rebuilding the preset rows', () => {
    const view = installView();
    const row = document.createElement('div');
    view.list.append(row);

    renderPresetState(
      view,
      {
        presets: [preset('Tracked')],
        selectedName: 'Tracked',
        activeName: 'Tracked',
        undoAvailable: false,
      },
      true,
    );

    expect(view.state.textContent).toBe('Unsaved changes');
    expect(view.state.classList).toContain('dirty');
    expect(view.updateButton.disabled).toBe(false);
    expect(view.list.firstElementChild).toBe(row);
  });

  it('keeps unsaved active-preset state visible while another preset is selected for export', () => {
    const view = installView();

    renderPresetState(
      view,
      {
        presets: [preset('Active'), preset('Export')],
        selectedName: 'Export',
        activeName: 'Active',
        undoAvailable: false,
      },
      true,
    );

    expect(view.state.textContent).toBe('Unsaved changes in Active.');
    expect(view.state.classList).toContain('dirty');
    expect(view.updateButton.disabled).toBe(true);
    expect(view.exportButton.disabled).toBe(false);
  });

  it('renders an explicit empty state', () => {
    const view = installView();

    renderPresetListView(
      view,
      { presets: [], selectedName: null, activeName: null, undoAvailable: false },
      false,
      { onSelect: vi.fn(), onApply: vi.fn(), onDelete: vi.fn() },
    );

    expect(view.list.textContent).toContain('No saved presets in this browser.');
    expect(view.exportButton.disabled).toBe(true);
  });
});
