import type { PresetStorage } from '../../src/browser/custom-presets.js';

export function createMemoryPresetStorage(): PresetStorage {
  const values = new Map<string, string>();

  return {
    getItem(key): string | null {
      return values.get(key) ?? null;
    },
    setItem(key, value): void {
      values.set(key, value);
    },
  };
}
