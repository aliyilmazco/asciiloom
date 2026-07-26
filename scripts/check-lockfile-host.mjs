import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const lockfileUrl = new URL('../package-lock.json', import.meta.url);

export function validateLockfile(lockfile) {
  if (typeof lockfile !== 'object' || lockfile === null || Array.isArray(lockfile)) {
    throw new TypeError('package-lock.json must contain a JSON object.');
  }

  for (const [name, value] of Object.entries(lockfile.packages ?? {})) {
    if (!value || typeof value !== 'object' || typeof value.resolved !== 'string') continue;

    const resolved = new URL(value.resolved);
    if (resolved.protocol !== 'https:') {
      throw new Error(`${name} must resolve over HTTPS.`);
    }
    if (resolved.hostname !== 'registry.npmjs.org') {
      throw new Error(`${name} must resolve from registry.npmjs.org.`);
    }
    if (typeof value.integrity !== 'string' || value.integrity.length === 0) {
      throw new Error(`${name} must include lockfile integrity metadata.`);
    }
  }
}

const invokedPath = process.argv[1];
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  const lockfile = JSON.parse(await readFile(lockfileUrl, 'utf8'));
  validateLockfile(lockfile);
}
