import { defineConfig, devices } from '@playwright/test';

const previewOrigin = 'http://127.0.0.1:4173';

function normalizeBasePath(value: string | undefined): string {
  const path = value?.trim() ?? '';
  if (path === '' || path === '/') return '/';
  return `/${path.replace(/^\/+|\/+$/gu, '')}/`;
}

const baseURL = new URL(normalizeBasePath(process.env.BASE_PATH), previewOrigin).toString();

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  outputDir: 'test-results',
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    permissions: ['clipboard-read', 'clipboard-write'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 30_000,
  },
});
