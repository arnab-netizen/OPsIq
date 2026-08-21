import { defineConfig, devices } from '@playwright/test';

// LIVE PRODUCTION acceptance lane -- distinct from playwright.config.ts,
// which targets a locally-built app or a CI throwaway environment. This
// config never starts a local server and never falls back to localhost:
// BASE_URL must be supplied explicitly and must point at the verified
// production deployment. globalSetup fails closed if BASE_URL or the
// acceptance credentials are absent; the dispatching workflow independently
// verifies BASE_URL serves the exact expected commit before this ever runs.
export default defineConfig({
  testDir: './tests/production',
  globalSetup: './tests/production/global-setup.ts',
  fullyParallel: false,
  forbidOnly: true,
  // First run is authoritative for a live-production acceptance run -- a
  // test that fails then passes on retry is a flaky defect, not a pass.
  retries: 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'production-test-results/html' }],
    ['json', { outputFile: 'production-test-results/results.json' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.BASE_URL,
    // Nominal -- this suite manages its own tracing/screenshot/video
    // explicitly (see tests/production/helpers/evidence.ts) because it
    // shares one authenticated context/page across a serial journey
    // (matching this repo's established tests/browser/ pattern), which
    // falls outside the built-in page/context fixtures these settings
    // normally attach to.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : undefined,
      },
    },
  ],
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  globalTimeout: 40 * 60 * 1000,
});
