// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCopiedFeedback } from '../src/browser/copied-feedback.js';

afterEach(() => vi.useRealTimers());

describe('copied button feedback', () => {
  it('keeps the canonical label across overlapping feedback timers', () => {
    vi.useFakeTimers();
    const feedback = createCopiedFeedback(window, 1_200);
    const button = document.createElement('button');
    button.textContent = 'Copy Markdown';

    feedback.show(button);
    vi.advanceTimersByTime(600);
    feedback.show(button);
    vi.advanceTimersByTime(1_199);

    expect(button.textContent).toBe('Copied');
    vi.advanceTimersByTime(1);
    expect(button.textContent).toBe('Copy Markdown');
  });

  it('cancels pending feedback before applying a new contextual label', () => {
    vi.useFakeTimers();
    const feedback = createCopiedFeedback(window, 1_200);
    const button = document.createElement('button');
    button.textContent = 'Copy Markdown';
    feedback.show(button);

    feedback.reset(button);
    button.textContent = 'Copy SVG';
    vi.runAllTimers();

    expect(button.textContent).toBe('Copy SVG');
  });

  it('cancels pending feedback during page teardown', () => {
    vi.useFakeTimers();
    const feedback = createCopiedFeedback(window, 1_200);
    const button = document.createElement('button');
    button.textContent = 'Copy';
    feedback.show(button);

    feedback.dispose();
    vi.runAllTimers();

    expect(button.textContent).toBe('Copy');
  });
});
