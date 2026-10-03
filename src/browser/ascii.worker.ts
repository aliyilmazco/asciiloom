import type { RenderRequest, RenderResponse } from './render-protocol.js';
import { handleRenderRequest } from './render-worker.js';

interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<RenderRequest>) => void): void;
  postMessage(message: RenderResponse, transfer: readonly Transferable[]): void;
}

const workerScope = globalThis as unknown as WorkerScope;
workerScope.addEventListener('message', (event) => {
  workerScope.postMessage(handleRenderRequest(event.data), []);
});
