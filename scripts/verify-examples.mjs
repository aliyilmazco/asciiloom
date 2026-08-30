import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { EXAMPLE_CASES } from './example-cases.mjs';

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'charosaic-examples-'));

try {
  await Promise.all(
    EXAMPLE_CASES.map(async (example) => {
      const outputBase = join(temporaryDirectory, example.name);
      await execFileAsync(
        process.execPath,
        [
          join(root, 'dist-cli/cli.js'),
          join(root, example.input),
          ...example.arguments,
          '--format',
          'all',
          '--output',
          outputBase,
        ],
        { cwd: root },
      );

      await Promise.all(
        ['txt', 'md', 'svg'].map(async (extension) => {
          const [expected, actual] = await Promise.all([
            readFile(join(root, `${example.expectedBase}.${extension}`)),
            readFile(`${outputBase}.${extension}`),
          ]);
          if (!expected.equals(actual)) {
            throw new Error(
              `Generated ${example.name} ${extension} output differs from ${example.expectedBase}.${extension}.`,
            );
          }
        }),
      );
    }),
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
