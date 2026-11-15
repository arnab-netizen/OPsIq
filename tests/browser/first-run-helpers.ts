/**
 * Shared Playwright steps for the first-run path. The business NAME is typed once at signup and inherited by
 * the first business, so the only things the first-run business step asks are the business type and currency.
 */
import { expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { createHash, randomUUID } from "crypto";

/**
 * The email-ownership-before-credential journey after the signup form was submitted (signup asks only for the email
 * and the business name and stores NO password): mint the verification link locally (no email provider is configured
 * in local dev, and the raw token is only ever in the email), open it, press the explicit "Verify my email" button,
 * then on the "Choose your password" step accept the three policies and set the password, which signs the owner in
 * and lands on /owner/first-run.
 *
 * `stayLoggedIn: false` (default) clears the session cookie afterwards, for specs that continue with the login form.
 */
export async function verifyEmailAndChoosePassword(
  page: Page,
  opts: { email: string; password: string; databaseUrl: string; stayLoggedIn?: boolean },
): Promise<void> {
  const raw = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const client = new Client({ connectionString: opts.databaseUrl });
  await client.connect();
  try {
    const user = await client.query("SELECT id FROM users WHERE email = $1", [opts.email]);
    expect(user.rowCount, "signup must have created the account").toBe(1);
    await client.query(
      "INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '1 day')",
      [randomUUID(), user.rows[0].id, createHash("sha256").update(raw).digest("hex")],
    );
  } finally {
    await client.end();
  }

  // Opening the link must NOT verify anything by itself: only the explicit click does.
  await page.goto(`/verify-email?token=${raw}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Verify my email" }).click();
  await page.waitForURL(/\/reset-password\?.*setup=1/, { timeout: 15000 });

  await expect(page.getByText("Choose your password")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(opts.password);
  await page.getByLabel("Confirm password", { exact: true }).fill(opts.password);
  for (const cb of await page.locator('input[type="checkbox"]').all()) if (!(await cb.isChecked())) await cb.check();
  await page.getByRole("button", { name: /set password and continue/i }).click();
  await page.waitForURL(/\/owner\/first-run/, { timeout: 20000 });

  if (!opts.stayLoggedIn) await page.context().clearCookies();
}

export async function completeFirstRunBusinessStep(
  page: Page,
  opts: { currency?: string; typeIndex?: number } = {},
): Promise<{ status: number }> {
  await page.goto("/owner/first-run", { waitUntil: "networkidle" });
  await expect(page.getByTestId("first-run-business-step")).toBeVisible({ timeout: 15000 });
  await page.getByLabel(/what kind of business/i).selectOption({ index: opts.typeIndex ?? 1 });
  await page.getByLabel(/which currency/i).selectOption(opts.currency ?? "GBP");
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/owner/first-run/business") && r.request().method() === "POST"),
    page.getByTestId("first-run-business-submit").click(),
  ]);
  expect([200, 201]).toContain(res.status());
  await expect(page.getByTestId("first-run-evidence-step")).toBeVisible({ timeout: 15000 });
  return { status: res.status() };
}
