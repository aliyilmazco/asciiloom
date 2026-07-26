import type { AsciiOptions } from '../core/types.js';

export interface RenderRequest {
  revision: number;
  data: ArrayBuffer;
  width: number;
  height: number;
  outputHeight: number;
  options: AsciiOptions;
}

export interface RenderSuccess {
  revision: number;
  ok: true;
  art: string;
  width: number;
  height: number;
}

export interface RenderFailure {
  revision: number;
  ok: false;
  message: string;
}

export type RenderResponse = RenderSuccess | RenderFailure;
