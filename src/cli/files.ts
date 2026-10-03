import { randomUUID } from 'node:crypto';
import { chmod, mkdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

interface ErrorWithCode {
  code?: unknown;
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as ErrorWithCode).code === code;
}

async function existingRealPath(path: string): Promise<string | undefined> {
  try {
    return await realpath(path);
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined;
    throw error;
  }
}

async function existingMode(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).mode & 0o777;
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined;
    throw error;
  }
}

export async function assertOutputsDoNotReplaceInput(
  input: string,
  outputs: readonly string[],
): Promise<void> {
  const resolvedInput = resolve(input);
  const inputRealPath = await realpath(resolvedInput);
  const inputStats = await stat(inputRealPath);

  await Promise.all(
    outputs.map(async (output) => {
      const resolvedOutput = resolve(output);
      if (resolvedOutput === resolvedInput) {
        throw new Error(`Output path would overwrite the input image: ${resolvedOutput}`);
      }

      const outputRealPath = await existingRealPath(resolvedOutput);
      if (outputRealPath === undefined) return;

      const outputStats = await stat(outputRealPath);
      if (
        outputRealPath === inputRealPath ||
        (outputStats.dev === inputStats.dev && outputStats.ino === inputStats.ino)
      ) {
        throw new Error(`Output path would overwrite the input image: ${resolvedOutput}`);
      }
      if (outputStats.isDirectory()) {
        throw new Error(`Output path is a directory: ${resolvedOutput}`);
      }
    }),
  );
}

export async function writeFileAtomically(path: string, contents: string): Promise<void> {
  const resolvedPath = resolve(path);
  const directory = dirname(resolvedPath);
  await mkdir(directory, { recursive: true });

  const temporaryPath = join(directory, `.asciiloom-${process.pid}-${randomUUID()}.tmp`);
  const mode = await existingMode(resolvedPath);
  try {
    await writeFile(temporaryPath, contents, { encoding: 'utf8', flag: 'wx' });
    if (mode !== undefined) await chmod(temporaryPath, mode);
    await rename(temporaryPath, resolvedPath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}
