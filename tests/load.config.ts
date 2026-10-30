import { defineConfig, devices } from '@playwright/test';
import { rounds, userCount } from './support/load-settings';
import { fileURLToPath } from 'node:url';

const results = fileURLToPath(new URL('../test-results/load/', import.meta.url));

export default defineConfig({
  testDir: '.',
  testMatch: 'multi-user.spec.ts',
  fullyParallel: true,
  workers: userCount,
  retries: 0,
  metadata: { concurrentWebsiteLoad: true },
  forbidOnly: true,
  timeout: Math.max(120_000, rounds * 60_000),
  expect: { timeout: 15_000 },
  outputDir: `${results}artifacts`,
  reporter: [
    ['line'],
    ['json', { outputFile: `${results}results.json` }],
    ['html', { outputFolder: fileURLToPath(new URL('../playwright-report/load', import.meta.url)), open: 'never' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    trace: 'off', screenshot: 'off', video: 'off',
    navigationTimeout: 30_000,
    serviceWorkers: 'block',
  },
});
