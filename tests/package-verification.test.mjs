import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildExpectedPackageFileList,
  createNestedNpmEnvironment,
  resolveInstalledExecutablePath,
  validatePackagedReadme,
  validatePackageManifest,
  validatePackResult,
} from '../scripts/verify-package.mjs';

function validManifest() {
  return {
    name: 'asciiloom',
    version: '1.0.0',
    description:
      'README-focused image-to-ASCII CLI with text, Markdown, and accessible SVG output.',
    type: 'module',
    license: 'MIT',
    keywords: ['ascii-art', 'image-to-ascii', 'readme', 'markdown', 'svg', 'cli'],
    bin: {
      asciiloom: 'dist-cli/cli.js',
    },
    files: ['dist-cli/**/*.js'],
    publishConfig: {
      access: 'public',
      registry: 'https://registry.npmjs.org/',
    },
    scripts: {
      'browsers:install': 'playwright install chromium --no-shell',
      'test:e2e': 'npm run build:web && npm run test:e2e:built',
      'test:e2e:built': 'npm run browsers:install && playwright test',
      'verify:package': 'node scripts/verify-package.mjs',
      'test:cli': 'npm run build:cli && npm run test:cli:built && npm run verify:package',
      'release:check':
        'npm run check && npm run audit:dependencies && npm run test:coverage && npm run build && npm run test:e2e:built && npm run test:cli:built && npm run verify:package',
      prepack: 'npm run release:check',
    },
  };
}

const compiledFiles = [
  'dist-cli/cli-options.js',
  'dist-cli/cli.js',
  'dist-cli/cli/files.js',
  'dist-cli/cli/run.js',
  'dist-cli/core/ascii.js',
  'dist-cli/core/markdown.js',
  'dist-cli/core/presets.js',
  'dist-cli/core/svg.js',
  'dist-cli/core/types.js',
  'dist-cli/core/validation.js',
];

describe('public npm package manifest validation', () => {
  it('accepts the public CLI-only manifest contract', () => {
    expect(() => validatePackageManifest(validManifest())).not.toThrow();
  });

  it('rejects a private package', () => {
    expect(() => validatePackageManifest({ ...validManifest(), private: true })).toThrow('private');
  });

  it.each([
    ['registry', { publishConfig: { access: 'public', registry: 'https://example.com/' } }],
    [
      'access',
      { publishConfig: { access: 'restricted', registry: 'https://registry.npmjs.org/' } },
    ],
    ['bin', { bin: { asciiloom: './src/cli.ts' } }],
    ['files', { files: ['dist-cli'] }],
  ])('rejects an invalid %s contract', (_, override) => {
    expect(() => validatePackageManifest({ ...validManifest(), ...override })).toThrow();
  });

  it.each([
    ['license', { license: undefined }],
    ['name', { name: undefined }],
    ['version', { version: undefined }],
  ])('rejects a missing %s', (_, override) => {
    expect(() => validatePackageManifest({ ...validManifest(), ...override })).toThrow();
  });

  it.each(['main', 'exports'])('rejects a programmatic %s entry point', (field) => {
    expect(() =>
      validatePackageManifest({ ...validManifest(), [field]: './dist-cli/cli.js' }),
    ).toThrow(field);
  });

  it.each([
    'browsers:install',
    'test:e2e',
    'test:e2e:built',
    'verify:package',
    'test:cli',
    'release:check',
    'prepack',
  ])('rejects a missing or weakened %s lifecycle script', (scriptName) => {
    const manifest = validManifest();
    manifest.scripts[scriptName] = 'node -e "process.exit(0)"';

    expect(() => validatePackageManifest(manifest)).toThrow(scriptName);
  });
});

describe('published README validation', () => {
  it('allows the packaged license link and local paths shown inside code examples', () => {
    expect(() =>
      validatePackagedReadme(
        `See [LICENSE](./LICENSE). Inline: \`![Output](./docs/inline.svg)\`.\n\n\`\`\`markdown\n![Output](./docs/generated.svg)\n\`\`\``,
      ),
    ).not.toThrow();
  });

  it.each([
    ['./examples/demo.svg', 'See [artifact](./examples/demo.svg).'],
    ['./docs/titled.md', 'See [artifact](./docs/titled.md "Reference title").'],
    [
      './docs/double-quoted-title.md',
      String.raw`See [artifact](./docs/double-quoted-title.md "Reference \"dark\" title").`,
    ],
    [
      './docs/single-quoted-title.md',
      String.raw`See [artifact](./docs/single-quoted-title.md 'Reference \'dark\' title').`,
    ],
    ['./docs/angled.md', 'See [artifact](<./docs/angled.md>).'],
    ['./examples/nested-label.svg', 'See [preview [dark mode]](./examples/nested-label.svg).'],
    ['./docs/reference.md', 'See [artifact][reference].\n\n[reference]: ./docs/reference.md'],
    ['./examples/quoted.svg', '<img src="./examples/quoted.svg" alt="Preview">'],
    ['./examples/unquoted.svg', '<img src=./examples/unquoted.svg alt="Preview">'],
    ['./examples/poster.svg', '<video poster="./examples/poster.svg"></video>'],
    ['./docs/escaped-backtick.md', '\\`[artifact](./docs/escaped-backtick.md)\\`'],
    ['./examples/escaped-backtick.svg', '\\`![Preview](./examples/escaped-backtick.svg)\\`'],
    [
      './docs/literal-tildes.md',
      'Markers ~~~ [artifact](./docs/literal-tildes.md) ~~~ stay visible.',
    ],
    [
      './docs/unequal-backticks.md',
      'Markers ```` [artifact](./docs/unequal-backticks.md) ``` stay visible.',
    ],
    [
      './examples/one-x.svg',
      '<img srcset="./examples/one-x.svg 1x, ./examples/two-x.svg 2x" alt="Preview">',
    ],
  ])('rejects an unpackaged rendered reference to %s', (target, readme) => {
    expect(() => validatePackagedReadme(readme)).toThrow(target);
  });

  it('allows external data URLs inside srcset attributes', () => {
    expect(() =>
      validatePackagedReadme(
        '<img srcset="data:image/svg+xml,%3Csvg%3E 1x, https://example.com/preview.svg 2x">',
      ),
    ).not.toThrow();
  });

  it('validates every candidate inside srcset attributes', () => {
    expect(() =>
      validatePackagedReadme('<img srcset="./examples/one-x.svg 1x, ./examples/two-x.svg 2x">', [
        'LICENSE',
        'README.md',
        'package.json',
        'examples/one-x.svg',
      ]),
    ).toThrow('./examples/two-x.svg');
  });

  it('validates image resources nested inside links', () => {
    expect(() =>
      validatePackagedReadme(
        '[![Preview](./examples/nested-preview.svg)](https://example.com/full-size)',
      ),
    ).toThrow('./examples/nested-preview.svg');
  });
});

describe('packed file validation', () => {
  it('builds the allowlist from compiled JavaScript files', () => {
    expect(buildExpectedPackageFileList(compiledFiles)).toEqual([
      'LICENSE',
      'README.md',
      ...compiledFiles,
      'package.json',
    ]);
  });

  it('accepts newly compiled renderer modules without a frozen entry count', () => {
    const files = buildExpectedPackageFileList([
      'dist-cli/cli.js',
      'dist-cli/core/ascii.js',
      'dist-cli/core/character-styles.js',
      'dist-cli/core/braille.js',
      'dist-cli/core/structure.js',
    ]);
    expect(files).toEqual([
      'LICENSE',
      'README.md',
      'dist-cli/cli.js',
      'dist-cli/core/ascii.js',
      'dist-cli/core/braille.js',
      'dist-cli/core/character-styles.js',
      'dist-cli/core/structure.js',
      'package.json',
    ]);
  });

  it('rejects a build without the CLI entry point', () => {
    expect(() =>
      buildExpectedPackageFileList(compiledFiles.filter((file) => file !== 'dist-cli/cli.js')),
    ).toThrow('dist-cli/cli.js');
  });

  it.each([
    'src/cli.ts',
    'tests/cli.test.ts',
    '.github/workflows/ci.yml',
    'docs/guide.md',
    'examples/demo.txt',
    'package-lock.json',
    'dist-cli/cli.js.map',
    'dist-cli/cli.d.ts',
  ])('rejects leaked file %s', (leakedFile) => {
    const expectedFiles = buildExpectedPackageFileList(compiledFiles);
    const packResult = {
      name: 'asciiloom',
      version: '1.0.0',
      files: [...expectedFiles, leakedFile].map((path) => ({ path })),
    };

    expect(() => validatePackResult(packResult, validManifest(), expectedFiles)).toThrow(
      leakedFile,
    );
  });

  it('rejects a missing compiled CLI module', () => {
    const expectedFiles = buildExpectedPackageFileList(compiledFiles);
    const packResult = {
      name: 'asciiloom',
      version: '1.0.0',
      files: expectedFiles
        .filter((path) => path !== 'dist-cli/core/svg.js')
        .map((path) => ({ path })),
    };

    expect(() => validatePackResult(packResult, validManifest(), expectedFiles)).toThrow(
      'dist-cli/core/svg.js',
    );
  });

  it.each([
    ['name', { name: 'another-package' }],
    ['version', { version: '2.0.0' }],
  ])('rejects a mismatched packed %s', (_, override) => {
    const expectedFiles = buildExpectedPackageFileList(compiledFiles);
    const packResult = {
      name: 'asciiloom',
      version: '1.0.0',
      files: expectedFiles.map((path) => ({ path })),
      ...override,
    };

    expect(() => validatePackResult(packResult, validManifest(), expectedFiles)).toThrow();
  });
});

describe('nested npm environment', () => {
  it('does not inherit an outer npm dry-run while preserving unrelated values', () => {
    expect(
      createNestedNpmEnvironment({
        npm_config_dry_run: 'true',
        NPM_CONFIG_DRY_RUN: 'true',
        npm_config_call: 'node --version',
        NPM_CONFIG_CALL: 'node --version',
        npm_config_package: 'node@20.19.0',
        NPM_CONFIG_PACKAGE: 'node@20.19.0',
        PATH: '/example/bin',
      }),
    ).toEqual({ PATH: '/example/bin' });
  });

  it('resolves the installed npm shim for POSIX and Windows consumers', () => {
    expect(resolveInstalledExecutablePath('/consumer', 'linux')).toBe(
      join('/consumer', 'node_modules', '.bin', 'asciiloom'),
    );
    expect(resolveInstalledExecutablePath('/consumer', 'win32')).toBe(
      join('/consumer', 'node_modules', '.bin', 'asciiloom.cmd'),
    );
  });
});
