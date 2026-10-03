export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
  preview?: string;
  selectable?: boolean;
}

export interface DropdownController {
  readonly input: HTMLInputElement;
  readonly trigger: HTMLButtonElement;
  readonly value: string;
  setValue(value: string): void;
  open(): void;
  close(options?: { restoreFocus?: boolean }): void;
  destroy(): void;
}

interface RenderedOption {
  element: HTMLElement;
  option: DropdownOption;
  state: HTMLElement;
}

interface OptionListeners {
  element: HTMLElement;
  onClick: () => void;
  onPointerMove: () => void;
}

const openDropdowns = new WeakMap<Document, () => void>();
const TYPEAHEAD_RESET_MS = 600;

function element<T extends HTMLElement>(document: Document, id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing required dropdown element: #${id}`);
  return found as T;
}

function validateOptions(id: string, options: readonly DropdownOption[]): void {
  if (options.length === 0) throw new Error(`${id} dropdown requires at least one option.`);
  const values = new Set<string>();
  let selectableCount = 0;
  for (const option of options) {
    if (!option.value) throw new Error(`${id} dropdown options require a value.`);
    if (values.has(option.value)) {
      throw new Error(`${id} dropdown contains duplicate value "${option.value}".`);
    }
    values.add(option.value);
    if (option.selectable !== false) selectableCount += 1;
  }
  if (selectableCount === 0) {
    throw new Error(`${id} dropdown requires at least one selectable option.`);
  }
}

function createOptionElement(
  document: Document,
  id: string,
  option: DropdownOption,
  index: number,
): RenderedOption {
  const row = document.createElement('div');
  row.id = `${id}Option${index}`;
  row.className = 'dropdown-option';
  row.dataset.value = option.value;
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', 'false');

  const prompt = document.createElement('span');
  prompt.className = 'dropdown-option-prompt';
  prompt.setAttribute('aria-hidden', 'true');
  prompt.textContent = '›';

  const copy = document.createElement('span');
  copy.className = 'dropdown-option-copy';
  const label = document.createElement('strong');
  label.textContent = option.label;
  copy.append(label);
  if (option.description) {
    const description = document.createElement('small');
    description.textContent = option.description;
    copy.append(description);
  }

  const trailing = document.createElement('span');
  trailing.className = 'dropdown-option-trailing';
  if (option.preview) {
    const preview = document.createElement('span');
    preview.className = 'dropdown-option-preview';
    preview.setAttribute('aria-hidden', 'true');
    preview.textContent = option.preview;
    trailing.append(preview);
  }
  const state = document.createElement('span');
  state.className = 'dropdown-option-state';
  state.setAttribute('aria-hidden', 'true');
  trailing.append(state);

  row.append(prompt, copy, trailing);
  return { element: row, option, state };
}

export function createDropdown(
  document: Document,
  id: string,
  options: readonly DropdownOption[],
): DropdownController {
  validateOptions(id, options);

  const input = element<HTMLInputElement>(document, id);
  const trigger = element<HTMLButtonElement>(document, `${id}Trigger`);
  const value = element<HTMLElement>(document, `${id}Value`);
  const valueDescription = element<HTMLElement>(document, `${id}ValueDescription`);
  const valuePreview = document.getElementById(`${id}ValuePreview`) as HTMLElement | null;
  const popover = element<HTMLElement>(document, `${id}Popover`);
  const listbox = element<HTMLElement>(document, `${id}Listbox`);
  const meta = document.getElementById(`${id}Meta`) as HTMLElement | null;
  const root = input.parentElement;
  if (!(root instanceof HTMLElement) || root.dataset.dropdown !== id) {
    throw new Error(`Dropdown #${id} must be a direct child of [data-dropdown="${id}"].`);
  }

  const optionByValue = new Map(options.map((option) => [option.value, option]));
  const selectableOptions = options.filter((option) => option.selectable !== false);
  const showTriggerDescription = root.dataset.dropdownTriggerDescription !== 'false';
  const renderedOptions = selectableOptions.map((option, index) =>
    createOptionElement(document, id, option, index),
  );
  const optionListeners: OptionListeners[] = [];
  listbox.replaceChildren(...renderedOptions.map(({ element: row }) => row));
  if (meta) {
    const label = root.dataset.dropdownMeta ?? 'SELECT';
    meta.textContent = `${label} / ${selectableOptions.length} OPTIONS`;
  }

  let activeIndex = 0;
  let isOpen = false;
  let destroyed = false;
  let typeahead = '';
  let lastTypeaheadAt = 0;

  const selectedOption = (): DropdownOption => {
    const option = optionByValue.get(input.value);
    if (!option) throw new Error(`Unknown ${id} dropdown value "${input.value}".`);
    return option;
  };

  const renderSelection = (): void => {
    const selected = selectedOption();
    value.textContent = selected.label;
    valueDescription.textContent = showTriggerDescription ? (selected.description ?? '') : '';
    valueDescription.hidden = !showTriggerDescription || !selected.description;
    if (valuePreview) {
      valuePreview.textContent = selected.preview ?? '';
      valuePreview.hidden = !selected.preview;
    }
    root.dataset.value = selected.value;
    root.classList.toggle('is-modified', selected.selectable === false);

    for (const rendered of renderedOptions) {
      const isSelected = rendered.option.value === selected.value;
      rendered.element.classList.toggle('is-selected', isSelected);
      rendered.element.setAttribute('aria-selected', String(isSelected));
      rendered.state.textContent = isSelected ? '✓ SELECTED' : '';
    }
  };

  const updateActive = (nextIndex: number, scroll = true): void => {
    activeIndex = Math.max(0, Math.min(nextIndex, renderedOptions.length - 1));
    for (const [index, rendered] of renderedOptions.entries()) {
      rendered.element.classList.toggle('is-active', index === activeIndex);
    }
    if (!isOpen) return;
    const active = renderedOptions[activeIndex]!.element;
    trigger.setAttribute('aria-activedescendant', active.id);
    if (scroll && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' });
    }
  };

  const placePopover = (): void => {
    if (!isOpen) return;
    const rootRect = root.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const viewportHeight = document.defaultView?.innerHeight ?? 0;
    const availableBelow = viewportHeight - rootRect.bottom;
    const availableAbove = rootRect.top;
    const neededHeight = Math.min(popover.scrollHeight || popoverRect.height, 336) + 12;
    const opensUp = availableBelow < neededHeight && availableAbove > availableBelow;
    const availableOnChosenSide = opensUp ? availableAbove : availableBelow;
    const maxPopoverHeight = Math.max(0, Math.floor(availableOnChosenSide - 12));
    root.classList.toggle('opens-up', opensUp);
    root.style.setProperty('--dropdown-max-height', `${maxPopoverHeight}px`);
    root.style.setProperty(
      '--dropdown-listbox-max-height',
      `${Math.max(0, maxPopoverHeight - 30)}px`,
    );
  };

  const close = ({ restoreFocus = false }: { restoreFocus?: boolean } = {}): void => {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove('is-open', 'opens-up');
    popover.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    typeahead = '';
    if (openDropdowns.get(document) === closeFromRegistry) openDropdowns.delete(document);
    if (restoreFocus) trigger.focus();
  };

  const closeFromRegistry = (): void => close();

  const open = (): void => {
    if (destroyed || isOpen) return;
    openDropdowns.get(document)?.();
    isOpen = true;
    root.classList.add('is-open');
    popover.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.focus({ preventScroll: true });
    const selectedIndex = renderedOptions.findIndex(({ option }) => option.value === input.value);
    updateActive(selectedIndex >= 0 ? selectedIndex : 0, false);
    placePopover();
    openDropdowns.set(document, closeFromRegistry);
  };

  const commit = (index: number, restoreFocus = true): void => {
    const next = renderedOptions[index];
    if (!next || destroyed) return;
    const changed = input.value !== next.option.value;
    input.value = next.option.value;
    renderSelection();
    close({ restoreFocus });
    if (!changed) return;
    const EventConstructor = document.defaultView?.Event ?? Event;
    input.dispatchEvent(new EventConstructor('input', { bubbles: true }));
  };

  const move = (amount: number): void => {
    const count = renderedOptions.length;
    updateActive((activeIndex + amount + count) % count);
  };

  const onTriggerClick = (): void => {
    if (isOpen) close();
    else open();
  };

  const onTriggerKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) {
        open();
        if (event.key === 'ArrowUp') updateActive(renderedOptions.length - 1);
      } else {
        move(event.key === 'ArrowDown' ? 1 : -1);
      }
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      if (!isOpen) open();
      updateActive(event.key === 'Home' ? 0 : renderedOptions.length - 1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isOpen) commit(activeIndex);
      else open();
      return;
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      close({ restoreFocus: true });
      return;
    }

    if (event.key === 'Tab') {
      if (isOpen) commit(activeIndex, false);
      return;
    }

    if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const now = Date.now();
      typeahead = now - lastTypeaheadAt > TYPEAHEAD_RESET_MS ? event.key : typeahead + event.key;
      lastTypeaheadAt = now;
      const query = typeahead.toLocaleLowerCase();
      const matchIndex = renderedOptions.findIndex(({ option }) =>
        option.label.toLocaleLowerCase().startsWith(query),
      );
      if (matchIndex >= 0) {
        event.preventDefault();
        if (!isOpen) open();
        updateActive(matchIndex);
      }
    }
  };

  const onDocumentPointerDown = (event: PointerEvent): void => {
    if (isOpen && event.target instanceof Node && !root.contains(event.target)) close();
  };

  const onViewportChange = (): void => placePopover();

  for (const [index, rendered] of renderedOptions.entries()) {
    const onClick = (): void => commit(index);
    const onPointerMove = (): void => updateActive(index, false);
    rendered.element.addEventListener('click', onClick);
    rendered.element.addEventListener('pointermove', onPointerMove);
    optionListeners.push({ element: rendered.element, onClick, onPointerMove });
  }
  trigger.addEventListener('click', onTriggerClick);
  trigger.addEventListener('keydown', onTriggerKeydown);
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.defaultView?.addEventListener('resize', onViewportChange);
  document.addEventListener('scroll', onViewportChange, true);
  renderSelection();

  return {
    input,
    trigger,
    get value(): string {
      return input.value;
    },
    setValue(nextValue: string): void {
      if (!optionByValue.has(nextValue)) {
        throw new Error(`Unknown ${id} dropdown value "${nextValue}".`);
      }
      input.value = nextValue;
      renderSelection();
      if (isOpen) {
        const selectedIndex = renderedOptions.findIndex(({ option }) => option.value === nextValue);
        updateActive(selectedIndex >= 0 ? selectedIndex : 0);
      }
    },
    open,
    close,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      close();
      trigger.removeEventListener('click', onTriggerClick);
      trigger.removeEventListener('keydown', onTriggerKeydown);
      for (const listener of optionListeners) {
        listener.element.removeEventListener('click', listener.onClick);
        listener.element.removeEventListener('pointermove', listener.onPointerMove);
      }
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      document.defaultView?.removeEventListener('resize', onViewportChange);
      document.removeEventListener('scroll', onViewportChange, true);
    },
  };
}
