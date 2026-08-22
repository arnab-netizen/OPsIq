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
import type { BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { appendFileSync, mkdirSync } from "fs";
import { timedApiCall } from "./evidence";

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

  // Wait for the login API's own response first, not for navigation. On a
  // rejected login (401 or otherwise) the app never navigates away from
  // /login, so waiting on navigation alone surfaces a real credential
  // rejection as an opaque 15s timeout. Racing on the response itself lets
  // a failure be diagnosed and reported immediately and precisely.
  const [loginResponse] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/auth/login") && res.request().method() === "POST",
      { timeout: 15000 }
    ),
    page.click('button[type="submit"]'),
  ]);

  if (!loginResponse.ok()) {
    let classification = "unknown";
    try {
      const body = await loginResponse.json();
      classification = body?.classification ?? body?.error ?? "unknown";
    } catch {
      // Response body wasn't JSON -- classification stays "unknown".
    }
    // Deliberately excludes email/password -- never include credential
    // values in a thrown error (it can end up in the JSON reporter output).
    throw new Error(`Production Owner login rejected: HTTP ${loginResponse.status()} / ${classification}`);
  }

  // The login API succeeded; wait for the resulting client-side redirect to
  // actually complete before proceeding.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });

  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name.includes("session") || c.name.includes("auth"));
  expect(sessionCookie, "Login did not establish a session cookie").toBeTruthy();

  mkdirSync("/tmp", { recursive: true });
  appendFileSync(SESSION_TOKEN_LOG, `${sessionCookie!.value}\n`);

  return { sessionCookieName: sessionCookie!.name };
}

/** Revokes the session server-side (POST /api/auth/logout) so a subsequent
 * navigation to a protected route can prove the redirect-to-login behavior.
 * `context` is optional (and, if passed but collection was never started for
 * it, a no-op) so this stays callable from any future context that hasn't
 * wired up evidence collection -- but every current call site passes it, so
 * this call is captured in the sanitized network log like every other
 * page.request.* call in this suite (see helpers/evidence.ts's module
 * header re: run #32568877293). */
export async function logoutProductionOwner(page: Page, context?: BrowserContext): Promise<void> {
  const res = await timedApiCall(context, "POST", "/api/auth/logout", () => page.request.post("/api/auth/logout"));
  expect(res.ok(), `Logout request failed: ${res.status()}`).toBe(true);
}
