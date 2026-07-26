import { describe, expect, it } from 'vitest';
import { createRenderClient } from '../src/browser/render-client.js';
import type { RenderRequest, RenderResponse } from '../src/browser/render-protocol.js';
import { DEFAULT_OPTIONS } from '../src/core/presets.js';

class FakeWorker {
  readonly sent: Array<{ request: RenderRequest; transfer: readonly Transferable[] }> = [];
  readonly messageListeners = new Set<(event: MessageEvent<RenderResponse>) => void>();
  readonly errorListeners = new Set<(event: ErrorEvent) => void>();
  terminated = false;

  postMessage(sentRequest: RenderRequest, transfer: readonly Transferable[]): void {
    this.sent.push({ request: sentRequest, transfer });
  }

  addEventListener(type: string, listener: EventListener): void {
    if (type === 'message') {
      this.messageListeners.add(
        listener as unknown as (event: MessageEvent<RenderResponse>) => void,
      );
    } else if (type === 'error') {
      this.errorListeners.add(listener as unknown as (event: ErrorEvent) => void);
    }
  }

  removeEventListener(type: string, listener: EventListener): void {
    if (type === 'message') {
      this.messageListeners.delete(
        listener as unknown as (event: MessageEvent<RenderResponse>) => void,
      );
    } else if (type === 'error') {
      this.errorListeners.delete(listener as unknown as (event: ErrorEvent) => void);
    }
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(response: RenderResponse): void {
    for (const listener of this.messageListeners)
      listener({ data: response } as MessageEvent<RenderResponse>);
  }

  fail(message: string): void {
    for (const listener of this.errorListeners) listener({ message } as ErrorEvent);
  }
}

function request(revision: number): RenderRequest {
  return {
    revision,
    data: new ArrayBuffer(4),
    width: 1,
    height: 1,
    outputHeight: 1,
    options: { ...DEFAULT_OPTIONS, background: { ...DEFAULT_OPTIONS.background } },
  };
}

describe('worker render client', () => {
  it('keeps one request in flight and coalesces queued work to the latest revision', async () => {
    const worker = new FakeWorker();
    const client = createRenderClient(worker as unknown as Worker);
    const firstRequest = request(1);
    const secondRequest = request(2);
    const thirdRequest = request(3);
    const first = client.render(firstRequest);
    const second = client.render(secondRequest);
    const superseded = second.catch((error: unknown) => error);
    const third = client.render(thirdRequest);

    expect(worker.sent.map(({ request: sent }) => sent.revision)).toEqual([1]);
    expect(worker.sent[0]!.transfer).toEqual([firstRequest.data]);
    await expect(superseded).resolves.toMatchObject({
      name: 'RenderSupersededError',
      message: 'Render revision 2 was superseded by revision 3.',
    });

    worker.respond({ revision: 1, ok: true, art: 'first', width: 88, height: 20 });

    await expect(first).resolves.toMatchObject({ revision: 1, art: 'first' });
    expect(worker.sent.map(({ request: sent }) => sent.revision)).toEqual([1, 3]);
    expect(worker.sent[1]!.transfer).toEqual([thirdRequest.data]);

    worker.respond({ revision: 3, ok: true, art: 'third', width: 88, height: 20 });
    await expect(third).resolves.toMatchObject({ revision: 3, art: 'third' });
  });

  it('starts the newest queued request after a structured render error', async () => {
    const worker = new FakeWorker();
    const client = createRenderClient(worker as unknown as Worker);
    const failed = client.render(request(4));
    const successful = client.render(request(5));

    expect(worker.sent.map(({ request: sent }) => sent.revision)).toEqual([4]);
    worker.respond({ revision: 4, ok: false, message: 'invalid dimensions' });

    await expect(failed).rejects.toThrow('invalid dimensions');
    expect(worker.sent.map(({ request: sent }) => sent.revision)).toEqual([4, 5]);

    worker.respond({ revision: 5, ok: true, art: 'ok', width: 1, height: 1 });
    await expect(successful).resolves.toMatchObject({ revision: 5, art: 'ok' });
  });

  it('rejects the in-flight and queued requests when the worker fails', async () => {
    const worker = new FakeWorker();
    const client = createRenderClient(worker as unknown as Worker);
    const first = client.render(request(7));
    const second = client.render(request(8));

    worker.fail('worker crashed');

    await expect(first).rejects.toThrow('worker crashed');
    await expect(second).rejects.toThrow('worker crashed');
    await expect(client.render(request(9))).rejects.toThrow('worker crashed');
    expect(worker.sent.map(({ request: sent }) => sent.revision)).toEqual([7]);
    expect(worker.terminated).toBe(true);
  });

  it('rejects in-flight, queued, and future work after explicit disposal', async () => {
    const worker = new FakeWorker();
    const client = createRenderClient(worker as unknown as Worker);
    const inFlight = client.render(request(10));
    const queued = client.render(request(11));

    client.dispose();

    await expect(inFlight).rejects.toThrow('The rendering worker has been disposed.');
    await expect(queued).rejects.toThrow('The rendering worker has been disposed.');
    await expect(client.render(request(12))).rejects.toThrow(
      'The rendering worker has been disposed.',
    );
    expect(worker.sent.map(({ request: sent }) => sent.revision)).toEqual([10]);
    expect(worker.terminated).toBe(true);
    expect(worker.messageListeners.size).toBe(0);
    expect(worker.errorListeners.size).toBe(0);
  });

  it('rejects duplicate in-flight and queued revisions without replacing queued work', async () => {
    const worker = new FakeWorker();
    const client = createRenderClient(worker as unknown as Worker);
    const inFlight = client.render(request(20));

    await expect(client.render(request(20))).rejects.toThrow(
      'Render revision 20 is already pending.',
    );

    const queued = client.render(request(21));
    await expect(client.render(request(21))).rejects.toThrow(
      'Render revision 21 is already pending.',
    );
    expect(worker.sent.map(({ request: sent }) => sent.revision)).toEqual([20]);

    worker.respond({ revision: 20, ok: true, art: 'first', width: 1, height: 1 });
    await expect(inFlight).resolves.toMatchObject({ revision: 20 });
    expect(worker.sent.map(({ request: sent }) => sent.revision)).toEqual([20, 21]);

    worker.respond({ revision: 21, ok: true, art: 'second', width: 1, height: 1 });
    await expect(queued).resolves.toMatchObject({ revision: 21 });
  });
});
