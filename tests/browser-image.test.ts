// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDemoImage,
  loadImageFile,
  MAX_PREPARED_IMAGE_PIXELS,
  MAX_SOURCE_FILE_BYTES,
  MAX_SOURCE_IMAGE_PIXELS,
  MAX_STABLE_BITMAP_DIMENSION,
  prepareImageData,
} from '../src/browser/image.js';

interface ImageGlobalOptions {
  bitmapError?: Error;
  decodeError?: Error;
  height?: number;
  width?: number;
}

function installImageGlobals(options: ImageGlobalOptions = {}) {
  const close = vi.fn();
  const bitmap = { close } as unknown as ImageBitmap;
  const createObjectURL = vi.fn((file: File) => `blob:test/${file.name}`);
  const revokeObjectURL = vi.fn();
  const decode = vi.fn(async () => {
    if (options.decodeError) throw options.decodeError;
  });
  const createImageBitmapMock = vi.fn(async () => {
    if (options.bitmapError) throw options.bitmapError;
    return bitmap;
  });

  class TestImage {
    decoding = '';
    src = '';
    naturalWidth = options.width ?? 640;
    naturalHeight = options.height ?? 480;
    decode = decode;
  }

  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  vi.stubGlobal('Image', TestImage);
  vi.stubGlobal('createImageBitmap', createImageBitmapMock);

  return { bitmap, close, createObjectURL, createImageBitmapMock, decode, revokeObjectURL };
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (const [index, character] of Array.from(value).entries()) {
    bytes[offset + index] = character.charCodeAt(0);
  }
}

function writeUint16BigEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value >>> 8;
  bytes[offset + 1] = value;
}

function writeUint16LittleEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value;
  bytes[offset + 1] = value >>> 8;
}

function writeUint24LittleEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value;
  bytes[offset + 1] = value >>> 8;
  bytes[offset + 2] = value >>> 16;
}

function writeUint32BigEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value >>> 24;
  bytes[offset + 1] = value >>> 16;
  bytes[offset + 2] = value >>> 8;
  bytes[offset + 3] = value;
}

function writeUint32LittleEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value;
  bytes[offset + 1] = value >>> 8;
  bytes[offset + 2] = value >>> 16;
  bytes[offset + 3] = value >>> 24;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function createPngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  writeUint32BigEndian(bytes, 8, 13);
  writeAscii(bytes, 12, 'IHDR');
  writeUint32BigEndian(bytes, 16, width);
  writeUint32BigEndian(bytes, 20, height);
  return bytes;
}

function createJpegHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(27);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc2]);
  writeUint16BigEndian(bytes, 10, 17);
  bytes[12] = 8;
  writeUint16BigEndian(bytes, 13, height);
  writeUint16BigEndian(bytes, 15, width);
  return bytes;
}

function createGifHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(10);
  writeAscii(bytes, 0, 'GIF89a');
  writeUint16LittleEndian(bytes, 6, width);
  writeUint16LittleEndian(bytes, 8, height);
  return bytes;
}

function createWebpHeader(
  format: 'VP8X' | 'VP8L' | 'VP8 ',
  width: number,
  height: number,
): Uint8Array {
  const chunkSize = format === 'VP8L' ? 5 : 10;
  const bytes = new Uint8Array(20 + chunkSize + (chunkSize & 1));
  writeAscii(bytes, 0, 'RIFF');
  writeUint32LittleEndian(bytes, 4, bytes.length - 8);
  writeAscii(bytes, 8, 'WEBP');
  writeAscii(bytes, 12, format);
  writeUint32LittleEndian(bytes, 16, chunkSize);

  if (format === 'VP8X') {
    writeUint24LittleEndian(bytes, 24, width - 1);
    writeUint24LittleEndian(bytes, 27, height - 1);
  } else if (format === 'VP8L') {
    bytes[20] = 0x2f;
    writeUint32LittleEndian(bytes, 21, (width - 1) | ((height - 1) << 14));
  } else {
    bytes[20] = 0;
    bytes.set([0x9d, 0x01, 0x2a], 23);
    writeUint16LittleEndian(bytes, 26, width);
    writeUint16LittleEndian(bytes, 28, height);
  }

  return bytes;
}

function createCanvasContext() {
  const gradient = { addColorStop: vi.fn() };
  const context = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    bezierCurveTo: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    drawImage: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({
      colorSpace: 'srgb',
      data: new Uint8ClampedArray(width * height * 4),
      height,
      width,
    })),
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    lineCap: 'butt',
    lineTo: vi.fn(),
    lineWidth: 1,
    moveTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: '',
  };

  return { context, gradient };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('browser image loading', () => {
  it('captures a stable bitmap and disposes browser resources exactly once', async () => {
    const globals = installImageGlobals();
    const file = new File([], 'portrait.final.png');

    const loaded = await loadImageFile(file);

    expect(globals.createObjectURL).toHaveBeenCalledWith(file);
    expect(globals.decode).toHaveBeenCalledOnce();
    expect(globals.createImageBitmapMock).toHaveBeenCalledOnce();
    expect(loaded).toMatchObject({
      source: globals.bitmap,
      width: 640,
      height: 480,
      name: 'portrait.final',
      previewUrl: 'blob:test/portrait.final.png',
    });

    loaded.dispose();
    loaded.dispose();

    expect(globals.close).toHaveBeenCalledOnce();
    expect(globals.revokeObjectURL).toHaveBeenCalledOnce();
    expect(globals.revokeObjectURL).toHaveBeenCalledWith('blob:test/portrait.final.png');
  });

  it('uses a safe default name when the extension consumes the whole filename', async () => {
    installImageGlobals();

    const loaded = await loadImageFile(new File([], '.png', { type: 'image/png' }));

    expect(loaded.name).toBe('ascii-art');
    loaded.dispose();
  });

  it('rejects a declared non-image before allocating browser resources', async () => {
    await expect(loadImageFile(new File([], 'notes.txt', { type: 'text/plain' }))).rejects.toThrow(
      'Please choose an image file.',
    );
  });

  it('rejects oversized encoded files before allocating browser resources', async () => {
    const globals = installImageGlobals();
    const file = {
      name: 'oversized.png',
      size: MAX_SOURCE_FILE_BYTES + 1,
      type: 'image/png',
    } as File;

    await expect(loadImageFile(file)).rejects.toThrow('32 MiB or smaller');
    expect(globals.createObjectURL).not.toHaveBeenCalled();
    expect(globals.decode).not.toHaveBeenCalled();
  });

  it.each([
    ['PNG', 'huge.png', 'image/png', createPngHeader(10_000, 4_001)],
    ['JPEG', 'huge.jpg', 'image/jpeg', createJpegHeader(10_000, 4_001)],
    ['GIF', 'huge.gif', 'image/gif', createGifHeader(10_000, 4_001)],
    ['extended WebP', 'huge.webp', 'image/webp', createWebpHeader('VP8X', 10_000, 4_001)],
    ['lossless WebP', 'huge.webp', 'image/webp', createWebpHeader('VP8L', 10_000, 4_001)],
    ['lossy WebP', 'huge.webp', 'image/webp', createWebpHeader('VP8 ', 10_000, 4_001)],
  ])(
    'rejects oversized %s metadata before URL creation or browser decode',
    async (_format, name, type, bytes) => {
      const globals = installImageGlobals();
      const file = new File([toArrayBuffer(bytes)], name, { type });

      await expect(loadImageFile(file)).rejects.toThrow('40 megapixels or smaller');
      expect(globals.createObjectURL).not.toHaveBeenCalled();
      expect(globals.decode).not.toHaveBeenCalled();
      expect(globals.createImageBitmapMock).not.toHaveBeenCalled();
    },
  );

  it('falls back to browser decoding when recognized metadata is malformed', async () => {
    const globals = installImageGlobals();
    const malformedPng = createPngHeader(10_000, 4_001);
    writeUint32BigEndian(malformedPng, 8, 12);
    const file = new File([toArrayBuffer(malformedPng)], 'malformed.png', {
      type: 'image/png',
    });

    const loaded = await loadImageFile(file);

    expect(globals.createObjectURL).toHaveBeenCalledWith(file);
    expect(globals.decode).toHaveBeenCalledOnce();
    expect(loaded).toMatchObject({ width: 640, height: 480 });
    loaded.dispose();
  });

  it('bounds metadata reads independently of the accepted encoded file size', async () => {
    const globals = installImageGlobals();
    const slice = vi.fn(() => new Blob([]));
    const file = {
      name: 'within-file-limit.png',
      size: MAX_SOURCE_FILE_BYTES,
      slice,
      type: 'image/png',
    } as unknown as File;

    const loaded = await loadImageFile(file);

    expect(slice).toHaveBeenCalledWith(0, 1_024 * 1_024);
    expect(globals.decode).toHaveBeenCalledOnce();
    loaded.dispose();
  });

  it('revokes the preview URL when decoding fails', async () => {
    const decodeError = new Error('decode failed');
    const globals = installImageGlobals({ decodeError });

    await expect(loadImageFile(new File([], 'broken.png', { type: 'image/png' }))).rejects.toEqual(
      expect.objectContaining({
        cause: decodeError,
        message: 'The browser could not decode this image.',
      }),
    );
    expect(globals.revokeObjectURL).toHaveBeenCalledOnce();
    expect(globals.createImageBitmapMock).not.toHaveBeenCalled();
  });

  it('rejects decoded images with empty dimensions', async () => {
    const globals = installImageGlobals({ width: 0 });

    await expect(loadImageFile(new File([], 'empty.png', { type: 'image/png' }))).rejects.toThrow(
      'The selected image has invalid dimensions.',
    );
    expect(globals.revokeObjectURL).toHaveBeenCalledOnce();
    expect(globals.createImageBitmapMock).not.toHaveBeenCalled();
  });

  it('rejects decoded images above the source pixel limit before bitmap capture', async () => {
    const globals = installImageGlobals({ width: 10_000, height: 4_001 });

    await expect(loadImageFile(new File([], 'huge.png', { type: 'image/png' }))).rejects.toThrow(
      '40 megapixels or smaller',
    );
    expect(10_000 * 4_001).toBeGreaterThan(MAX_SOURCE_IMAGE_PIXELS);
    expect(globals.revokeObjectURL).toHaveBeenCalledOnce();
    expect(globals.createImageBitmapMock).not.toHaveBeenCalled();
  });

  it('captures a bounded bitmap for large accepted source dimensions', async () => {
    const globals = installImageGlobals({ width: 4_000, height: 2_000 });

    const loaded = await loadImageFile(new File([], 'large.png', { type: 'image/png' }));

    expect(globals.createImageBitmapMock).toHaveBeenCalledWith(expect.anything(), {
      resizeHeight: 600,
      resizeQuality: 'high',
      resizeWidth: MAX_STABLE_BITMAP_DIMENSION,
    });
    expect(loaded).toMatchObject({ width: 4_000, height: 2_000 });
    loaded.dispose();
  });

  it('revokes the preview URL when stable-frame capture fails', async () => {
    const bitmapError = new Error('capture failed');
    const globals = installImageGlobals({ bitmapError });

    await expect(
      loadImageFile(new File([], 'animated.gif', { type: 'image/gif' })),
    ).rejects.toEqual(
      expect.objectContaining({
        cause: bitmapError,
        message: 'The browser could not capture a stable frame from this image.',
      }),
    );
    expect(globals.revokeObjectURL).toHaveBeenCalledOnce();
  });
});

describe('browser image preparation', () => {
  it('composites the background before drawing at bounded oversampled dimensions', () => {
    const source = document.createElement('canvas');
    const { context } = createCanvasContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );

    const prepared = prepareImageData(source, 10, 5, 2, { r: 12, g: 34, b: 56 });

    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe('high');
    expect(context.fillStyle).toBe('rgb(12 34 56)');
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 20, 10);
    expect(context.drawImage).toHaveBeenCalledWith(source, 0, 0, 20, 10);
    expect(context.fillRect.mock.invocationCallOrder[0]).toBeLessThan(
      context.drawImage.mock.invocationCallOrder[0]!,
    );
    expect(context.getImageData).toHaveBeenCalledWith(0, 0, 20, 10);
    expect(prepared).toEqual({
      data: expect.any(Uint8ClampedArray),
      width: 20,
      height: 10,
      channels: 4,
    });
    expect(prepared.data).toHaveLength(20 * 10 * 4);
  });

  it('rejects invalid dimensions and oversampling before Canvas allocation', () => {
    const source = {} as CanvasImageSource;

    expect(() => prepareImageData(source, 0, 1, 1, { r: 0, g: 0, b: 0 })).toThrow(
      'outputWidth must be a positive integer',
    );
    expect(() => prepareImageData(source, 1.5, 1, 1, { r: 0, g: 0, b: 0 })).toThrow(
      'outputWidth must be a positive integer',
    );
    expect(() => prepareImageData(source, 1, 0, 1, { r: 0, g: 0, b: 0 })).toThrow(
      'outputHeight must be a positive integer',
    );
    expect(() => prepareImageData(source, 1, 1.5, 1, { r: 0, g: 0, b: 0 })).toThrow(
      'outputHeight must be a positive integer',
    );
    expect(() => prepareImageData(source, 1, 1, 0, { r: 0, g: 0, b: 0 })).toThrow(
      'oversample must be an integer between 1 and 3',
    );
    expect(() => prepareImageData(source, 1, 1, 1.5, { r: 0, g: 0, b: 0 })).toThrow(
      'oversample must be an integer between 1 and 3',
    );
    expect(() => prepareImageData(source, 1, 1, 4, { r: 0, g: 0, b: 0 })).toThrow(
      'oversample must be an integer between 1 and 3',
    );
  });

  it('rejects prepared images above the browser pixel budget', () => {
    expect(() =>
      prepareImageData({} as CanvasImageSource, MAX_PREPARED_IMAGE_PIXELS + 1, 1, 1, {
        r: 0,
        g: 0,
        b: 0,
      }),
    ).toThrow(`Prepared browser image must contain at most ${MAX_PREPARED_IMAGE_PIXELS} pixels.`);
  });

  it('reports unavailable Canvas 2D support', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    expect(() =>
      prepareImageData({} as CanvasImageSource, 1, 1, 1, { r: 255, g: 255, b: 255 }),
    ).toThrow('Canvas 2D is not available in this browser.');
  });
});

describe('demo image', () => {
  it('draws a deterministic 960 by 600 preview', () => {
    const { context, gradient } = createCanvasContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,demo',
    );

    const demo = createDemoImage();

    expect(demo.source).toBeInstanceOf(HTMLCanvasElement);
    expect(demo).toMatchObject({
      width: 960,
      height: 600,
      name: 'asciiloom-demo',
      previewUrl: 'data:image/png;base64,demo',
    });
    expect(context.createLinearGradient).toHaveBeenCalledWith(0, 0, 960, 600);
    expect(gradient.addColorStop.mock.calls).toEqual([
      [0, '#f6f8fa'],
      [0.48, '#d0d7de'],
      [1, '#8c959f'],
    ]);
    expect(context.arc).toHaveBeenCalledWith(735, 165, 82, 0, Math.PI * 2);
    expect(context.bezierCurveTo).toHaveBeenCalledWith(240, 62, 350, 175, 492, 112);
    expect(demo.dispose()).toBeUndefined();
  });

  it('reports unavailable Canvas 2D support', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    expect(() => createDemoImage()).toThrow('Canvas 2D is not available in this browser.');
  });
});
