/**
 * Shared helpers for the OBQ browser acceptance specs (local loopback database only — see `isLocal`).
 * Not a spec: no tests are registered here.
 */
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { resolveTestDatabase } from "../../../src/infra/test-database-guard";
import { Client } from "pg";
import { randomUUID, createHash } from "crypto";

export const DATABASE_URL = process.env.DATABASE_URL || "";
export const isLocal = (() => {
  try {
    return resolveTestDatabase({ ...process.env, TEST_WITH_DB: "true", DATABASE_URL }).target === "loopback";
  } catch {
    return false;
  }
})();

export async function db<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function setAdmissionMode(mode: "OPEN_BETA" | "INVITE_ONLY") {
  await db((c) =>
    c.query(
      `INSERT INTO platform_settings (id, admission_mode, capacity_limit, version, updated_at)
       VALUES ('global', $1, 500, 0, now())
       ON CONFLICT (id) DO UPDATE SET admission_mode = EXCLUDED.admission_mode, capacity_limit = 500, updated_at = now()`,
      [mode],
    ),
  );
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const PASSWORD = "correct-horse-battery-staple";
/** Nothing an owner (or an attacker reading a response) may ever see. */
export const LEAK = /prisma|stack|SELECT |INSERT |postgres|constraint|P20\d\d|at\s+\S+\s+\(.*:\d+:\d+\)|ECONN|resend\.com|node_modules/i;

export async function resetLocalRateLimits() {
  await db((c) => c.query("DELETE FROM rate_limit_buckets WHERE key LIKE 'signup:%' OR key LIKE 'verify-email-redeem:%' OR key LIKE 'login:%' OR key LIKE 'product-events:%' OR key LIKE 'diag:%'"));
}

export async function mintVerificationToken(email: string): Promise<string> {
  const raw = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  await db(async (c) => {
    const u = await c.query("SELECT id FROM users WHERE email = $1", [email]);
    await c.query(
      "INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '1 day')",
      [randomUUID(), u.rows[0].id, sha256(raw)],
    );
  });
  return raw;
}

/** Real signup form -> real verification page -> real password setup. Returns timing for TTTV. */
export async function signUpAndVerify(page: Page) {
  await resetLocalRateLimits();
  const rand = randomUUID().slice(0, 8);
  const email = `hostile-${rand}@example.com`;
  const businessName = `Hostile Bakery ${rand}`;
  await page.goto("/signup", { waitUntil: "networkidle" });
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Business name", { exact: true }).fill(businessName);
  const t0 = Date.now();
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/signup") && r.request().method() === "POST"),
    page.click('button[type="submit"]'),
  ]);
  expect(res.status()).toBe(201);
  const raw = await mintVerificationToken(email);
  await page.goto(`/verify-email?token=${raw}`);
  await page.getByRole("button", { name: "Verify my email" }).click();
  await page.waitForURL(/\/reset-password\?.*setup=1/, { timeout: 15000 });
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password", { exact: true }).fill(PASSWORD);
  for (const cb of await page.locator('input[type="checkbox"]').all()) if (!(await cb.isChecked())) await cb.check();
  await page.getByRole("button", { name: /set password and continue/i }).click();
  await page.waitForURL(/\/owner\/first-run/, { timeout: 20000 });
  return { email, businessName, t0 };
}

export async function completeBusinessStep(page: Page) {
  await expect(page.getByTestId("first-run-business-step")).toBeVisible({ timeout: 15000 });
  await page.getByLabel(/what kind of business/i).selectOption({ index: 1 });
  await page.getByLabel(/which currency/i).selectOption("GBP");
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/owner/first-run/business") && r.request().method() === "POST"),
    page.getByTestId("first-run-business-submit").click(),
  ]);
  await expect(page.getByTestId("first-run-evidence-step")).toBeVisible({ timeout: 15000 });
}

export async function fill(page: Page, v: Record<string, string>) {
  for (const [name, value] of Object.entries(v)) {
    await page.locator(`[data-testid="quick-financial-picture-form"] input[name="${name}"]`).fill(value);
  }
}

export const GOOD = { revenue: "12000", fixedCosts: "7000", variableCosts: "4000", cashOnHand: "1500" };

export async function counts(email: string) {
  return db(async (c) => {
    const r = await c.query(
      `SELECT
         (SELECT count(*) FROM workspace_memberships m JOIN users u ON u.id = m.user_id WHERE u.email = $1)::int AS memberships,
         (SELECT count(*) FROM owner_businesses b JOIN workspace_memberships m ON m.workspace_id = b.workspace_id JOIN users u ON u.id = m.user_id WHERE u.email = $1)::int AS businesses,
         (SELECT count(*) FROM owner_financial_snapshots s JOIN workspace_memberships m ON m.workspace_id = s.workspace_id JOIN users u ON u.id = m.user_id WHERE u.email = $1)::int AS snapshots,
         (SELECT count(*) FROM owner_finance_cycles s JOIN workspace_memberships m ON m.workspace_id = s.workspace_id JOIN users u ON u.id = m.user_id WHERE u.email = $1)::int AS cycles`,
      [email],
    );
    return r.rows[0] as { memberships: number; businesses: number; snapshots: number; cycles: number };
  });
}

export async function noHorizontalScroll(page: Page, label: string) {
  const m = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    inner: Math.max(0, ...[...document.querySelectorAll("main, body")].map((e) => (e as HTMLElement).scrollWidth - (e as HTMLElement).clientWidth)),
  }));
  expect(m.doc, `${label}: document scrolls horizontally`).toBeLessThanOrEqual(1);
  expect(m.inner, `${label}: inner container scrolls horizontally`).toBeLessThanOrEqual(1);
}

export async function login(page: Page, email: string) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await noHorizontalScroll(page, "login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });
}

export async function newPhone(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
  return { context, page: await context.newPage() };
}

