import { describe, expect, it, vi } from 'vitest';
import { createRenderLifecycle } from '../src/browser/render-lifecycle.js';

function setup() {
  const scheduled: number[] = [];
  const cancelScheduledRender = vi.fn();
  const markOutputUnavailable = vi.fn();
  const lifecycle = createRenderLifecycle({
    cancelScheduledRender,
    markOutputUnavailable,
    scheduleRender: (revision) => scheduled.push(revision),
  });
  return { lifecycle, scheduled, cancelScheduledRender, markOutputUnavailable };
}

describe('render lifecycle', () => {
  it('suppresses control renders and stale output while an image decode is pending', () => {
    const { lifecycle, scheduled, cancelScheduledRender, markOutputUnavailable } = setup();
    lifecycle.requestRender();
    const oldRevision = scheduled[0]!;

    lifecycle.beginImageDecode();
    lifecycle.requestRender();

    expect(lifecycle.isCurrent(oldRevision)).toBe(false);
    expect(scheduled).toEqual([oldRevision]);
    expect(cancelScheduledRender).toHaveBeenCalledTimes(3);
    expect(markOutputUnavailable).toHaveBeenCalledTimes(3);

    lifecycle.failImageDecode();
    expect(cancelScheduledRender).toHaveBeenCalledTimes(4);
    expect(markOutputUnavailable).toHaveBeenCalledTimes(4);
    expect(scheduled).toEqual([oldRevision]);
  });

  it('renders the newest controls after a successful image decode', () => {
    const { lifecycle, scheduled } = setup();
    lifecycle.beginImageDecode();
    lifecycle.requestRender();
    lifecycle.completeImageDecode();
    lifecycle.requestRender();

    expect(scheduled).toHaveLength(1);
    expect(lifecycle.isCurrent(scheduled[0]!)).toBe(true);
  });

  it('invalidates pending work and ignores future requests after disposal', () => {
    const { lifecycle, scheduled, cancelScheduledRender, markOutputUnavailable } = setup();
    lifecycle.requestRender();
    const pendingRevision = scheduled[0]!;
    lifecycle.dispose();
    lifecycle.dispose();
    lifecycle.requestRender();
    lifecycle.beginImageDecode();
    lifecycle.failImageDecode();

    expect(lifecycle.isCurrent(pendingRevision)).toBe(false);
    expect(scheduled).toEqual([pendingRevision]);
    expect(cancelScheduledRender).toHaveBeenCalledTimes(2);
    expect(markOutputUnavailable).toHaveBeenCalledTimes(1);
  });
});
