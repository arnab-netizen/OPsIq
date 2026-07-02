/**
 * Flow 36 — CUSTOMER/VENDOR/MARKET pack, REAL browser mobile (375×812). Renders all 100 Customer/Vendor/Market
 * scenarios from DB-backed data at mobile viewport, grouped by the 10 subcategories. Proves per scenario: panel
 * renders, action status matches the intended disposition, no horizontal overflow, and NO high-risk /
 * professional-review / fraud case reads "Proceed". Shardable via CVM_SHARD_INDEX / CVM_SHARD_TOTAL. Writes a
 * mobile run-ledger. Requires seed-customer-vendor-market-e2e.ts.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { writeFileSync } from "fs";
import { authenticateUser, waitForPageReady } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";
import { CUSTOMER_VENDOR_MARKET_PACK, CUSTOMER_VENDOR_MARKET_SUBCATEGORIES } from "../../src/domain/scenarios/customer-vendor-market-pack";
import { customerVendorBusinessId } from "../../scripts/seed-customer-vendor-market-scenarios";

const STATUS_LABEL: Record<string, string> = {
  proceed: "Proceed", cautious_proceed: "Proceed with caution", owner_decision_required: "Owner decision required",
  need_more_data: "Need more data", blocked: "Blocked",
};
const SUBCATS = [...CUSTOMER_VENDOR_MARKET_SUBCATEGORIES];

const shardIndex = Number(process.env.CVM_SHARD_INDEX ?? 0);
const shardTotal = Number(process.env.CVM_SHARD_TOTAL ?? 0);
const subcats = shardTotal > 0 ? SUBCATS.filter((_, i) => (i % shardTotal) === (shardIndex - 1)) : SUBCATS;

const results: Record<string, { playwrightMobileStatus: "pass" | "fail"; got: string; failureReason: string | null }> = {};

async function selectBusiness(page: Page, businessId: string) {
  await page.selectOption('select[name="businessSelector"]', businessId);
  await expect(page.locator('select[name="businessSelector"]')).toHaveValue(businessId, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
  await waitForPageReady(page);
}

test.describe.configure({ mode: "serial" });

test.describe("36 — Customer/Vendor/Market mobile 375×812 (one login)", () => {
  let context: BrowserContext; let page: Page;
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 375, height: 812 } }); page = await context.newPage();
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner", { waitUntil: "networkidle" }); await waitForPageReady(page);
  });
  test.afterAll(async () => {
    writeFileSync("OPSIQ_CUSTOMER_VENDOR_MARKET_MOBILE.run.json", JSON.stringify({ layer: "cvm-mobile", shardIndex, shardTotal, count: Object.keys(results).length, results }, null, 2) + "\n", "utf8");
    await context.close();
  });

  for (const sub of subcats) {
    const entries = CUSTOMER_VENDOR_MARKET_PACK.filter((s) => s.category === sub);
    test(`[mobile][${sub}] all ${entries.length} Customer/Vendor scenarios render usably`, async () => {
      expect(entries.length).toBe(10);
      for (const s of entries) {
        await selectBusiness(page, customerVendorBusinessId(s.scenarioId));
        const panel = page.locator('[data-testid="owner-supervisor-summary"]');
        await expect(panel, s.scenarioId).toBeVisible();
        const statLoc = panel.locator('[data-testid="supervisor-action-status"]');
        let failureReason: string | null = null;
        try {
          await expect(statLoc, s.scenarioId).toHaveText(STATUS_LABEL[s.expectedActionStatus], { timeout: 15000 });
          const overflow = await page.evaluate(() => {
            const el = document.scrollingElement || document.documentElement; return el.scrollWidth - el.clientWidth;
          });
          expect(overflow, `overflow ${overflow}px`).toBeLessThanOrEqual(4);
        } catch (err) { failureReason = String((err as Error).message).replace(/\s+/g, " ").slice(0, 220); }
        const got = (await statLoc.innerText()).trim();
        const mustNotProceed = s.highRisk || s.professionalReviewRequired;
        const safe = !mustNotProceed || (!/^proceed$/i.test(got) && !/proceed with caution/i.test(got));
        results[s.scenarioId] = { playwrightMobileStatus: failureReason || !safe ? "fail" : "pass", got, failureReason: failureReason ?? (safe ? null : `unsafe proceed: ${got}`) };
        expect(results[s.scenarioId].playwrightMobileStatus, `${s.scenarioId}: ${results[s.scenarioId].failureReason ?? "ok"}`).toBe("pass");
      }
    });
  }
});
