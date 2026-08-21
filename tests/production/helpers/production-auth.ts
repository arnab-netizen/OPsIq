/**
 * Live-production authentication helper.
 *
 * Fails closed if PRODUCTION_ACCEPTANCE_EMAIL / PRODUCTION_ACCEPTANCE_PASSWORD
 * are absent (defense in depth -- the dispatching workflow also checks this
 * before the suite ever starts). Never logs, returns, or otherwise surfaces
 * the password value. Callers MUST call this before context tracing starts
 * (see helpers/evidence.ts) so the login request's credentials are never
 * captured in a trace/HAR.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { appendFileSync, mkdirSync } from "fs";

export interface ProductionSession {
  sessionCookieName: string;
}

// Session cookie VALUES are appended here (one per line) so the workflow's
// post-run leak-scan step can check captured evidence for accidental token
// exposure. Deliberately outside production-test-results/ (the
// uploaded-artifact path) -- this file is never part of what gets uploaded.
const SESSION_TOKEN_LOG = "/tmp/.opsiq-acceptance-session-tokens";

export async function authenticateProductionOwner(page: Page): Promise<ProductionSession> {
  const email = process.env.PRODUCTION_ACCEPTANCE_EMAIL;
  const password = process.env.PRODUCTION_ACCEPTANCE_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "authenticateProductionOwner: PRODUCTION_ACCEPTANCE_EMAIL / PRODUCTION_ACCEPTANCE_PASSWORD are not set. Refusing to run (fail-closed)."
    );
  }

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);

  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name.includes("session") || c.name.includes("auth"));
  expect(sessionCookie, "Login did not establish a session cookie").toBeTruthy();

  mkdirSync("/tmp", { recursive: true });
  appendFileSync(SESSION_TOKEN_LOG, `${sessionCookie!.value}\n`);

  return { sessionCookieName: sessionCookie!.name };
}

/** Revokes the session server-side (POST /api/auth/logout) so a subsequent
 * navigation to a protected route can prove the redirect-to-login behavior. */
export async function logoutProductionOwner(page: Page): Promise<void> {
  const res = await page.request.post("/api/auth/logout");
  expect(res.ok(), `Logout request failed: ${res.status()}`).toBe(true);
}
