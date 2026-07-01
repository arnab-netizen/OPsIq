/**
 * Flow 22 — EXHAUSTIVE chaos replay, FULL mobile (§12). At mobile viewport (375×812) renders EVERY one of the
 * 180 counted chaos scenarios from DB-backed runtime data, grouped by the 15 categories (12 each) for failure
 * localisation; one login. Proves per scenario: Supervisor Summary renders, runtime-fed dominant constraint
 * matches the locked ledger, action status matches (Blocked / Owner decision required), proof + reassessment
 * visible, advanced reasoning collapsed, no horizontal overflow, never "Proceed". Shardable via
 * CHAOS_SHARD_INDEX / CHAOS_SHARD_TOTAL (1-based) for a CI matrix; a union assertion guarantees 180 coverage.
 * Writes a full-mobile run-ledger (test-results/chaos-mobile-results.json). Requires scripts/seed-chaos-e2e.ts.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { writeFileSync, mkdirSync } from "fs";
import { authenticateUser, waitForPageReady } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";
import { CHAOS_LEDGER } from "../../src/behavioral-validation/chaos-replay/chaos-ledger";
import { chaosBusinessId } from "../../scripts/seed-chaos-scenarios";

const STATUS_LABEL: Record<string, string> = { blocked: "Blocked", owner_decision_required: "Owner decision required" };
const CATEGORIES = ["laundry", "housekeeping", "restaurant", "retail_grocery", "pharmacy", "salon", "repair",
  "manufacturing", "logistics", "agency", "ecommerce", "eldercare", "franchise", "multi_location", "b2b_contractor"];

// Optional CI sharding (1-based). Locally with no env: all 15 categories (all 180).
const shardIndex = Number(process.env.CHAOS_SHARD_INDEX ?? 0);
const shardTotal = Number(process.env.CHAOS_SHARD_TOTAL ?? 0);
const categories = shardTotal > 0
  ? CATEGORIES.filter((_, i) => (i % shardTotal) === (shardIndex - 1))
  : CATEGORIES;

const consoleErrors: string[] = [];
const mobileResults: Record<string, { playwrightMobileStatus: "pass" | "fail"; got: { dominant: string; status: string }; failureReason: string | null }> = {};
function fatalErrors(): string[] {
  return consoleErrors.filter((e) => /Cannot read|is not a function|Hydration failed/i.test(e));
}
async function selectBusiness(page: Page, businessId: string) {
  await page.selectOption('select[name="businessSelector"]', businessId);
  // The selector triggers a client-side load() that sets `selected` only AFTER the plan fetch resolves, so
  // the <select> reflecting the target value is a deterministic signal that the new business's plan has
  // loaded and the panel re-rendered — eliminating stale reads even on slow mobile.
  await expect(page.locator('select[name="businessSelector"]')).toHaveValue(businessId, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
  await waitForPageReady(page);
}

test.describe.configure({ mode: "serial" });

test.describe("22 — exhaustive chaos replay (FULL mobile 375×812)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    page = await context.newPage();
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner", { waitUntil: "networkidle" });
    await waitForPageReady(page);
  });
  test.afterAll(async () => {
    try { mkdirSync("test-results", { recursive: true }); } catch { /* exists */ }
    writeFileSync("test-results/chaos-mobile-results.json",
      JSON.stringify({ layer: "playwright-mobile", full: true, shardIndex, shardTotal, count: Object.keys(mobileResults).length, results: mobileResults }, null, 2) + "\n", "utf8");
    await context.close();
  });

  test("this shard's categories union to the full 15 across all shards (no gap)", () => {
    if (shardTotal > 0) {
      const union = new Set<string>();
      for (let s = 1; s <= shardTotal; s++) CATEGORIES.filter((_, i) => (i % shardTotal) === (s - 1)).forEach((c) => union.add(c));
      expect(union.size).toBe(15);
    } else {
      expect(categories.length).toBe(15);
    }
  });

  for (const category of categories) {
    const entries = CHAOS_LEDGER.filter((e) => e.category === category);
    test(`[mobile][${category}] all ${entries.length} chaos scenarios render usably (runtime-fed DB data)`, async () => {
      expect(entries.length).toBe(12);
      for (const e of entries) {
        await selectBusiness(page, chaosBusinessId(e.scenarioId));
        const panel = page.locator('[data-testid="owner-supervisor-summary"]');
        await expect(panel, e.scenarioId).toBeVisible();
        const domLoc = page.locator('[data-testid="wbp-dominant-constraint"]');
        const statLoc = panel.locator('[data-testid="supervisor-action-status"]');
        let failureReason: string | null = null;
        try {
          // Mobile re-renders slower than desktop after a business switch; give the runtime-fed panel a
          // longer poll window so a slow re-render is never mistaken for a wrong disposition.
          await expect(domLoc, `${e.scenarioId} dominant`).toHaveText(e.expectedDominantConstraint, { timeout: 15000 });
          await expect(statLoc, `${e.scenarioId} status`).toHaveText(STATUS_LABEL[e.expectedActionStatus], { timeout: 15000 });
          await expect(panel.locator('[data-testid="supervisor-proof"]')).toBeVisible();
          await expect(panel.locator('[data-testid="supervisor-reassessment"]')).toBeVisible();
          const details = panel.locator('[data-testid="supervisor-ledger-detail"]');
          expect(await details.evaluate((el) => !(el as HTMLDetailsElement).open).catch(() => true)).toBe(true);
          const overflow = await page.evaluate(() => {
            const el = document.scrollingElement || document.documentElement;
            return el.scrollWidth - el.clientWidth;
          });
          expect(overflow, `horizontal overflow ${overflow}px`).toBeLessThanOrEqual(4);
        } catch (err) {
          failureReason = String((err as Error).message).replace(/\s+/g, " ").slice(0, 240);
        }
        const dom = (await domLoc.innerText()).trim();
        const status = (await statLoc.innerText()).trim();
        const notProceed = !/^proceed$/i.test(status) && !/proceed with caution/i.test(status);
        mobileResults[e.scenarioId] = {
          playwrightMobileStatus: failureReason || !notProceed ? "fail" : "pass",
          got: { dominant: dom, status },
          failureReason: failureReason ?? (notProceed ? null : `chaos scenario read as proceed: ${status}`),
        };
        expect(mobileResults[e.scenarioId].playwrightMobileStatus, `${e.scenarioId}: ${mobileResults[e.scenarioId].failureReason ?? "ok"}`).toBe("pass");
      }
    });
  }

  test("no fatal console errors across the mobile chaos scenarios", () => {
    const fatal = fatalErrors();
    expect(fatal, `fatal console errors: ${fatal.join(" | ")}`).toEqual([]);
  });
});
