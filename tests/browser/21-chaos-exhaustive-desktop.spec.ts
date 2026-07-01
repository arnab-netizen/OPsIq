/**
 * Flow 21 — EXHAUSTIVE chaos replay, REAL browser desktop (§6). Renders the runtime-fed SupervisorSummary
 * for EVERY one of the 180 counted chaos scenarios (165 corpus + 15 gold), reading the DB-backed owner plan
 * for each seeded business. Grouped by the 15 categories (12 scenarios each) for failure localisation; one
 * login. Proves per scenario: panel renders, runtime-fed dominant constraint matches the locked ledger,
 * action status matches (Blocked / Owner decision required), proof + reassessment visible, advanced reasoning
 * collapsed, no fatal console errors, and a chaos case NEVER reads as "Proceed".
 *
 * Shardable via CHAOS_SHARD_INDEX / CHAOS_SHARD_TOTAL (1-based) for a CI matrix. Writes a per-scenario
 * results artifact (test-results/chaos-desktop-results.json) consumed by the report.
 * Requires: scripts/seed-chaos-e2e.ts (loginable owner + 180 chaos businesses).
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

// Optional CI sharding (1-based). Locally: all categories.
const shardIndex = Number(process.env.CHAOS_SHARD_INDEX ?? 0);
const shardTotal = Number(process.env.CHAOS_SHARD_TOTAL ?? 0);
const categories = shardTotal > 0
  ? CATEGORIES.filter((_, i) => (i % shardTotal) === (shardIndex - 1))
  : CATEGORIES;

const consoleErrors: string[] = [];
const desktopResults: Record<string, { playwrightDesktopStatus: "pass" | "fail"; got: { dominant: string; status: string }; failureReason: string | null }> = {};

function fatalErrors(): string[] {
  return consoleErrors.filter((e) => /Cannot read|is not a function|Hydration failed/i.test(e));
}
async function selectBusiness(page: Page, businessId: string) {
  await page.selectOption('select[name="businessSelector"]', businessId);
  await page.waitForLoadState("networkidle");
  await waitForPageReady(page);
}

test.describe.configure({ mode: "serial" });

test.describe("21 — exhaustive chaos replay (desktop, one login)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner", { waitUntil: "networkidle" });
    await waitForPageReady(page);
  });
  test.afterAll(async () => {
    try { mkdirSync("test-results", { recursive: true }); } catch { /* exists */ }
    writeFileSync("test-results/chaos-desktop-results.json",
      JSON.stringify({ layer: "playwright-desktop", shardIndex, shardTotal, count: Object.keys(desktopResults).length, results: desktopResults }, null, 2) + "\n", "utf8");
    await context.close();
  });

  for (const category of categories) {
    const entries = CHAOS_LEDGER.filter((e) => e.category === category);
    test(`[${category}] renders all ${entries.length} chaos scenarios from runtime-fed DB data`, async () => {
      expect(entries.length).toBeGreaterThan(0);
      for (const e of entries) {
        await selectBusiness(page, chaosBusinessId(e.scenarioId));
        const panel = page.locator('[data-testid="owner-supervisor-summary"]');
        await expect(panel, e.scenarioId).toBeVisible();
        const domLoc = page.locator('[data-testid="wbp-dominant-constraint"]');
        const statLoc = panel.locator('[data-testid="supervisor-action-status"]');
        // Poll until the NEW business's runtime-fed plan has re-rendered (dominant + status share values
        // across scenarios, so assert the expected value directly with auto-retry — no stale read).
        let failureReason: string | null = null;
        try {
          await expect(domLoc, `${e.scenarioId} dominant`).toHaveText(e.expectedDominantConstraint);
          await expect(statLoc, `${e.scenarioId} status`).toHaveText(STATUS_LABEL[e.expectedActionStatus]);
          await expect(panel.locator('[data-testid="supervisor-proof"]')).toBeVisible();
          await expect(panel.locator('[data-testid="supervisor-reassessment"]')).toBeVisible();
          const details = panel.locator('[data-testid="supervisor-ledger-detail"]');
          expect(await details.evaluate((el) => !(el as HTMLDetailsElement).open).catch(() => true)).toBe(true);
        } catch (err) {
          failureReason = String((err as Error).message).replace(/\s+/g, " ").slice(0, 240);
        }
        const dom = (await domLoc.innerText()).trim();
        const status = (await statLoc.innerText()).trim();
        const notProceed = !/^proceed$/i.test(status) && !/proceed with caution/i.test(status);
        desktopResults[e.scenarioId] = {
          playwrightDesktopStatus: failureReason || !notProceed ? "fail" : "pass",
          got: { dominant: dom, status },
          failureReason: failureReason ?? (notProceed ? null : `chaos scenario read as proceed: ${status}`),
        };
        expect(desktopResults[e.scenarioId].playwrightDesktopStatus, `${e.scenarioId}: ${desktopResults[e.scenarioId].failureReason ?? "ok"}`).toBe("pass");
      }
    });
  }

  test("no fatal console errors across the chaos scenarios", () => {
    const fatal = fatalErrors();
    expect(fatal, `fatal console errors: ${fatal.join(" | ")}`).toEqual([]);
  });
});
