import type { PresetControllerSnapshot } from './preset-controller.js';

export interface PresetListView {
  list: HTMLDivElement;
  count: HTMLElement;
  state: HTMLElement;
  updateButton: HTMLButtonElement;
  exportButton: HTMLButtonElement;
  undoButton: HTMLButtonElement;
}

export interface PresetListCallbacks {
  onSelect(name: string): void;
  onApply(name: string): void;
  onDelete(name: string): void;
}

function element<T extends HTMLElement>(document: Document, id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing required element: #${id}`);
  return found as T;
}

export function createPresetListView(document: Document): PresetListView {
  return {
    list: element(document, 'customPresetList'),
    count: element(document, 'customPresetCount'),
    state: element(document, 'customPresetState'),
    updateButton: element(document, 'updateCustomPreset'),
    exportButton: element(document, 'exportCustomPreset'),
    undoButton: element(document, 'undoDeletePreset'),
  };
}

export function renderPresetState(
  view: PresetListView,
  snapshot: PresetControllerSnapshot,
  dirty: boolean,
): void {
  const isEditingSelectedPreset =
    snapshot.activeName !== null && snapshot.activeName === snapshot.selectedName;
  const canUpdateSelectedPreset = isEditingSelectedPreset && dirty;
  view.count.textContent = String(snapshot.presets.length);
  view.exportButton.disabled = snapshot.selectedName === null;
  view.undoButton.hidden = !snapshot.undoAvailable;
  view.updateButton.disabled = !canUpdateSelectedPreset;
  view.state.classList.toggle('active', isEditingSelectedPreset && !dirty);
  view.state.classList.toggle('dirty', dirty);

  if (dirty && isEditingSelectedPreset) view.state.textContent = 'Unsaved changes';
  else if (dirty) view.state.textContent = `Unsaved changes in ${snapshot.activeName}.`;
  else if (!snapshot.selectedName) view.state.textContent = 'No preset selected';
  else if (isEditingSelectedPreset) view.state.textContent = 'Saved';
  else view.state.textContent = 'Selected for export';
}

export function renderPresetListView(
  view: PresetListView,
  snapshot: PresetControllerSnapshot,
  dirty: boolean,
  callbacks: PresetListCallbacks,
): void {
  renderPresetState(view, snapshot, dirty);
  view.list.replaceChildren();
  const document = view.list.ownerDocument;

  if (snapshot.presets.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-presets';
    empty.textContent = 'No saved presets in this browser.';
    view.list.append(empty);
    return;
  }

  for (const preset of snapshot.presets) {
    const row = document.createElement('div');
    row.className = `custom-preset-row${preset.name === snapshot.selectedName ? ' selected' : ''}`;
    row.setAttribute('role', 'listitem');

    const select = document.createElement('button');
    select.className = 'preset-select';
    select.type = 'button';
    select.textContent = preset.name;
    select.setAttribute('aria-pressed', String(preset.name === snapshot.selectedName));
    select.setAttribute('aria-label', `Select saved preset ${preset.name}`);
    select.addEventListener('click', () => callbacks.onSelect(preset.name));

    const apply = document.createElement('button');
    apply.className = 'row-action';
    apply.type = 'button';
    apply.textContent = 'Apply';
    apply.setAttribute('aria-label', `Apply saved preset ${preset.name}`);
    apply.addEventListener('click', () => callbacks.onApply(preset.name));

    const remove = document.createElement('button');
    remove.className = 'row-action delete';
    remove.type = 'button';
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', `Delete saved preset ${preset.name}`);
    remove.addEventListener('click', () => callbacks.onDelete(preset.name));

    row.append(select, apply, remove);
    view.list.append(row);
  }
}
