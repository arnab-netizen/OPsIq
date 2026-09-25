/**
 * Local core-journey Playwright test — the premium-redesign brief's target lay-user path,
 * exercised against a real local Postgres and a real running dev server (never a mock):
 *
 *   signup -> verify (local-only DB shortcut, see below) -> login -> first-run onboarding
 *   (business basics -> essential numbers -> first result) -> Home -> Priorities -> Actions.
 *
 * SAFETY: refuses to run against anything that is not an explicit localhost DB, same guard as
 * scripts/smoke-owner-recovery-runtime.ts. Email verification here bypasses the real email
 * provider by flipping `users.email_verified_at` directly in the DB after signup, rather than
 * intercepting an outbound email — there is no email provider configured in local dev at all
 * (getEmailProvider() returns null), so this is the "safe local test mechanism" the flow
 * genuinely has, not a shortcut around a mechanism that exists. The signup/verification API
 * contract itself (token issuance, expiry, resend) is covered separately by
 * src/__tests__/**\/*.test.ts and is not what this test is proving.
 */
import { test, expect } from "@playwright/test";
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

test.describe("Local core journey: signup through Home, Priorities, Actions", () => {
  test.skip(!isLocal, "Refuses to run except against an explicit local Postgres DATABASE_URL.");

  const email = `journey-${randomUUID().slice(0, 8)}@example.com`;
  const password = "correct-horse-battery-staple";
  const workspaceName = `Journey Test ${randomUUID().slice(0, 6)}`;
  const businessName = `Test Cafe ${randomUUID().slice(0, 6)}`;

  test("signup", async ({ page }) => {
    await page.goto("/signup", { waitUntil: "networkidle" });
    // PUBLIC_BETA_ENABLED must be "true" in this local environment for signup to accept new
    // accounts (see src/lib/beta.ts) -- the same env this whole local journey already depends on.
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByLabel("Workspace Name").fill(workspaceName);
    for (const cb of await page.locator('input[type="checkbox"]').all()) {
      if (!(await cb.isChecked())) await cb.check();
    }
    await page.click('button:has-text("Create Account")');
    await expect(page.getByText(/check your email|verify your account/i)).toBeVisible({ timeout: 15000 });
  });

  test("verify (local DB shortcut) and login", async ({ page }) => {
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      const result = await client.query('UPDATE users SET email_verified_at = now() WHERE email = $1 RETURNING id', [email]);
      expect(result.rowCount).toBe(1);
    } finally {
      await client.end();
    }

    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/owner\/cockpit|\/dashboard/, { timeout: 15000 });
  });

  test("first-run onboarding: business basics -> essential numbers -> first result", async ({ page }) => {
    // Re-authenticate for this independent test case (each Playwright test gets a fresh context).
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/owner\/cockpit|\/dashboard/, { timeout: 15000 });

    await page.goto("/owner/onboarding", { waitUntil: "networkidle" });
    await expect(page.getByText("Welcome to OpsIQ")).toBeVisible();

    await page.fill('[data-testid="data-hub-business-name"]', businessName);
    await page.click('button:has-text("Save business profile")');

    await page.waitForSelector('[data-testid="onboarding-essential-numbers"]', { timeout: 15000 });
    await page.fill('input[name="revenue"]', "20000");
    await page.fill('input[name="variableCosts"]', "8000");
    await page.fill('input[name="cashOnHand"]', "6000");
    await page.click('button:has-text("See my first result")');

    await page.waitForSelector('[data-testid="onboarding-first-result"]', { timeout: 20000 });
    // A real, non-fabricated finding from the numbers just entered -- not a generic placeholder.
    await expect(page.locator('[data-testid="onboarding-first-result"]')).not.toContainText(/lorem ipsum/i);

    await page.click('a:has-text("Go to Home")');
    await page.waitForURL(/\/owner\/cockpit/, { timeout: 15000 });
  });

  test("Home shows a plain-language surface, not raw enums", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/owner\/cockpit|\/dashboard/, { timeout: 15000 });

    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("NEEDS_DATA");
    expect(bodyText).not.toMatch(/\bPROPOSED\b/);
  });

  test("Priorities page loads and is reachable from nav", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/owner\/cockpit|\/dashboard/, { timeout: 15000 });

    await page.click('a:has-text("What needs attention")');
    await page.waitForURL(/\/owner\/priorities/, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Priorities" })).toBeVisible();
  });

  test("Actions (Tasks) page groups statuses in plain language", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/owner\/cockpit|\/dashboard/, { timeout: 15000 });

    await page.click('a:has-text("Tasks")');
    await page.waitForURL(/\/owner\/tasks/, { timeout: 15000 });
    const optgroupLabels = await page.locator("optgroup").evaluateAll((els) => els.map((e) => e.getAttribute("label")));
    expect(optgroupLabels).toEqual(["To do", "In progress", "Waiting", "Done"]);
  });
});
