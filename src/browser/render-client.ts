import type { RenderRequest, RenderResponse, RenderSuccess } from './render-protocol.js';

export interface RenderClient {
  render(request: RenderRequest): Promise<RenderSuccess>;
  dispose(): void;
}

interface PendingRender {
  request: RenderRequest;
  resolve(response: RenderSuccess): void;
  reject(error: Error): void;
}

function workerError(message: string | undefined): Error {
  return new Error(message?.trim() || 'The rendering worker stopped unexpectedly.');
}

function supersededError(revision: number, replacementRevision: number): Error {
  const error = new Error(
    `Render revision ${revision} was superseded by revision ${replacementRevision}.`,
  );
  error.name = 'RenderSupersededError';
  return error;
}

export function createRenderClient(worker: Worker): RenderClient {
  let inFlight: PendingRender | undefined;
  let queued: PendingRender | undefined;
  let disposed = false;
  let terminalError: Error | undefined;

  const rejectAll = (error: Error): void => {
    const active = inFlight;
    const waiting = queued;
    inFlight = undefined;
    queued = undefined;
    active?.reject(error);
    waiting?.reject(error);
  };

  const post = (pending: PendingRender): void => {
    inFlight = pending;
    try {
      worker.postMessage(pending.request, [pending.request.data]);
    } catch (error) {
      if (inFlight === pending) inFlight = undefined;
      pending.reject(error instanceof Error ? error : workerError(undefined));
      postQueued();
    }
  };

  const postQueued = (): void => {
    if (disposed || terminalError || inFlight || !queued) return;
    const next = queued;
    queued = undefined;
    post(next);
  };

  const onMessage = (event: MessageEvent<RenderResponse>): void => {
    const response = event.data;
    const request = inFlight;
    if (!request || request.request.revision !== response.revision) return;
    inFlight = undefined;

    if (response.ok) request.resolve(response);
    else request.reject(new Error(response.message));
    postQueued();
  };

  const onError = (event: ErrorEvent): void => {
    terminalError = workerError(event.message);
    worker.removeEventListener('message', onMessage);
    worker.removeEventListener('error', onError);
    worker.terminate();
    rejectAll(terminalError);
  };

  worker.addEventListener('message', onMessage);
  worker.addEventListener('error', onError);

  return {
    render(request: RenderRequest): Promise<RenderSuccess> {
      if (disposed) return Promise.reject(new Error('The rendering worker has been disposed.'));
      if (terminalError) return Promise.reject(terminalError);
      if (
        inFlight?.request.revision === request.revision ||
        queued?.request.revision === request.revision
      ) {
        return Promise.reject(new Error(`Render revision ${request.revision} is already pending.`));
      }

      return new Promise((resolve, reject) => {
        const pending = { request, resolve, reject };
        if (!inFlight) {
          post(pending);
          return;
        }

        queued?.reject(supersededError(queued.request.revision, request.revision));
        queued = pending;
      });
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.terminate();
      rejectAll(new Error('The rendering worker has been disposed.'));
    },
  };
}
