/**
 * Login-once authentication for the LIVE Production acceptance lane.
 *
 * Root cause this closes (Production run #17): every spec file logged in from its own `beforeAll`, and Playwright
 * re-runs `beforeAll` in a fresh worker after any failed test, so one run performed 14 logins in about three
 * minutes. The production login limiter is a token bucket (capacity 10, refilling one token per 90 seconds); the
 * 14th attempt was refused with HTTP 429. That limiter is a real security control and is NOT weakened for
 * acceptance. The suite must simply stop spending logins.
 *
 * Design: `global-setup.ts` performs exactly ONE real login (through the actual login form, via
 * authenticateProductionOwner) and saves the browser storage state to AUTH_STATE_PATH. Every domain spec opens its
 * context from that file with `newSharedAuthenticatedContext`, so N spec files -- and any number of Playwright
 * worker restarts -- cost zero further logins. If the shared session is missing or no longer valid this helper FAILS;
 * it never falls back to logging in again.
 *
 * The one deliberate exception is 10-startup-mode-acceptance.spec.ts, whose AUTH-04/05 tests prove logout revokes a
 * session and that re-login works. Revoking the shared session would break every later spec, so that spec uses its
 * own session via authenticateProductionOwner. It is the only spec allowed to (see the governance test).
 *
 * Security: AUTH_STATE_PATH is OUTSIDE production-test-results/ (the uploaded artifact path), is written with mode
 * 0600, is never committed, its cookie value is added to the leak-scan token log, and the workflow deletes it before
 * the artifact upload step.
 */
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { chromium } from "@playwright/test";
import { chmodSync, existsSync } from "fs";
import { authenticateProductionOwner } from "./production-auth";

export const AUTH_STATE_PATH = "/tmp/.opsiq-acceptance-auth-state.json";

/** Called once by global-setup. Throws (failing the whole run) if the single login is rejected. */
export async function performSingleProductionLogin(baseURL: string): Promise<void> {
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined
  );
  try {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await authenticateProductionOwner(page);
    await context.storageState({ path: AUTH_STATE_PATH });
    chmodSync(AUTH_STATE_PATH, 0o600);
    await context.close();
  } finally {
    await browser.close();
  }
}

/**
 * Opens a context from the shared login. Never logs in. Verifies the session is live with one read-only call so a
 * dead shared session fails loudly here instead of surfacing later as an unrelated redirect-to-login.
 */
export async function newSharedAuthenticatedContext(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  if (!existsSync(AUTH_STATE_PATH)) {
    throw new Error(
      "SHARED_SESSION_MISSING: global-setup did not produce the shared authenticated state. Refusing to log in again from a spec (login budget)."
    );
  }
  const context = await browser.newContext({ storageState: AUTH_STATE_PATH });
  const page = await context.newPage();
  const probe = await page.request.get("/api/owner/businesses");
  if (!probe.ok()) {
    await context.close();
    throw new Error(
      `SHARED_SESSION_INVALID: the shared authenticated session was rejected (HTTP ${probe.status()}). Refusing to log in again from a spec.`
    );
  }
  return { context, page };
}
