/**
 * Flow 15 — owner-pilot ONBOARDING (browser). Proves the first-use onboarding surface renders from the
 * runtime and that the BUSINESS TYPE changes which inputs are requested (laundry → equipment logs,
 * B2B → contracts, multi-location → branch records), that confidence is not falsely high on weak data,
 * and that a weak business cannot run a confident first diagnosis. No critical console errors.
 *
 * Requires: scripts/seed-owner-scenarios.ts (loginable owner) + scripts/seed-e2e-owner-pilot.ts
 * (the type-distinct pilot businesses).
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { authenticateUser, waitForPageReady } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";
import { PILOT_BUSINESSES, PILOT_WEAK_BIZ } from "./owner-pilot-fixtures";

const consoleErrors: string[] = [];
function watchConsole(page: Page) {
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
}
function fatalErrors(): string[] {
  return consoleErrors.filter((e) => /Cannot read|is not a function|Hydration failed/i.test(e));
}

test.describe.configure({ mode: "serial" });

test.describe("15 — owner-pilot onboarding (desktop, one login)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner/onboarding", { waitUntil: "networkidle" });
    await waitForPageReady(page);
  });
  test.afterAll(async () => { await context.close(); });

  test("the onboarding surface renders from the runtime", async () => {
    await page.selectOption('select[name="businessSelector"]', PILOT_BUSINESSES[0].id);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="owner-onboarding"]')).toBeVisible();
    await expect(page.locator('[data-testid="onboarding-confidence"]')).toBeVisible();
    await expect(page.locator('[data-testid="onboarding-steps"]')).toBeVisible();
  });

  for (const b of PILOT_BUSINESSES.filter((x) => x.hasFinancialMinimum)) {
    test(`business type "${b.businessType}" requests its type-specific input (${b.expectMissingCategory})`, async () => {
      await page.selectOption('select[name="businessSelector"]', b.id);
      await page.waitForLoadState("networkidle");
      await waitForPageReady(page);
      const missing = page.locator('[data-testid="onboarding-missing"]');
      await expect(missing, `${b.businessType}: missing-data panel`).toBeVisible();
      await expect(missing, `${b.businessType}: requests ${b.expectMissingCategory}`).toContainText(new RegExp(b.expectMissingCategory, "i"));
      // Confidence is not falsely high when a required input is still missing.
      await expect(page.locator('[data-testid="onboarding-confidence"]')).not.toContainText(/\bhigh\b/i);
    });
  }

  test("a weak business (no financial data) shows low confidence + missing data, no confident first diagnosis", async () => {
    await page.selectOption('select[name="businessSelector"]', PILOT_WEAK_BIZ);
    await page.waitForLoadState("networkidle");
    await waitForPageReady(page);
    await expect(page.locator('[data-testid="onboarding-missing"]')).toContainText(/revenue|cash|expense/i);
    await expect(page.locator('[data-testid="onboarding-confidence"]')).not.toContainText(/\bhigh\b/i);
  });

  test("no fatal console errors across onboarding", async () => {
    const fatal = fatalErrors();
    expect(fatal, `fatal console errors: ${fatal.join(" | ")}`).toEqual([]);
  });
});
