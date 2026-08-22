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
    // MUST stay 'off'. RAW_PLAYWRIGHT_TRACE_UPLOAD=0 for this suite,
    // permanently -- two separate incidents proved raw Playwright
    // trace/screenshot capture is unsafe for a LIVE PRODUCTION run:
    //  - Run #32509563234: browser.newContext() inherits `use.trace`/
    //    `use.screenshot` as context-CREATION-time defaults regardless of
    //    whether the context is built-in-fixture or manually created (as
    //    this suite does, in tests/production/helpers/evidence.ts, to share
    //    one authenticated context/page across a serial journey). With
    //    `trace: 'retain-on-failure'` that meant Playwright's own automatic
    //    recording started BEFORE authenticateProductionOwner() ever ran,
    //    capturing the login POST body -- the plaintext password -- on that
    //    run's login failure.
    //  - Run #32528037515: even after fixing the above (auth now always
    //    completes before any capture starts), a raw trace of AUTHENTICATED
    //    activity still recorded the live session's Cookie header on every
    //    request -- inherently unavoidable for any raw trace of real
    //    authenticated work, and exactly what the leak scanner is designed
    //    to catch (correctly, that run failed closed on it).
    // tests/production/helpers/evidence.ts therefore never calls
    // context.tracing.* at all -- it captures only pixel screenshots (this
    // app never renders a token/password on screen) and a SANITIZED
    // network/console log (method, pathname, status, duration -- never
    // headers, cookies, or bodies). Do not re-enable trace/screenshot here;
    // that would defeat the sanitized-evidence design regardless of when
    // capture starts.
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
