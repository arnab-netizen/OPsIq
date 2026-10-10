/**
 * Shared Playwright steps for the first-run path. The business NAME is typed once at signup and inherited by
 * the first business, so the only things the first-run business step asks are the business type and currency.
 */
import { expect, type Page } from "@playwright/test";

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
