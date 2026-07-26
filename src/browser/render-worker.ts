import { convertRgbaToAscii } from '../core/ascii.js';
import type { RenderRequest, RenderResponse } from './render-protocol.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected rendering error.';
}

export function handleRenderRequest(request: RenderRequest): RenderResponse {
  try {
    const result = convertRgbaToAscii(
      {
        data: new Uint8ClampedArray(request.data),
        width: request.width,
        height: request.height,
        channels: 4,
      },
      request.options,
      request.outputHeight,
    );
    return {
      revision: request.revision,
      ok: true,
      art: result.art,
      width: result.width,
      height: result.height,
    };
  } catch (error) {
    return { revision: request.revision, ok: false, message: errorMessage(error) };
  }
}
