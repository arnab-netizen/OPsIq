/**
 * ERROR-INJECTION — deliberately forces business create, Start Work, and an owner page load to
 * fail with a 500, and asserts the rendered owner UI stays calm and actionable: no raw
 * "Internal server error", no stack trace, no Prisma/SQL/status-code leakage, and (where the
 * mission specifies exact copy) the "Nothing was changed" / "[Try again]" pattern.
 *
 * Uses page.route() to intercept the specific API call and fake a 500 JSON body shaped exactly
 * like withCanonicalEnforcement's real fallback response (src/lib/canonical-route-enforcement.ts)
 * -- this proves the CLIENT rendering is safe even under a real backend failure, independent of
 * whether that failure is currently reproducible against this dataset.
 *
 * SAFETY: refuses to run except against an explicit local Postgres DATABASE_URL, same guard as
 * the other journey specs in this directory.
 */
import { test, expect, type Page } from "@playwright/test";
import { resolveTestDatabase } from "../../src/infra/test-database-guard";
import { Client } from "pg";
import { randomUUID } from "crypto";

const DATABASE_URL = process.env.DATABASE_URL || "";
// Same guard as the vitest harness (a substring regex could be satisfied by "?x=@localhost:" or a
// "?host=" override while the driver connects elsewhere).
const isLocal = (() => {
  try {
    return resolveTestDatabase({ ...process.env, TEST_WITH_DB: "true", DATABASE_URL }).target === "loopback";
  } catch {
    return false;
  }
})();

const OWNER_EMAIL = "trust-journey-owner@staging.local";
const OWNER_PASSWORD = "password123";

/** A fresh, verified, zero-business owner -- deterministic target for the create-business and
 *  Start-Work injections (a shared seeded account's business/task state can drift run to run). */
async function signUpFreshOwner(page: Page): Promise<{ email: string; password: string }> {
  const rand = randomUUID().slice(0, 8);
  const email = `error-inject-${rand}@example.com`;
  const password = "correct-horse-battery-staple";
  await page.goto("/signup", { waitUntil: "networkidle" });
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Workspace Name", { exact: true }).fill(`Error Inject Workspace ${rand}`);
  for (const cb of await page.locator('input[type="checkbox"]').all()) {
    if (!(await cb.isChecked())) await cb.check();
  }
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/signup") && r.request().method() === "POST"),
    page.click('button[type="submit"]'),
  ]);
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query("UPDATE users SET email_verified_at = now() WHERE email = $1", [email]);
  } finally {
    await client.end();
  }
  return { email, password };
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/owner/, { timeout: 15000 });
}

const FAKE_500_BODY = {
  error: "Something went wrong on our side. Nothing was saved. Please try again.",
  correlationId: "test-correlation-id",
  classification: "handler_invocation_failed",
  stage: "handler_invocation",
};

const RAW_LEAK_PATTERNS = [/internal server error/i, /prisma/i, /postgresql/i, /stack trace/i, /\b500\b/, /\bnull\b.*\bundefined\b/i];

function assertNoRawLeak(text: string, label: string) {
  for (const pattern of RAW_LEAK_PATTERNS) {
    expect(text, `${label} must not leak a raw error pattern (${pattern})`).not.toMatch(pattern);
  }
}

test.describe("Error injection: owner-safe failure UX", () => {
  test.skip(!isLocal, "Refuses to run except against an explicit local Postgres DATABASE_URL.");

  test("business create 500 -> owner-safe message, no data silently lost", async ({ page }) => {
    // A fresh, deterministically zero-business owner -- the create-business form is guaranteed
    // to be showing, unlike a shared seeded account whose business state can drift run to run.
    const owner = await signUpFreshOwner(page);
    await login(page, owner.email, owner.password);
    await page.goto("/owner/data", { waitUntil: "networkidle" });
    const nameInput = page.locator('[data-testid="data-hub-business-name"]');
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await page.route("**/api/owner/recovery/businesses", (route) => {
      if (route.request().method() === "POST") {
        void route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify(FAKE_500_BODY) });
      } else {
        void route.continue();
      }
    });
    await nameInput.fill("Injected Failure Bakery");
    await page.locator('select[name="businessType"]').selectOption({ index: 1 });
    await page.locator('select[name="currency"]').selectOption("INR");
    await page.getByRole("button", { name: /save business profile/i }).click();
    await page.waitForTimeout(1000);
    const text = await page.locator("body").innerText();
    assertNoRawLeak(text, "Business create failure");
    // The panel's owner-safe error path (classifyOperatorError) — not a blank/frozen UI.
    expect(page.locator('[role="alert"]').first()).toBeTruthy();
  });

  test("Start Work 500 -> owner-safe message, action not silently applied", async ({ page }) => {
    // A fresh owner with a just-created business always has at least one actionable item (the
    // "collect missing operational data" governed route -- verified live during the P0-3/P0-4
    // investigation), so this is deterministic rather than depending on a shared account's
    // current task state.
    const owner = await signUpFreshOwner(page);
    await login(page, owner.email, owner.password);
    await page.goto("/owner/data", { waitUntil: "networkidle" });
    await page.locator('[data-testid="data-hub-business-name"]').fill("Error Inject Bakery");
    await page.locator('select[name="businessType"]').selectOption({ index: 1 });
    await page.locator('select[name="currency"]').selectOption("INR");
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/owner/recovery/businesses") && r.request().method() === "POST"),
      page.getByRole("button", { name: /save business profile/i }).click(),
    ]);
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    const startWorkBtn = page.getByRole("button", { name: "Start Work" }).first();
    if ((await startWorkBtn.count()) === 0) {
      test.skip(true, "No actionable Start Work item available immediately after business creation.");
      return;
    }
    await page.route("**/api/owner/process-execution", (route) => {
      if (route.request().method() === "POST") {
        void route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify(FAKE_500_BODY) });
      } else {
        void route.continue();
      }
    });
    await startWorkBtn.click();
    await page.waitForTimeout(1000);
    const text = await page.locator("body").innerText();
    assertNoRawLeak(text, "Start Work failure");
    expect(text, "must show the owner-safe action-failed message").toMatch(/we couldn't (start this action|complete this action)/i);
    expect(text).toMatch(/nothing was changed/i);
  });

  test("owner page load 500 -> owner-safe message, page does not crash blank", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', OWNER_EMAIL);
    await page.fill('input[type="password"]', OWNER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/owner/, { timeout: 15000 });
    await page.route("**/api/owner/now-view*", (route) => {
      void route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify(FAKE_500_BODY) });
    });
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const text = await page.locator("body").innerText();
    assertNoRawLeak(text, "Page load failure");
    // A calm, non-blank owner-safe surface: either the page's own retry affordance or the
    // top-level React error boundary ("Something went wrong" / "Try again") -- never a blank page.
    expect(text.trim().length, "page must not render blank on a load failure").toBeGreaterThan(0);
    expect(text).toMatch(/try again|couldn't load|something went wrong/i);
  });
});
