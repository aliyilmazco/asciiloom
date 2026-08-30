import type { RgbColor, RgbaImage } from '../core/types.js';

export const MAX_SOURCE_FILE_BYTES = 32 * 1_024 * 1_024;
export const MAX_SOURCE_IMAGE_PIXELS = 40_000_000;
export const MAX_STABLE_BITMAP_DIMENSION = 1_200;

const MAX_IMAGE_METADATA_BYTES = 1_024 * 1_024;

interface ImageDimensions {
  width: number;
  height: number;
}

function hasBytes(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function hasAscii(bytes: Uint8Array, offset: number, expected: string): boolean {
  return Array.from(expected).every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0),
  );
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1_00_00_00 +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! +
    bytes[offset + 1]! * 0x100 +
    bytes[offset + 2]! * 0x1_00_00 +
    bytes[offset + 3]! * 0x1_00_00_00
  );
}

function validDimensions(width: number, height: number): ImageDimensions | undefined {
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function parsePngDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
  if (
    bytes.length < 24 ||
    !hasBytes(bytes, 0, signature) ||
    readUint32BigEndian(bytes, 8) !== 13 ||
    !hasAscii(bytes, 12, 'IHDR')
  ) {
    return undefined;
  }

  return validDimensions(readUint32BigEndian(bytes, 16), readUint32BigEndian(bytes, 20));
}

function parseGifDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  if (bytes.length < 10 || (!hasAscii(bytes, 0, 'GIF87a') && !hasAscii(bytes, 0, 'GIF89a'))) {
    return undefined;
  }

  return validDimensions(readUint16LittleEndian(bytes, 6), readUint16LittleEndian(bytes, 8));
}

function isJpegStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function isStandaloneJpegMarker(marker: number): boolean {
  return marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7);
}

function parseJpegDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;

  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return undefined;
    while (bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return undefined;

    const marker = bytes[offset]!;
    offset += 1;
    if (marker === 0x00 || marker === 0xd9 || marker === 0xda) return undefined;
    if (isStandaloneJpegMarker(marker)) continue;
    if (offset + 2 > bytes.length) return undefined;

    const segmentLength = readUint16BigEndian(bytes, offset);
    if (segmentLength < 2) return undefined;
    if (isJpegStartOfFrame(marker)) {
      if (segmentLength < 8 || offset + 7 > bytes.length) return undefined;
      return validDimensions(
        readUint16BigEndian(bytes, offset + 5),
        readUint16BigEndian(bytes, offset + 3),
      );
    }

    if (offset + segmentLength > bytes.length) return undefined;
    offset += segmentLength;
  }

  return undefined;
}

function parseWebpDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  if (bytes.length < 20 || !hasAscii(bytes, 0, 'RIFF') || !hasAscii(bytes, 8, 'WEBP')) {
    return undefined;
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkSize = readUint32LittleEndian(bytes, offset + 4);
    const dataOffset = offset + 8;

    if (hasAscii(bytes, offset, 'VP8X')) {
      if (chunkSize < 10 || dataOffset + 10 > bytes.length) return undefined;
      return validDimensions(
        readUint24LittleEndian(bytes, dataOffset + 4) + 1,
        readUint24LittleEndian(bytes, dataOffset + 7) + 1,
      );
    }

    if (hasAscii(bytes, offset, 'VP8L')) {
      if (chunkSize < 5 || dataOffset + 5 > bytes.length || bytes[dataOffset] !== 0x2f) {
        return undefined;
      }
      const dimensionBits = readUint32LittleEndian(bytes, dataOffset + 1);
      return validDimensions((dimensionBits & 0x3fff) + 1, ((dimensionBits >>> 14) & 0x3fff) + 1);
    }

    if (hasAscii(bytes, offset, 'VP8 ')) {
      if (
        chunkSize < 10 ||
        dataOffset + 10 > bytes.length ||
        (bytes[dataOffset]! & 1) !== 0 ||
        !hasBytes(bytes, dataOffset + 3, [0x9d, 0x01, 0x2a])
      ) {
        return undefined;
      }
      return validDimensions(
        readUint16LittleEndian(bytes, dataOffset + 6) & 0x3fff,
        readUint16LittleEndian(bytes, dataOffset + 8) & 0x3fff,
      );
    }

    const paddedChunkSize = chunkSize + (chunkSize & 1);
    if (paddedChunkSize > bytes.length - dataOffset) return undefined;
    offset = dataOffset + paddedChunkSize;
  }

  return undefined;
}

function parseImageDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  return (
    parsePngDimensions(bytes) ??
    parseJpegDimensions(bytes) ??
    parseWebpDimensions(bytes) ??
    parseGifDimensions(bytes)
  );
}

async function preflightImageDimensions(file: File): Promise<ImageDimensions | undefined> {
  try {
    const metadata = await file.slice(0, MAX_IMAGE_METADATA_BYTES).arrayBuffer();
    return parseImageDimensions(new Uint8Array(metadata));
  } catch {
    return undefined;
  }
}

function exceedsSourcePixelLimit({ width, height }: ImageDimensions): boolean {
  return width > Math.floor(MAX_SOURCE_IMAGE_PIXELS / height);
}

export interface LoadedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  name: string;
  previewUrl: string;
  dispose: () => void;
}

export async function loadImageFile(file: File): Promise<LoadedImage> {
  if (file.type.length > 0 && !file.type.startsWith('image/')) {
    throw new TypeError('Please choose an image file.');
  }
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new RangeError('The selected image must be 32 MiB or smaller.');
  }

  const preflightDimensions = await preflightImageDimensions(file);
  if (preflightDimensions && exceedsSourcePixelLimit(preflightDimensions)) {
    throw new RangeError('The selected image must be 40 megapixels or smaller.');
  }

  const previewUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  image.src = previewUrl;

  try {
    await image.decode();
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    throw new Error('The browser could not decode this image.', { cause: error });
  }

  if (image.naturalWidth < 1 || image.naturalHeight < 1) {
    URL.revokeObjectURL(previewUrl);
    throw new Error('The selected image has invalid dimensions.');
  }
  if (exceedsSourcePixelLimit({ width: image.naturalWidth, height: image.naturalHeight })) {
    URL.revokeObjectURL(previewUrl);
    throw new RangeError('The selected image must be 40 megapixels or smaller.');
  }

  let bitmap: ImageBitmap;
  try {
    const bitmapScale = Math.min(
      1,
      MAX_STABLE_BITMAP_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
    );
    bitmap =
      bitmapScale < 1
        ? await createImageBitmap(image, {
            resizeWidth: Math.max(1, Math.round(image.naturalWidth * bitmapScale)),
            resizeHeight: Math.max(1, Math.round(image.naturalHeight * bitmapScale)),
            resizeQuality: 'high',
          })
        : await createImageBitmap(image);
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    throw new Error('The browser could not capture a stable frame from this image.', {
      cause: error,
    });
  }

  let disposed = false;

  return {
    source: bitmap,
    width: image.naturalWidth,
    height: image.naturalHeight,
    name: file.name.replace(/\.[^.]+$/u, '') || 'ascii-art',
    previewUrl,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      bitmap.close();
      URL.revokeObjectURL(previewUrl);
    },
  };
}

export const MAX_PREPARED_IMAGE_PIXELS = 648_000;

export function prepareImageData(
  source: CanvasImageSource,
  outputWidth: number,
  outputHeight: number,
  oversample: number,
  background: RgbColor,
): RgbaImage {
  if (!Number.isInteger(outputWidth) || outputWidth < 1) {
    throw new RangeError('outputWidth must be a positive integer before Canvas preparation.');
  }
  if (!Number.isInteger(outputHeight) || outputHeight < 1) {
    throw new RangeError('outputHeight must be a positive integer before Canvas preparation.');
  }
  if (!Number.isInteger(oversample) || oversample < 1 || oversample > 3) {
    throw new RangeError('oversample must be an integer between 1 and 3.');
  }

  const preparedWidth = outputWidth * oversample;
  const preparedHeight = outputHeight * oversample;
  if (preparedWidth * preparedHeight > MAX_PREPARED_IMAGE_PIXELS) {
    throw new RangeError(
      `Prepared browser image must contain at most ${MAX_PREPARED_IMAGE_PIXELS} pixels.`,
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = preparedWidth;
  canvas.height = preparedHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D is not available in this browser.');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = `rgb(${background.r} ${background.g} ${background.b})`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  return {
    data: imageData.data,
    width: imageData.width,
    height: imageData.height,
    channels: 4,
  };
}

export function createDemoImage(): LoadedImage {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 600;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not available in this browser.');

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#f6f8fa');
  gradient.addColorStop(0.48, '#d0d7de');
  gradient.addColorStop(1, '#8c959f');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.globalAlpha = 0.88;
  context.fillStyle = '#1f2328';
  context.beginPath();
  context.arc(735, 165, 82, 0, Math.PI * 2);
  context.fill();

  context.globalAlpha = 1;
  context.fillStyle = '#1f2328';
  context.beginPath();
  context.moveTo(0, 510);
  context.lineTo(210, 220);
  context.lineTo(390, 480);
  context.lineTo(560, 270);
  context.lineTo(760, 520);
  context.lineTo(960, 330);
  context.lineTo(960, 600);
  context.lineTo(0, 600);
  context.closePath();
  context.fill();

  context.fillStyle = '#d0d7de';
  context.beginPath();
  context.moveTo(210, 220);
  context.lineTo(290, 336);
  context.lineTo(245, 319);
  context.lineTo(207, 360);
  context.lineTo(165, 282);
  context.closePath();
  context.fill();

  context.strokeStyle = '#1f2328';
  context.lineWidth = 10;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(88, 128);
  context.bezierCurveTo(240, 62, 350, 175, 492, 112);
  context.stroke();

  const previewUrl = canvas.toDataURL('image/png');
  return {
    source: canvas,
    width: canvas.width,
    height: canvas.height,
    name: 'charosaic-demo',
    previewUrl,
    dispose: () => undefined,
  };
}
