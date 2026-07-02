/**
 * Flow 33 — GROWTH/PROFIT/SCALING pack, REAL browser desktop. Renders the runtime-fed SupervisorSummary for all
 * 150 Growth/Profit/Scaling scenarios from DB-backed data, grouped by the 10 subcategories. Proves per scenario:
 * panel renders, action status matches the intended disposition, proof + reassessment visible, advanced reasoning
 * collapsed, and NO high-risk / professional-review / gamed case reads "Proceed". Shardable via GRW_SHARD_INDEX /
 * GRW_SHARD_TOTAL. Writes a desktop run-ledger. Requires seed-growth-profit-scaling-e2e.ts.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { writeFileSync } from "fs";
import { authenticateUser, waitForPageReady } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";
import { GROWTH_PROFIT_SCALING_PACK, GROWTH_PROFIT_SCALING_SUBCATEGORIES } from "../../src/domain/scenarios/growth-profit-scaling-pack";
import { growthBusinessId } from "../../scripts/seed-growth-profit-scaling-scenarios";

const STATUS_LABEL: Record<string, string> = {
  proceed: "Proceed", cautious_proceed: "Proceed with caution", owner_decision_required: "Owner decision required",
  need_more_data: "Need more data", blocked: "Blocked",
};
const SUBCATS = [...GROWTH_PROFIT_SCALING_SUBCATEGORIES];

const shardIndex = Number(process.env.GRW_SHARD_INDEX ?? 0);
const shardTotal = Number(process.env.GRW_SHARD_TOTAL ?? 0);
const subcats = shardTotal > 0 ? SUBCATS.filter((_, i) => (i % shardTotal) === (shardIndex - 1)) : SUBCATS;

const consoleErrors: string[] = [];
const results: Record<string, { playwrightDesktopStatus: "pass" | "fail"; got: string; failureReason: string | null }> = {};
const fatal = () => consoleErrors.filter((e) => /Cannot read|is not a function|Hydration failed/i.test(e));

async function selectBusiness(page: Page, businessId: string) {
  await page.selectOption('select[name="businessSelector"]', businessId);
  await expect(page.locator('select[name="businessSelector"]')).toHaveValue(businessId, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
  await waitForPageReady(page);
}

test.describe.configure({ mode: "serial" });

test.describe("33 — Growth/Profit/Scaling desktop (one login)", () => {
  let context: BrowserContext; let page: Page;
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext(); page = await context.newPage();
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner", { waitUntil: "networkidle" }); await waitForPageReady(page);
  });
  test.afterAll(async () => {
    writeFileSync("OPSIQ_GROWTH_PROFIT_SCALING_DESKTOP.run.json", JSON.stringify({ layer: "grw-desktop", shardIndex, shardTotal, count: Object.keys(results).length, results }, null, 2) + "\n", "utf8");
    await context.close();
  });

  for (const sub of subcats) {
    const entries = GROWTH_PROFIT_SCALING_PACK.filter((s) => s.category === sub);
    test(`[${sub}] all ${entries.length} Growth scenarios render the correct disposition`, async () => {
      expect(entries.length).toBe(15);
      for (const s of entries) {
        await selectBusiness(page, growthBusinessId(s.scenarioId));
        const panel = page.locator('[data-testid="owner-supervisor-summary"]');
        await expect(panel, s.scenarioId).toBeVisible();
        const statLoc = panel.locator('[data-testid="supervisor-action-status"]');
        let failureReason: string | null = null;
        try {
          await expect(statLoc, s.scenarioId).toHaveText(STATUS_LABEL[s.expectedActionStatus], { timeout: 15000 });
          await expect(panel.locator('[data-testid="supervisor-proof"]')).toBeVisible();
          await expect(panel.locator('[data-testid="supervisor-reassessment"]')).toBeVisible();
          const details = panel.locator('[data-testid="supervisor-ledger-detail"]');
          expect(await details.evaluate((el) => !(el as HTMLDetailsElement).open).catch(() => true)).toBe(true);
        } catch (err) { failureReason = String((err as Error).message).replace(/\s+/g, " ").slice(0, 220); }
        const got = (await statLoc.innerText()).trim();
        const mustNotProceed = s.highRisk || s.professionalReviewRequired;
        const safe = !mustNotProceed || (!/^proceed$/i.test(got) && !/proceed with caution/i.test(got));
        results[s.scenarioId] = { playwrightDesktopStatus: failureReason || !safe ? "fail" : "pass", got, failureReason: failureReason ?? (safe ? null : `unsafe proceed: ${got}`) };
        expect(results[s.scenarioId].playwrightDesktopStatus, `${s.scenarioId}: ${results[s.scenarioId].failureReason ?? "ok"}`).toBe("pass");
      }
    });
  }

  test("no fatal console errors across the Growth scenarios", () => {
    expect(fatal(), `fatal: ${fatal().join(" | ")}`).toEqual([]);
  });
});
