#!/usr/bin/env node

import process from 'node:process';
import sharp from 'sharp';
import { assertOutputsDoNotReplaceInput, writeFileAtomically } from './cli/files.js';
import { runCli } from './cli/run.js';

void runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  metadata: async (path) => sharp(path).metadata(),
  loadImage: async (path, width, height) => {
    const { data, info } = await sharp(path)
      .rotate()
      .resize(width, height, {
        fit: 'fill',
        kernel: sharp.kernel.lanczos3,
        fastShrinkOnLoad: false,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return {
      data,
      width: info.width,
      height: info.height,
      channels: 4,
    };
  },
  preflight: assertOutputsDoNotReplaceInput,
  write: writeFileAtomically,
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
