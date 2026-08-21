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
    // MUST stay 'off'. Run #32509563234 proved that Playwright's built-in
    // trace/screenshot recording starts at context-creation time -- i.e.
    // browser.newContext() inherits and applies these `use` options as
    // context-construction defaults regardless of whether the context was
    // created via the built-in page/context fixtures or manually (as this
    // suite does, in tests/production/helpers/evidence.ts, to share one
    // authenticated context/page across a serial journey). That happens
    // BEFORE authenticateProductionOwner() ever runs, so with `trace:
    // 'retain-on-failure'` here, Playwright's own automatic trace recorded
    // -- and, on the login failure in that run, retained and attached to
    // the HTML report -- the POST /api/auth/login network request body,
    // which contains the plaintext password. This suite's manual tracing
    // (evidence.ts: startTracing() is called only AFTER login succeeds) is
    // the ONLY tracing/screenshot mechanism that may run. Do not re-enable
    // either setting here without first re-verifying, in a real run, that
    // no capture occurs before login completes.
    trace: 'off',
    screenshot: 'off',
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
