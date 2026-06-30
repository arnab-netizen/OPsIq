/**
 * Flow 17 — owner-pilot MOBILE (browser, 375×812). Proves the owner-pilot surfaces are usable on a
 * phone: onboarding + missing-data guidance, the dashboard top priorities, the action/proof card, and
 * the readiness score all render; core content does not require horizontal scrolling; no critical
 * console errors.
 *
 * Requires: scripts/seed-owner-scenarios.ts + scripts/seed-e2e-owner-pilot.ts.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { authenticateUser, waitForPageReady } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";
import { PILOT_LAUNDRY_BIZ } from "./owner-pilot-fixtures";
import { scenarioBusinessId } from "../../src/services/owner-mode/owner-scenario-profiles";

const consoleErrors: string[] = [];
function watchConsole(page: Page) {
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
}
function fatalErrors(): string[] {
  return consoleErrors.filter((e) => /Cannot read|is not a function|Hydration failed/i.test(e));
}

/** Core content must not force horizontal scrolling on a phone (small slack for sub-pixel rounding). */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
  expect(overflow, `horizontal overflow ${overflow}px`).toBeLessThanOrEqual(4);
}

test.describe.configure({ mode: "serial" });

test.describe("17 — owner-pilot mobile (375×812, one login)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    page = await context.newPage();
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
  });
  test.afterAll(async () => { await context.close(); });

  test("mobile onboarding + missing-data guidance are usable without horizontal scroll", async () => {
    await page.goto("/owner/onboarding", { waitUntil: "networkidle" });
    await waitForPageReady(page);
    await page.selectOption('select[name="businessSelector"]', PILOT_LAUNDRY_BIZ);
    await page.waitForLoadState("networkidle");
    await waitForPageReady(page);
    await expect(page.locator('[data-testid="owner-onboarding"]')).toBeVisible();
    await expect(page.locator('[data-testid="onboarding-confidence"]')).toBeVisible();
    await expect(page.locator('[data-testid="onboarding-missing"]')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("mobile dashboard top priorities + action/proof + readiness are usable without horizontal scroll", async () => {
    await page.goto("/owner", { waitUntil: "networkidle" });
    await waitForPageReady(page);
    await page.selectOption('select[name="businessSelector"]', scenarioBusinessId("cash_crisis"));
    await page.waitForLoadState("networkidle");
    await waitForPageReady(page);
    await expect(page.locator('[data-testid="owner-priority-strip"]')).toBeVisible();
    await expect(page.locator('[data-testid="priority-card-0"]')).toBeVisible();
    await expect(page.locator('[data-testid="owner-readiness-score"]')).toBeVisible();
    await expect(page.locator('[data-testid="owner-action-plan"]')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("no fatal console errors on mobile", async () => {
    const fatal = fatalErrors();
    expect(fatal, `fatal console errors: ${fatal.join(" | ")}`).toEqual([]);
  });
});
