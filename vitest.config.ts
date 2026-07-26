import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/core/**/*.ts', 'src/browser/**/*.ts', 'src/cli/**/*.ts', 'src/cli-options.ts'],
      exclude: [
        'src/browser/ascii.worker.ts',
        'src/core/types.ts',
        'src/main.ts',
        'src/cli.ts',
        'src/vite-env.d.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
        'src/browser/app.ts': {
          lines: 80,
          functions: 75,
          statements: 80,
          branches: 70,
        },
        'src/browser/output-controller.ts': {
          lines: 85,
          functions: 85,
          statements: 85,
          branches: 75,
        },
        'src/browser/preset-workflow.ts': {
          lines: 85,
          functions: 85,
          statements: 85,
          branches: 75,
        },
      },
    },
  },
});
