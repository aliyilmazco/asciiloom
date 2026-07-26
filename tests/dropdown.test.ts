// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { createDropdown, type DropdownOption } from '../src/browser/dropdown.js';

const OPTIONS: readonly DropdownOption[] = [
  { value: 'alpha', label: 'Alpha', description: 'First option' },
  { value: 'bravo', label: 'Bravo', description: 'Second option' },
  { value: 'charlie', label: 'Charlie', description: 'Third option' },
  {
    value: 'custom',
    label: 'Custom / modified settings',
    description: 'Current controls differ from a built-in option.',
    selectable: false,
  },
];

function dropdownMarkup(id = 'example', value = 'alpha'): string {
  return `
    <span id="${id}Label">EXAMPLE</span>
    <div class="dropdown" data-dropdown="${id}">
      <input id="${id}" name="exampleValue" type="hidden" value="${value}" />
      <button
        id="${id}Trigger"
        class="dropdown-trigger"
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded="false"
        aria-controls="${id}Listbox"
        aria-labelledby="${id}Label ${id}Value"
      >
        <span class="dropdown-rail" aria-hidden="true"></span>
        <span class="dropdown-value">
          <strong id="${id}Value"></strong>
          <small id="${id}ValueDescription"></small>
        </span>
        <span class="dropdown-chevron" aria-hidden="true"></span>
      </button>
      <div id="${id}Popover" class="dropdown-popover" hidden>
        <span id="${id}Meta" class="dropdown-meta"></span>
        <div id="${id}Listbox" class="dropdown-listbox" role="listbox" aria-labelledby="${id}Label"></div>
      </div>
    </div>
  `;
}

function installDropdown(id = 'example', value = 'alpha'): void {
  document.body.innerHTML = dropdownMarkup(id, value);
}

function key(target: HTMLElement, value: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: value });
  target.dispatchEvent(event);
  return event;
}

describe('custom dropdown', () => {
  it('renders the current value and listbox state without a native select', () => {
    installDropdown();
    const dropdown = createDropdown(document, 'example', OPTIONS);
    const listbox = document.querySelector<HTMLElement>('#exampleListbox')!;

    expect(dropdown.value).toBe('alpha');
    expect(dropdown.trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('#exampleValue')?.textContent).toBe('Alpha');
    expect(document.querySelector('#exampleValueDescription')?.textContent).toBe('First option');
    expect(listbox.querySelectorAll('[role="option"]')).toHaveLength(3);
    expect(listbox.querySelector('[data-value="alpha"]')?.getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(listbox.querySelector('[data-value="alpha"] .dropdown-option-state')?.textContent).toBe(
      '✓ SELECTED',
    );
    expect(listbox.textContent).not.toContain('Custom / modified settings');

    dropdown.open();
    expect(document.activeElement).toBe(dropdown.trigger);
    dropdown.close();

    dropdown.destroy();
  });

  it('navigates with the keyboard and commits one bubbling input event', () => {
    installDropdown();
    const dropdown = createDropdown(document, 'example', OPTIONS);
    const onInput = vi.fn();
    const onChange = vi.fn();
    dropdown.input.addEventListener('input', onInput);
    dropdown.input.addEventListener('change', onChange);
    dropdown.trigger.focus();
    dropdown.trigger.click();

    expect(dropdown.trigger.getAttribute('aria-expanded')).toBe('true');
    key(dropdown.trigger, 'ArrowDown');
    expect(dropdown.trigger.getAttribute('aria-activedescendant')).toBe('exampleOption1');
    key(dropdown.trigger, 'Enter');

    expect(dropdown.value).toBe('bravo');
    expect(document.querySelector('#exampleValue')?.textContent).toBe('Bravo');
    expect(dropdown.trigger.getAttribute('aria-expanded')).toBe('false');
    expect(dropdown.trigger.hasAttribute('aria-activedescendant')).toBe(false);
    expect(onInput).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();

    dropdown.destroy();
  });

  it('commits the active option on Tab without blocking normal focus navigation', () => {
    installDropdown();
    const dropdown = createDropdown(document, 'example', OPTIONS);
    dropdown.open();
    key(dropdown.trigger, 'ArrowDown');

    const tabEvent = key(dropdown.trigger, 'Tab');

    expect(dropdown.value).toBe('bravo');
    expect(dropdown.trigger.getAttribute('aria-expanded')).toBe('false');
    expect(tabEvent.defaultPrevented).toBe(false);

    dropdown.destroy();
  });

  it('supports Home, End, typeahead, Escape, and outside-click dismissal', () => {
    installDropdown();
    const dropdown = createDropdown(document, 'example', OPTIONS);
    const onInput = vi.fn();
    dropdown.input.addEventListener('input', onInput);

    dropdown.open();
    key(dropdown.trigger, 'End');
    expect(dropdown.trigger.getAttribute('aria-activedescendant')).toBe('exampleOption2');
    key(dropdown.trigger, 'Home');
    expect(dropdown.trigger.getAttribute('aria-activedescendant')).toBe('exampleOption0');
    key(dropdown.trigger, 'c');
    expect(dropdown.trigger.getAttribute('aria-activedescendant')).toBe('exampleOption2');
    key(dropdown.trigger, 'Escape');

    expect(dropdown.value).toBe('alpha');
    expect(dropdown.trigger.getAttribute('aria-expanded')).toBe('false');
    expect(onInput).not.toHaveBeenCalled();

    dropdown.open();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(dropdown.trigger.getAttribute('aria-expanded')).toBe('false');

    dropdown.destroy();
  });

  it('commits pointer choices and silently displays a non-selectable programmatic state', () => {
    installDropdown();
    const dropdown = createDropdown(document, 'example', OPTIONS);
    const onInput = vi.fn();
    dropdown.input.addEventListener('input', onInput);

    dropdown.open();
    document.querySelector<HTMLElement>('[data-value="charlie"]')!.click();
    expect(dropdown.value).toBe('charlie');
    expect(onInput).toHaveBeenCalledOnce();

    dropdown.setValue('custom');
    expect(dropdown.value).toBe('custom');
    expect(document.querySelector('#exampleValue')?.textContent).toBe('Custom / modified settings');
    expect(onInput).toHaveBeenCalledOnce();
    expect(() => dropdown.setValue('missing')).toThrow('Unknown example dropdown value "missing".');

    dropdown.open();
    key(dropdown.trigger, 'Tab');
    expect(dropdown.value).toBe('alpha');
    expect(onInput).toHaveBeenCalledTimes(2);

    dropdown.destroy();
  });

  it('does not emit form events when the committed value is unchanged', () => {
    installDropdown();
    const dropdown = createDropdown(document, 'example', OPTIONS);
    const onInput = vi.fn();
    const onChange = vi.fn();
    dropdown.input.addEventListener('input', onInput);
    dropdown.input.addEventListener('change', onChange);

    dropdown.open();
    document.querySelector<HTMLElement>('#exampleListbox [data-value="alpha"]')!.click();

    expect(dropdown.value).toBe('alpha');
    expect(onInput).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();

    dropdown.destroy();
  });

  it('keeps only one dropdown open and removes trigger behavior on destroy', () => {
    document.body.innerHTML = `${dropdownMarkup('first')}${dropdownMarkup('second')}`;
    const first = createDropdown(document, 'first', OPTIONS);
    const second = createDropdown(document, 'second', OPTIONS);

    first.open();
    second.open();
    expect(first.trigger.getAttribute('aria-expanded')).toBe('false');
    expect(second.trigger.getAttribute('aria-expanded')).toBe('true');

    second.destroy();
    second.trigger.click();
    expect(second.trigger.getAttribute('aria-expanded')).toBe('false');
    const destroyedOption = document.querySelector<HTMLElement>(
      '#secondListbox [data-value="alpha"]',
    )!;
    destroyedOption.classList.remove('is-active');
    destroyedOption.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    expect(destroyedOption.classList).not.toContain('is-active');

    first.destroy();
  });

  it('opens toward the larger side and constrains the popup to available viewport space', () => {
    installDropdown();
    const dropdown = createDropdown(document, 'example', OPTIONS);
    const root = document.querySelector<HTMLElement>('[data-dropdown="example"]')!;
    const popover = document.querySelector<HTMLElement>('#examplePopover')!;
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 300 });
    Object.defineProperty(root, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ bottom: 204, height: 44, left: 0, right: 300, top: 160, width: 300 }),
    });
    Object.defineProperty(popover, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ bottom: 540, height: 336, left: 0, right: 300, top: 204, width: 300 }),
    });
    Object.defineProperty(popover, 'scrollHeight', { configurable: true, value: 336 });

    dropdown.open();

    expect(root.classList).toContain('opens-up');
    expect(root.style.getPropertyValue('--dropdown-max-height')).toBe('148px');
    expect(root.style.getPropertyValue('--dropdown-listbox-max-height')).toBe('118px');

    dropdown.destroy();
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: originalInnerHeight,
    });
  });
});
