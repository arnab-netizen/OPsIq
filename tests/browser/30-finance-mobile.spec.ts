/**
 * Flow 30 — FINANCE/CASH pack, REAL browser mobile (375×812). Renders all 120 Finance/Cash scenarios from
 * DB-backed data at mobile viewport, grouped by the 12 subcategories. Proves per scenario: panel renders, action
 * status matches the intended disposition, no horizontal overflow, and NO high-risk / professional-review /
 * cash-critical / compliance / fraud case reads "Proceed". Shardable via FIN_SHARD_INDEX / FIN_SHARD_TOTAL. Writes
 * a mobile run-ledger. Requires seed-finance-cash-e2e.ts.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { writeFileSync } from "fs";
import { authenticateUser, waitForPageReady } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";
import { FINANCE_CASH_PACK, FINANCE_CASH_SUBCATEGORIES } from "../../src/domain/scenarios/finance-cash-pack";
import { financeBusinessId } from "../../scripts/seed-finance-cash-scenarios";

const STATUS_LABEL: Record<string, string> = {
  proceed: "Proceed", cautious_proceed: "Proceed with caution", owner_decision_required: "Owner decision required",
  need_more_data: "Need more data", blocked: "Blocked",
};
const SUBCATS = [...FINANCE_CASH_SUBCATEGORIES];

const shardIndex = Number(process.env.FIN_SHARD_INDEX ?? 0);
const shardTotal = Number(process.env.FIN_SHARD_TOTAL ?? 0);
const subcats = shardTotal > 0 ? SUBCATS.filter((_, i) => (i % shardTotal) === (shardIndex - 1)) : SUBCATS;

const results: Record<string, { playwrightMobileStatus: "pass" | "fail"; got: string; failureReason: string | null }> = {};

async function selectBusiness(page: Page, businessId: string) {
  await page.selectOption('select[name="businessSelector"]', businessId);
  await expect(page.locator('select[name="businessSelector"]')).toHaveValue(businessId, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
  await waitForPageReady(page);
}

test.describe.configure({ mode: "serial" });

test.describe("30 — Finance/Cash mobile 375×812 (one login)", () => {
  let context: BrowserContext; let page: Page;
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 375, height: 812 } }); page = await context.newPage();
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner", { waitUntil: "networkidle" }); await waitForPageReady(page);
  });
  test.afterAll(async () => {
    writeFileSync("OPSIQ_FINANCE_CASH_MOBILE.run.json", JSON.stringify({ layer: "fin-mobile", shardIndex, shardTotal, count: Object.keys(results).length, results }, null, 2) + "\n", "utf8");
    await context.close();
  });

  for (const sub of subcats) {
    const entries = FINANCE_CASH_PACK.filter((s) => s.category === sub);
    test(`[mobile][${sub}] all ${entries.length} Finance scenarios render usably`, async () => {
      expect(entries.length).toBe(10);
      for (const s of entries) {
        await selectBusiness(page, financeBusinessId(s.scenarioId));
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
        const mustNotProceed = s.highRisk || s.professionalReviewRequired || s.expectedDominantConstraint === "cash_survival";
        const safe = !mustNotProceed || (!/^proceed$/i.test(got) && !/proceed with caution/i.test(got));
        results[s.scenarioId] = { playwrightMobileStatus: failureReason || !safe ? "fail" : "pass", got, failureReason: failureReason ?? (safe ? null : `unsafe proceed: ${got}`) };
        expect(results[s.scenarioId].playwrightMobileStatus, `${s.scenarioId}: ${results[s.scenarioId].failureReason ?? "ok"}`).toBe("pass");
      }
    });
  }
});
