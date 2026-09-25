import { defineConfig, devices } from '@playwright/test';
import { resolveTestDatabase } from './src/infra/test-database-guard';

// The local dev server this config starts (no BASE_URL) uses the inherited DATABASE_URL, and the
// specs sign up users / write rows through it: fail closed unless that is a guarded test database
// (src/infra/test-database-guard.ts). A remote BASE_URL target does not start a local server.
if (!process.env.CI && !process.env.BASE_URL) {
  resolveTestDatabase({ ...process.env, TEST_WITH_DB: 'true' });
}

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  forbidOnly: process.env.CI ? true : false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'test-results/html' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3001',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Allow pointing at a pre-installed Chromium (managed/CI images that ship a browser at a fixed
        // path) without re-downloading. Unset → Playwright's bundled browser (the default for normal CI).
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : undefined,
      },
    },
  ],
  timeout: 30 * 1000,
  expect: {
    timeout: 5 * 1000,
  },
  globalTimeout: 60 * 60 * 1000, // 1 hour for soak test
});
