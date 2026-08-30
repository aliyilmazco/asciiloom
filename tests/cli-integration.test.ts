import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const compiledCli = join(repositoryRoot, 'dist-cli', 'cli.js');
const sourceFixture = join(repositoryRoot, 'examples', 'demo-source.png');
const temporaryDirectories: string[] = [];

function isSymlinkPermissionError(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error.code === 'EACCES' || error.code === 'EPERM')
  );
}

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: readonly string[], cwd = repositoryRoot): CliResult {
  const result = spawnSync(process.execPath, [compiledCli, ...args], {
    cwd,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'charosaic-cli-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('compiled CLI', () => {
  it('prints help without loading an image', () => {
    const result = runCli(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Charosaic CLI');
    expect(result.stdout).toContain('charosaic <image> [options]');
    expect(result.stdout).toContain('--style <name>');
    for (const style of [
      'readme',
      'detailed',
      'soft',
      'minimal',
      'blocks',
      'blocks-fine',
      'braille',
      'structure',
    ]) {
      expect(result.stdout).toContain(style);
    }
    expect(result.stderr).toBe('');
  });

  it.each(['blocks-fine', 'braille', 'structure'] as const)(
    'writes all non-empty formats for the %s character style',
    async (style) => {
      const directory = await temporaryDirectory();
      const base = join(directory, style);
      const result = runCli([sourceFixture, '--style', style, '--format', 'all', '--output', base]);

      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
      await Promise.all(
        ['txt', 'md', 'svg'].map(async (extension) => {
          const contents = await readFile(`${base}.${extension}`, 'utf8');
          expect(contents.length).toBeGreaterThan(0);
          expect(result.stderr).toContain(`Wrote ${base}.${extension}\n`);
        }),
      );
    },
  );

  it('writes the default Markdown format to stdout', async () => {
    const expected = await readFile(join(repositoryRoot, 'examples', 'demo.md'), 'utf8');
    const result = runCli([sourceFixture]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(expected);
    expect(result.stderr).toBe('');
  });

  it.each([
    ['text', 'txt'],
    ['markdown', 'md'],
    ['svg', 'svg'],
  ] as const)('writes byte-identical %s output', async (format, extension) => {
    const directory = await temporaryDirectory();
    const output = join(directory, `demo.${extension}`);
    const result = runCli([
      sourceFixture,
      '--preset',
      'readme',
      '--format',
      format,
      '--output',
      output,
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`Wrote ${output}\n`);
    expect(await readFile(output)).toEqual(
      await readFile(join(repositoryRoot, 'examples', `demo.${extension}`)),
    );
  });

  it('preflights and writes every target for the all format', async () => {
    const directory = await temporaryDirectory();
    const base = join(directory, 'demo');
    const result = runCli([
      sourceFixture,
      '--preset',
      'readme',
      '--format',
      'all',
      '--output',
      `${base}.md`,
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    await Promise.all(
      ['txt', 'md', 'svg'].map(async (extension) => {
        expect(await readFile(`${base}.${extension}`)).toEqual(
          await readFile(join(repositoryRoot, 'examples', `demo.${extension}`)),
        );
        expect(result.stderr).toContain(`Wrote ${base}.${extension}\n`);
      }),
    );
  });

  it('rejects an extreme derived height before image resize', async () => {
    const directory = await temporaryDirectory();
    const input = join(directory, 'extreme.png');
    await copyFile(sourceFixture, input);

    const result = runCli([input, '--width', '400', '--aspect', '2']);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'Error: Calculated output height 500 exceeds the 400-row limit.',
    );
  });

  it('reports invalid arguments with one error line and a non-zero exit', () => {
    const result = runCli([sourceFixture, '--format', 'invalid']);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('Error: format must be text, markdown, svg, or all.\n');
  });

  it('rejects invalid options before attempting to decode a missing input', () => {
    const result = runCli(['/definitely/missing/input.png', '--format', 'invalid']);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('Error: format must be text, markdown, svg, or all.\n');
  });

  it('uses EXIF-oriented dimensions when deriving output height', async () => {
    const directory = await temporaryDirectory();
    const input = join(directory, 'oriented.jpg');
    await sharp({
      create: { width: 2, height: 4, channels: 3, background: '#000000' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toFile(input);

    const result = runCli([
      input,
      '--width',
      '4',
      '--aspect',
      '1',
      '--oversample',
      '1',
      '--format',
      'text',
    ]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trimEnd().split('\n')).toHaveLength(2);
    expect(
      result.stdout
        .trimEnd()
        .split('\n')
        .every((line) => line.length === 4),
    ).toBe(true);
  });

  it('composites the transparent fixture against the selected background', () => {
    const fixture = join(
      repositoryRoot,
      'tests',
      'fixtures',
      'character-styles',
      'transparent-logo.svg',
    );
    const common = [fixture, '--style', 'blocks-fine', '--format', 'text'] as const;
    const light = runCli([...common, '--background', '#ffffff']);
    const dark = runCli([...common, '--background', '#000000']);

    expect(light.status).toBe(0);
    expect(dark.status).toBe(0);
    expect(light.stdout).not.toBe(dark.stdout);
  });

  it('rejects malformed SVG text before creating an output file', async () => {
    const directory = await temporaryDirectory();
    const output = join(directory, 'invalid.svg');
    const result = runCli([
      sourceFixture,
      '--format',
      'svg',
      '--title',
      'invalid\u0001title',
      '--output',
      output,
    ]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'Error: title contains a character that XML 1.0 cannot represent.',
    );
    await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'cleans temporary files when an atomic write cannot start',
    async () => {
      const directory = await temporaryDirectory();
      const lockedDirectory = join(directory, 'read-only');
      const output = join(lockedDirectory, 'art.txt');
      await mkdir(lockedDirectory);
      await chmod(lockedDirectory, 0o555);

      try {
        const result = runCli([sourceFixture, '--format', 'text', '--output', output]);

        expect(result.status).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('Error:');
        expect(await readdir(lockedDirectory)).toEqual([]);
      } finally {
        await chmod(lockedDirectory, 0o755);
      }
    },
  );

  it('refuses to overwrite its input and preserves the source bytes', async () => {
    const directory = await temporaryDirectory();
    const input = join(directory, 'source.png');
    await copyFile(sourceFixture, input);
    const before = await sha256(input);

    const result = runCli([input, '--format', 'text', '--output', input]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Error: Output path would overwrite the input image:');
    expect(await sha256(input)).toBe(before);
  });

  it('resolves existing output aliases and preflights every all-format target', async ({
    skip,
  }) => {
    const directory = await temporaryDirectory();
    const input = join(directory, 'source.png');
    const outputBase = join(directory, 'result');
    await copyFile(sourceFixture, input);
    try {
      await symlink(input, `${outputBase}.md`);
    } catch (error) {
      if (isSymlinkPermissionError(error)) {
        skip('This environment does not permit creating symbolic links.');
      }
      throw error;
    }
    const before = await sha256(input);

    const result = runCli([input, '--format', 'all', '--output', outputBase]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Error: Output path would overwrite the input image:');
    expect(await sha256(input)).toBe(before);
    expect((await lstat(`${outputBase}.md`)).isSymbolicLink()).toBe(true);
    await expect(readFile(`${outputBase}.txt`)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(`${outputBase}.svg`)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
