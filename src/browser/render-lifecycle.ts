export interface RenderLifecycleCallbacks {
  cancelScheduledRender(): void;
  markOutputUnavailable(): void;
  scheduleRender(revision: number): void;
}

export interface RenderLifecycle {
  beginImageDecode(): void;
  completeImageDecode(): void;
  failImageDecode(): void;
  requestRender(): void;
  isCurrent(revision: number): boolean;
  dispose(): void;
}

export function createRenderLifecycle(callbacks: RenderLifecycleCallbacks): RenderLifecycle {
  let revision = 0;
  let imageDecodePending = false;
  let disposed = false;

  const invalidate = (): void => {
    revision += 1;
    callbacks.cancelScheduledRender();
  };

  return {
    beginImageDecode(): void {
      if (disposed) return;
      imageDecodePending = true;
      invalidate();
      callbacks.markOutputUnavailable();
    },

    completeImageDecode(): void {
      if (disposed) return;
      imageDecodePending = false;
    },

    failImageDecode(): void {
      if (disposed) return;
      imageDecodePending = false;
      invalidate();
      callbacks.markOutputUnavailable();
    },

    requestRender(): void {
      if (disposed) return;
      invalidate();
      callbacks.markOutputUnavailable();
      if (!imageDecodePending) callbacks.scheduleRender(revision);
    },

    isCurrent(candidateRevision: number): boolean {
      return !disposed && candidateRevision === revision;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      imageDecodePending = false;
      invalidate();
    },
  };
}
