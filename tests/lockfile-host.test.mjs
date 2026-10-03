import { describe, expect, it } from 'vitest';
import { validateLockfile } from '../scripts/check-lockfile-host.mjs';

function fixture(resolved, integrity = 'sha512-test') {
  return {
    packages: {
      'node_modules/example': { resolved, integrity },
    },
  };
}

describe('lockfile registry validation', () => {
  it('accepts HTTPS registry.npmjs.org artifacts with integrity', () => {
    expect(() =>
      validateLockfile(fixture('https://registry.npmjs.org/example/-/example-1.0.0.tgz')),
    ).not.toThrow();
  });

  it('rejects private registry hosts', () => {
    expect(() =>
      validateLockfile(fixture('https://registry.private.example/example/-/example-1.0.0.tgz')),
    ).toThrow('registry.npmjs.org');
  });

  it('rejects insecure registry URLs', () => {
    expect(() =>
      validateLockfile(fixture('http://registry.npmjs.org/example/-/example-1.0.0.tgz')),
    ).toThrow('HTTPS');
  });

  it('rejects resolved packages without integrity metadata', () => {
    expect(() =>
      validateLockfile(fixture('https://registry.npmjs.org/example/-/example-1.0.0.tgz', '')),
    ).toThrow('integrity');
  });
});
