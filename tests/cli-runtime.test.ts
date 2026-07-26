import {
  copyFile,
  link,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertOutputsDoNotReplaceInput, writeFileAtomically } from '../src/cli/files.js';
import { runCli, type ImageMetadata } from '../src/cli/run.js';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const sourceFixture = join(repositoryRoot, 'examples', 'demo-source.png');
const temporaryDirectories: string[] = [];
const virtualProject = resolve('/virtual/project');

function virtualPath(...segments: string[]): string {
  return join(virtualProject, ...segments);
}

function isSymlinkPermissionError(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error.code === 'EACCES' || error.code === 'EPERM')
  );
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'readme-ascii-cli-runtime-'));
  temporaryDirectories.push(directory);
  return directory;
}

function opaqueImage(width: number, height: number) {
  const data = new Uint8Array(width * height * 4);
  for (let offset = 3; offset < data.length; offset += 4) data[offset] = 255;
  return { data, width, height, channels: 4 as const };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('runCli orchestration', () => {
  it('returns help before invoking any injected image or filesystem operation', async () => {
    const runtime = {
      cwd: virtualProject,
      stdout: vi.fn(),
      stderr: vi.fn(),
      metadata: vi.fn(async () => ({ width: 1, height: 1 })),
      loadImage: vi.fn(async () => opaqueImage(1, 1)),
      preflight: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
    };

    await runCli(['--help'], runtime);

    expect(runtime.stdout).toHaveBeenCalledWith(expect.stringContaining('README ASCII Studio CLI'));
    expect(runtime.metadata).not.toHaveBeenCalled();
    expect(runtime.loadImage).not.toHaveBeenCalled();
    expect(runtime.preflight).not.toHaveBeenCalled();
    expect(runtime.write).not.toHaveBeenCalled();
  });

  it('uses injected EXIF-aware metadata and image loading for stdout conversion', async () => {
    const stdout = vi.fn();
    const loadImage = vi.fn(async (_path: string, width: number, height: number) =>
      opaqueImage(width, height),
    );
    const runtime = {
      cwd: virtualProject,
      stdout,
      stderr: vi.fn(),
      metadata: vi.fn(async () => ({ width: 400, height: 800, orientation: 6 })),
      loadImage,
      preflight: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
    };

    await runCli(['portrait.png'], runtime);

    expect(loadImage).toHaveBeenCalledWith(virtualPath('portrait.png'), 264, 66);
    expect(runtime.preflight).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledOnce();
  });

  it('loads a 2×4 subcell image for each Braille output cell', async () => {
    const loadImage = vi.fn(async (_path: string, width: number, height: number) =>
      opaqueImage(width, height),
    );
    const metadata = vi.fn<() => Promise<ImageMetadata>>(async () => ({ width: 10, height: 10 }));
    const runtime = {
      cwd: virtualProject,
      stdout: vi.fn(),
      stderr: vi.fn(),
      metadata,
      loadImage,
      preflight: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
    };

    await runCli(
      [
        'source.png',
        '--style',
        'braille',
        '--width',
        '10',
        '--height',
        '5',
        '--oversample',
        '2',
        '--format',
        'text',
      ],
      runtime,
    );

    expect(loadImage).toHaveBeenCalledWith(virtualPath('source.png'), 40, 40);
  });

  it('rejects incompatible Braille options before reading image metadata', async () => {
    const runtime = {
      cwd: virtualProject,
      stdout: vi.fn(),
      stderr: vi.fn(),
      metadata: vi.fn(async () => ({ width: 1, height: 1 })),
      loadImage: vi.fn(async () => opaqueImage(1, 1)),
      preflight: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
    };

    await expect(
      runCli(['source.png', '--style', 'braille', '--edge-glyphs'], runtime),
    ).rejects.toThrow('--style braille cannot be combined with --edge-glyphs.');
    expect(runtime.metadata).not.toHaveBeenCalled();
  });

  it('preflights every all-format target before loading image pixels', async () => {
    const calls: string[] = [];
    const runtime = {
      cwd: virtualProject,
      stdout: vi.fn(),
      stderr: vi.fn(),
      metadata: vi.fn(async () => ({ width: 640, height: 360 })),
      loadImage: vi.fn(async () => {
        calls.push('load');
        return opaqueImage(264, 75);
      }),
      preflight: vi.fn(async (_input: string, outputs: readonly string[]) => {
        calls.push(`preflight:${outputs.join(',')}`);
        throw new Error('preflight blocked');
      }),
      write: vi.fn(async () => undefined),
    };

    await expect(
      runCli(['source.png', '--format', 'all', '--output', 'art'], runtime),
    ).rejects.toThrow('preflight blocked');

    expect(calls).toEqual([
      `preflight:${['art.txt', 'art.md', 'art.svg'].map((path) => virtualPath(path)).join(',')}`,
    ]);
    expect(runtime.loadImage).not.toHaveBeenCalled();
    expect(runtime.write).not.toHaveBeenCalled();
  });

  it('rejects an invalid SVG title before metadata, preflight, or pixel loading', async () => {
    const runtime = {
      cwd: virtualProject,
      stdout: vi.fn(),
      stderr: vi.fn(),
      metadata: vi.fn(async () => ({ width: 1, height: 1 })),
      loadImage: vi.fn(async () => opaqueImage(1, 1)),
      preflight: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
    };
    await expect(
      runCli(
        ['source.png', '--format', 'svg', '--title', 'bad\u0001title', '--output', 'art.svg'],
        runtime,
      ),
    ).rejects.toThrow('title contains a character that XML 1.0 cannot represent.');
    expect(runtime.metadata).not.toHaveBeenCalled();
    expect(runtime.preflight).not.toHaveBeenCalled();
    expect(runtime.loadImage).not.toHaveBeenCalled();
  });

  it.each([
    ['text', 'txt', (contents: string) => contents.endsWith('\n')],
    ['markdown', 'md', (contents: string) => contents.startsWith('```text\n')],
    ['svg', 'svg', (contents: string) => contents.startsWith('<?xml version="1.0"')],
  ] as const)('preflights and writes injected %s output', async (format, extension, isExpected) => {
    const writes: Array<[path: string, contents: string]> = [];
    const runtime = {
      cwd: virtualProject,
      stdout: vi.fn(),
      stderr: vi.fn(),
      metadata: vi.fn(async () => ({ width: 2, height: 1 })),
      loadImage: vi.fn(async () => opaqueImage(2, 1)),
      preflight: vi.fn(async () => undefined),
      write: vi.fn(async (path: string, contents: string) => {
        writes.push([path, contents]);
      }),
    };

    await runCli(
      [
        'source.png',
        '--width',
        '2',
        '--height',
        '1',
        '--oversample',
        '1',
        '--format',
        format,
        '--output',
        `art.${extension}`,
      ],
      runtime,
    );

    const input = virtualPath('source.png');
    const output = virtualPath(`art.${extension}`);
    expect(runtime.preflight).toHaveBeenCalledWith(input, [output]);
    expect(runtime.loadImage).toHaveBeenCalledWith(input, 2, 1);
    expect(runtime.write).toHaveBeenCalledOnce();
    expect(writes[0]?.[0]).toBe(output);
    expect(isExpected(writes[0]?.[1] ?? '')).toBe(true);
    expect(runtime.stderr).toHaveBeenCalledWith(`Wrote ${output}\n`);
  });

  it('rejects missing metadata dimensions before preflight or pixel loading', async () => {
    const runtime = {
      cwd: virtualProject,
      stdout: vi.fn(),
      stderr: vi.fn(),
      metadata: vi.fn(async () => ({})),
      loadImage: vi.fn(async () => opaqueImage(1, 1)),
      preflight: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
    };

    await expect(runCli(['source.png'], runtime)).rejects.toThrow(
      'Could not determine image dimensions.',
    );
    expect(runtime.preflight).not.toHaveBeenCalled();
    expect(runtime.loadImage).not.toHaveBeenCalled();
  });

  it('writes all-format targets sequentially and stops after the first write failure', async () => {
    const writeCalls: string[] = [];
    const runtime = {
      cwd: virtualProject,
      stdout: vi.fn(),
      stderr: vi.fn(),
      metadata: vi.fn(async () => ({ width: 2, height: 1 })),
      loadImage: vi.fn(async () => opaqueImage(2, 1)),
      preflight: vi.fn(async () => undefined),
      write: vi.fn(async (path: string) => {
        writeCalls.push(path);
        if (path.endsWith('.md')) throw new Error('simulated write failure');
      }),
    };

    await expect(
      runCli(
        [
          'source.png',
          '--width',
          '2',
          '--height',
          '1',
          '--oversample',
          '1',
          '--format',
          'all',
          '--output',
          'art',
        ],
        runtime,
      ),
    ).rejects.toThrow('simulated write failure');

    expect(writeCalls).toEqual([virtualPath('art.txt'), virtualPath('art.md')]);
    expect(runtime.stderr).toHaveBeenCalledTimes(1);
    expect(runtime.stderr).toHaveBeenCalledWith(`Wrote ${virtualPath('art.txt')}\n`);
  });
});

describe('output path safety', () => {
  it('accepts a distinct target and rejects lexical and hard-link collisions', async () => {
    const directory = await temporaryDirectory();
    const input = join(directory, 'source.png');
    const distinct = join(directory, 'art.txt');
    const hardAlias = join(directory, 'hard.txt');
    await copyFile(sourceFixture, input);
    await copyFile(join(repositoryRoot, 'examples', 'demo.txt'), distinct);
    await link(input, hardAlias);

    await expect(assertOutputsDoNotReplaceInput(input, [distinct])).resolves.toBeUndefined();
    await expect(assertOutputsDoNotReplaceInput(input, [input])).rejects.toThrow(
      'Output path would overwrite the input image:',
    );
    await expect(assertOutputsDoNotReplaceInput(input, [hardAlias])).rejects.toThrow(
      'Output path would overwrite the input image:',
    );
  });

  it('rejects an output path that resolves to the input through a symbolic link', async ({
    skip,
  }) => {
    const directory = await temporaryDirectory();
    const input = join(directory, 'source.png');
    const symbolicAlias = join(directory, 'symbolic.txt');
    await copyFile(sourceFixture, input);

    try {
      await symlink(input, symbolicAlias);
    } catch (error) {
      if (isSymlinkPermissionError(error)) {
        skip('This environment does not permit creating symbolic links.');
      }
      throw error;
    }

    await expect(assertOutputsDoNotReplaceInput(input, [symbolicAlias])).rejects.toThrow(
      'Output path would overwrite the input image:',
    );
  });

  it('rejects an existing directory and propagates invalid parent paths', async () => {
    const directory = await temporaryDirectory();
    const input = join(directory, 'source.png');
    const outputDirectory = join(directory, 'output');
    const parentFile = join(directory, 'not-a-directory');
    await copyFile(sourceFixture, input);
    await mkdir(outputDirectory);
    await copyFile(join(repositoryRoot, 'examples', 'demo.txt'), parentFile);

    await expect(assertOutputsDoNotReplaceInput(input, [outputDirectory])).rejects.toThrow(
      'Output path is a directory:',
    );
    await expect(
      assertOutputsDoNotReplaceInput(input, [join(parentFile, 'art.txt')]),
    ).rejects.toMatchObject({ code: 'ENOTDIR' });
  });
});

describe('atomic output writes', () => {
  it('renames a complete sibling temporary file into place', async () => {
    const directory = await temporaryDirectory();
    const output = join(directory, 'nested', 'art.txt');

    await writeFileAtomically(output, 'complete output\n');

    expect(await readFile(output, 'utf8')).toBe('complete output\n');
    expect(await readdir(dirname(output))).toEqual([basename(output)]);
  });

  it('cleans its sibling temporary file when the final rename fails', async () => {
    const directory = await temporaryDirectory();
    const output = join(directory, 'occupied');
    await mkdir(output);

    await expect(writeFileAtomically(output, 'must not leak')).rejects.toBeInstanceOf(Error);

    expect(await readdir(directory)).toEqual(['occupied']);
  });

  it.skipIf(process.platform === 'win32')('preserves an existing destination mode', async () => {
    const directory = await temporaryDirectory();
    const output = join(directory, 'private.txt');
    await writeFile(output, 'old', { mode: 0o600 });

    await writeFileAtomically(output, 'new');

    expect((await stat(output)).mode & 0o777).toBe(0o600);
    expect(await readFile(output, 'utf8')).toBe('new');
  });
});
