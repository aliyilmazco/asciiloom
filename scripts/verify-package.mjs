import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { EXAMPLE_CASES } from './example-cases.mjs';

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageName = 'asciiloom';
const executableName = 'asciiloom';
const executablePath = 'dist-cli/cli.js';
const packagedSourcePattern = 'dist-cli/**/*.js';
const registry = 'https://registry.npmjs.org/';
const requiredKeywords = ['ascii-art', 'image-to-ascii', 'readme', 'markdown', 'svg', 'cli'];
const npmAutomaticFiles = ['LICENSE', 'README.md', 'package.json'];
const requiredScripts = {
  'browsers:install': 'playwright install chromium --no-shell',
  'test:e2e': 'npm run build:web && npm run test:e2e:built',
  'test:e2e:built': 'npm run browsers:install && playwright test',
  'verify:package': 'node scripts/verify-package.mjs',
  'test:cli': 'npm run build:cli && npm run test:cli:built && npm run verify:package',
  'release:check':
    'npm run check && npm run audit:dependencies && npm run test:coverage && npm run build && npm run test:e2e:built && npm run test:cli:built && npm run verify:package',
  prepack: 'npm run release:check',
};

function assertObject(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
}

function assertExactStringArray(actual, expected, label) {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(`${label} must be ${JSON.stringify(expected)}.`);
  }
}

export function validatePackageManifest(manifest) {
  assertObject(manifest, 'package.json');

  if (Object.hasOwn(manifest, 'private')) {
    throw new Error('package.json must omit private for public publishing.');
  }
  if (manifest.name !== packageName) {
    throw new Error(`package.json name must be ${packageName}.`);
  }
  if (typeof manifest.version !== 'string' || manifest.version.trim().length === 0) {
    throw new Error('package.json version must be a non-empty string.');
  }
  if (manifest.license !== 'MIT') {
    throw new Error('package.json license must be MIT.');
  }
  if (typeof manifest.description !== 'string' || manifest.description.trim().length === 0) {
    throw new Error('package.json description must be a non-empty string.');
  }

  assertExactStringArray(manifest.keywords, requiredKeywords, 'package.json keywords');
  assertExactStringArray(manifest.files, [packagedSourcePattern], 'package.json files');

  assertObject(manifest.bin, 'package.json bin');
  const binEntries = Object.entries(manifest.bin);
  if (
    binEntries.length !== 1 ||
    binEntries[0][0] !== executableName ||
    binEntries[0][1] !== executablePath
  ) {
    throw new Error(`package.json bin must map ${executableName} to ${executablePath}.`);
  }

  assertObject(manifest.publishConfig, 'package.json publishConfig');
  if (manifest.publishConfig.access !== 'public') {
    throw new Error('package.json publishConfig.access must be public.');
  }
  if (manifest.publishConfig.registry !== registry) {
    throw new Error(`package.json publishConfig.registry must be ${registry}.`);
  }

  for (const field of ['main', 'exports']) {
    if (Object.hasOwn(manifest, field)) {
      throw new Error(`package.json must omit ${field}; this package exposes only a CLI.`);
    }
  }

  assertObject(manifest.scripts, 'package.json scripts');
  for (const [scriptName, expectedCommand] of Object.entries(requiredScripts)) {
    if (manifest.scripts[scriptName] !== expectedCommand) {
      throw new Error(
        `package.json scripts.${scriptName} must be ${JSON.stringify(expectedCommand)}.`,
      );
    }
  }
}

function isEscaped(source, index) {
  let backslashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) {
    backslashCount += 1;
  }
  return backslashCount % 2 === 1;
}

function countBacktickRun(markdown, startIndex) {
  let endIndex = startIndex;
  while (markdown[endIndex] === '`') endIndex += 1;
  return endIndex - startIndex;
}

function findClosingBacktickRun(markdown, startIndex, expectedLength) {
  for (let index = startIndex; index < markdown.length;) {
    if (markdown[index] !== '`') {
      index += 1;
      continue;
    }

    const runLength = countBacktickRun(markdown, index);
    if (runLength === expectedLength) return index;
    index += runLength;
  }
  return -1;
}

function removeMarkdownCodeSpans(markdown) {
  let result = '';
  let index = 0;

  while (index < markdown.length) {
    if (markdown[index] !== '`' || isEscaped(markdown, index)) {
      result += markdown[index];
      index += 1;
      continue;
    }

    const runLength = countBacktickRun(markdown, index);
    const closingIndex = findClosingBacktickRun(markdown, index + runLength, runLength);
    if (closingIndex === -1) {
      result += markdown.slice(index, index + runLength);
      index += runLength;
      continue;
    }

    const codeSpanEnd = closingIndex + runLength;
    result += markdown.slice(index, codeSpanEnd).replace(/[^\r\n]/g, ' ');
    index = codeSpanEnd;
  }

  return result;
}

function removeMarkdownFencedCodeBlocks(markdown) {
  const lines = (markdown.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? []).filter(Boolean);
  let fenceCharacter;
  let fenceLength = 0;

  return lines
    .map((line) => {
      const content = line.replace(/(?:\r\n|\n|\r)$/, '');

      if (fenceCharacter !== undefined) {
        const closingMatch = content.match(/^ {0,3}(`+|~+)[ \t]*$/);
        if (
          closingMatch &&
          closingMatch[1][0] === fenceCharacter &&
          closingMatch[1].length >= fenceLength
        ) {
          fenceCharacter = undefined;
          fenceLength = 0;
        }
        return line.replace(/[^\r\n]/g, ' ');
      }

      const openingMatch = content.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (!openingMatch) return line;
      const candidateCharacter = openingMatch[1][0];
      if (candidateCharacter === '`' && openingMatch[2].includes('`')) return line;

      fenceCharacter = candidateCharacter;
      fenceLength = openingMatch[1].length;
      return line.replace(/[^\r\n]/g, ' ');
    })
    .join('');
}

function findMarkdownLabelEnd(markdown, startIndex) {
  let depth = 1;
  for (let index = startIndex + 1; index < markdown.length; index += 1) {
    const character = markdown[index];
    if (character === '\n' || character === '\r') return -1;
    if (isEscaped(markdown, index)) continue;
    if (character === '[') depth += 1;
    if (character === ']') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function extractMarkdownInlineTargets(markdown) {
  const targets = [];
  const destinationPattern =
    /^\(\s*(?:<([^>\n]+)>|([^\s)\n]+))(?:\s+(?:"(?:\\[^\r\n]|[^"\\\r\n])*"|'(?:\\[^\r\n]|[^'\\\r\n])*'|\((?:\\[^\r\n]|[^)\\\r\n])*\)))?\s*\)/;

  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown[index] !== '[' || isEscaped(markdown, index)) continue;
    const labelEnd = findMarkdownLabelEnd(markdown, index);
    if (labelEnd === -1) continue;

    const match = markdown.slice(labelEnd + 1).match(destinationPattern);
    if (match) targets.push(match[1] ?? match[2]);
  }

  return targets;
}

function extractSrcsetTargets(srcset) {
  const targets = [];
  let index = 0;

  while (index < srcset.length) {
    while (index < srcset.length && (/[\t\n\f\r ]/.test(srcset[index]) || srcset[index] === ',')) {
      index += 1;
    }
    if (index >= srcset.length) break;

    const urlStart = index;
    while (index < srcset.length && !/[\t\n\f\r ]/.test(srcset[index])) index += 1;
    const urlToken = srcset.slice(urlStart, index);
    const target = urlToken.replace(/,+$/, '');
    if (target.length > 0) targets.push(target);

    if (target.length !== urlToken.length) continue;
    while (index < srcset.length && srcset[index] !== ',') index += 1;
  }

  return targets;
}

function extractHtmlResourceTargets(markdown) {
  const targets = [];
  const attributePattern =
    /\b(srcset|src|href|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;

  for (const match of markdown.matchAll(attributePattern)) {
    const value = match[2] ?? match[3] ?? match[4];
    if (value.length === 0) continue;
    if (match[1].toLowerCase() === 'srcset') targets.push(...extractSrcsetTargets(value));
    else targets.push(value);
  }

  return targets;
}

export function validatePackagedReadme(readme, packagedFiles = npmAutomaticFiles) {
  if (typeof readme !== 'string') {
    throw new TypeError('README.md must be a string.');
  }
  if (!Array.isArray(packagedFiles)) {
    throw new TypeError('Packaged file list must be an array.');
  }

  const renderedMarkdown = removeMarkdownCodeSpans(removeMarkdownFencedCodeBlocks(readme));
  const references = [
    ...extractMarkdownInlineTargets(renderedMarkdown),
    ...[
      ...renderedMarkdown.matchAll(/^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*(?:<([^>\n]+)>|([^\s\n]+))/gm),
    ].map((reference) => reference[1] ?? reference[2]),
    ...extractHtmlResourceTargets(renderedMarkdown),
  ];
  const packagedFileSet = new Set(packagedFiles.map((path) => path.replace(/^\.\//, '')));

  for (const target of references) {
    if (target === undefined) continue;
    const isExternal = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target);
    const normalizedTarget = target.replace(/^\.\//, '').split(/[?#]/, 1)[0];
    if (!isExternal && !packagedFileSet.has(normalizedTarget)) {
      throw new Error(`README.md references a file excluded from the npm package: ${target}`);
    }
  }
}

function sortPaths(paths) {
  return paths.toSorted((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

export function buildExpectedPackageFileList(compiledFiles) {
  if (!Array.isArray(compiledFiles)) {
    throw new TypeError('Compiled file list must be an array.');
  }

  const normalizedFiles = compiledFiles.map((path) => path.split(sep).join('/'));
  if (!normalizedFiles.includes('dist-cli/cli.js')) {
    throw new Error('Compiled package must contain dist-cli/cli.js.');
  }
  for (const path of normalizedFiles) {
    if (!path.startsWith('dist-cli/') || !path.endsWith('.js')) {
      throw new Error(`Compiled package file is outside the JavaScript allowlist: ${path}`);
    }
  }

  const expectedFiles = sortPaths([...npmAutomaticFiles, ...normalizedFiles]);
  if (new Set(expectedFiles).size !== expectedFiles.length) {
    throw new Error('Expected package file list contains duplicates.');
  }
  return expectedFiles;
}

export function validatePackResult(packResult, manifest, expectedFiles) {
  assertObject(packResult, 'npm pack result');
  if (packResult.name !== manifest.name) {
    throw new Error(
      `Packed name ${JSON.stringify(packResult.name)} does not match ${JSON.stringify(manifest.name)}.`,
    );
  }
  if (packResult.version !== manifest.version) {
    throw new Error(
      `Packed version ${JSON.stringify(packResult.version)} does not match ${JSON.stringify(manifest.version)}.`,
    );
  }
  if (!Array.isArray(packResult.files)) {
    throw new TypeError('npm pack result must include a files array.');
  }

  const actualFiles = sortPaths(
    packResult.files.map((file) => {
      assertObject(file, 'npm pack file');
      if (typeof file.path !== 'string' || file.path.length === 0) {
        throw new TypeError('npm pack file path must be a non-empty string.');
      }
      return file.path;
    }),
  );
  const sortedExpectedFiles = sortPaths(expectedFiles);
  const actualSet = new Set(actualFiles);
  const expectedSet = new Set(sortedExpectedFiles);
  const unexpected = actualFiles.filter((path) => !expectedSet.has(path));
  const missing = sortedExpectedFiles.filter((path) => !actualSet.has(path));

  if (
    unexpected.length > 0 ||
    missing.length > 0 ||
    actualFiles.length !== sortedExpectedFiles.length
  ) {
    const details = [
      unexpected.length > 0 ? `Unexpected: ${unexpected.join(', ')}` : undefined,
      missing.length > 0 ? `Missing: ${missing.join(', ')}` : undefined,
    ]
      .filter(Boolean)
      .join('. ');
    throw new Error(`Packed file list does not match the CLI-only allowlist. ${details}`.trim());
  }
}

async function collectCompiledJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectCompiledJavaScriptFiles(path);
      if (entry.isFile() && entry.name.endsWith('.js')) {
        return [relative(root, path).split(sep).join('/')];
      }
      return [];
    }),
  );
  return files.flat();
}

const excludedNestedNpmConfigKeys = new Set([
  'npm_config_call',
  'npm_config_dry_run',
  'npm_config_package',
]);

export function createNestedNpmEnvironment(environment = process.env) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([key]) => !excludedNestedNpmConfigKeys.has(key.toLowerCase()),
    ),
  );
}

export function resolveInstalledExecutablePath(consumerDirectory, platform = process.platform) {
  const executableFilename = platform === 'win32' ? `${executableName}.cmd` : executableName;
  return join(consumerDirectory, 'node_modules', '.bin', executableFilename);
}

async function runNpm(args, options = {}) {
  const { env = process.env, ...execOptions } = options;
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const commandArgs = npmExecPath ? [npmExecPath, ...args] : args;
  return execFileAsync(command, commandArgs, {
    cwd: root,
    maxBuffer: 10 * 1024 * 1024,
    ...execOptions,
    // The verifier needs real temporary artifacts even when its parent is an npm dry run.
    env: createNestedNpmEnvironment(env),
  });
}

async function comparePackagedExample(example, outputBase) {
  await Promise.all(
    ['txt', 'md', 'svg'].map(async (extension) => {
      const [expected, actual] = await Promise.all([
        readFile(join(root, `${example.expectedBase}.${extension}`)),
        readFile(`${outputBase}.${extension}`),
      ]);
      if (!expected.equals(actual)) {
        throw new Error(
          `Packaged CLI ${example.name} ${extension} output differs from ${example.expectedBase}.${extension}.`,
        );
      }
    }),
  );
}

export async function verifyPackage() {
  const [manifestSource, readme] = await Promise.all([
    readFile(join(root, 'package.json'), 'utf8'),
    readFile(join(root, 'README.md'), 'utf8'),
  ]);
  const manifest = JSON.parse(manifestSource);
  validatePackageManifest(manifest);

  const compiledFiles = await collectCompiledJavaScriptFiles(join(root, 'dist-cli'));
  const expectedFiles = buildExpectedPackageFileList(compiledFiles);
  validatePackagedReadme(readme, expectedFiles);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'asciiloom-package-'));

  try {
    const { stdout } = await runNpm([
      'pack',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      temporaryDirectory,
    ]);
    const packResults = JSON.parse(stdout);
    if (!Array.isArray(packResults) || packResults.length !== 1) {
      throw new Error('npm pack must return exactly one package result.');
    }

    const [packResult] = packResults;
    validatePackResult(packResult, manifest, expectedFiles);
    if (typeof packResult.filename !== 'string' || packResult.filename.length === 0) {
      throw new Error('npm pack result must include a tarball filename.');
    }

    const tarballPath = join(temporaryDirectory, packResult.filename);
    const consumerDirectory = join(temporaryDirectory, 'consumer');
    await mkdir(consumerDirectory);
    await writeFile(
      join(consumerDirectory, 'package.json'),
      `${JSON.stringify({ private: true }, null, 2)}\n`,
    );

    await runNpm(
      ['install', '--prefix', consumerDirectory, '--no-audit', '--no-fund', tarballPath],
      { cwd: consumerDirectory },
    );
    await access(resolveInstalledExecutablePath(consumerDirectory));
    await runNpm(
      ['exec', '--offline', '--prefix', consumerDirectory, '--', executableName, '--help'],
      {
        cwd: consumerDirectory,
      },
    );

    await Promise.all(
      EXAMPLE_CASES.map(async (example) => {
        const outputBase = join(temporaryDirectory, example.name);
        await runNpm(
          [
            'exec',
            '--offline',
            '--prefix',
            consumerDirectory,
            '--',
            executableName,
            join(root, example.input),
            ...example.arguments,
            '--format',
            'all',
            '--output',
            outputBase,
          ],
          { cwd: consumerDirectory },
        );
        await comparePackagedExample(example, outputBase);
      }),
    );

    console.log(`Verified npm package: ${packResult.filename} (${expectedFiles.length} files).`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1];
if (invokedPath && resolve(fileURLToPath(import.meta.url)) === resolve(invokedPath)) {
  try {
    await verifyPackage();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
