/**
 * Flow 41 — SEQUENTIAL SIMULATIONS pack, REAL browser desktop. For each simulation, renders the runtime-fed
 * SupervisorSummary for its representative (climax) event from DB-backed data. Proves per simulation: panel renders,
 * the event's action status matches its intended disposition, proof + reassessment visible, advanced reasoning
 * collapsed, and NO owner-gated / boundary / missing-data event reads "Proceed". Shardable via SIM_SHARD_INDEX /
 * SIM_SHARD_TOTAL (each shard covers ≥20 simulations). Writes a desktop run-ledger. Requires seed-business-simulation-e2e.ts.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { writeFileSync } from "fs";
import { authenticateUser, waitForPageReady } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";
import { BUSINESS_SIMULATION_PACK } from "../../src/domain/scenarios/business-simulation-pack";
import { simEventBusinessId, representativeEvent } from "../../scripts/seed-business-simulation-scenarios";

const STATUS_LABEL: Record<string, string> = {
  proceed: "Proceed", cautious_proceed: "Proceed with caution", owner_decision_required: "Owner decision required",
  need_more_data: "Need more data", blocked: "Blocked",
};
const MUST_NOT_PROCEED = new Set(["owner_decision_required", "blocked", "need_more_data"]);

const shardIndex = Number(process.env.SIM_SHARD_INDEX ?? 0);
const shardTotal = Number(process.env.SIM_SHARD_TOTAL ?? 0);
const sims = shardTotal > 0 ? BUSINESS_SIMULATION_PACK.filter((_, i) => (i % shardTotal) === (shardIndex - 1)) : BUSINESS_SIMULATION_PACK;

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

test.describe("41 — Sequential Simulations desktop (one login)", () => {
  let context: BrowserContext; let page: Page;
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext(); page = await context.newPage();
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner", { waitUntil: "networkidle" }); await waitForPageReady(page);
  });
  test.afterAll(async () => {
    writeFileSync("OPSIQ_SEQUENTIAL_SIMULATIONS_DESKTOP.run.json", JSON.stringify({ layer: "sim-desktop", shardIndex, shardTotal, count: Object.keys(results).length, results }, null, 2) + "\n", "utf8");
    await context.close();
  });

  test(`renders the representative event of ${sims.length} simulations with the correct disposition`, async () => {
    expect(sims.length).toBeGreaterThanOrEqual(20);
    for (const sim of sims) {
      const event = representativeEvent(sim);
      await selectBusiness(page, simEventBusinessId(event.eventId));
      const panel = page.locator('[data-testid="owner-supervisor-summary"]');
      await expect(panel, sim.simulationId).toBeVisible();
      const statLoc = panel.locator('[data-testid="supervisor-action-status"]');
      let failureReason: string | null = null;
      try {
        await expect(statLoc, sim.simulationId).toHaveText(STATUS_LABEL[event.expectedDecision], { timeout: 15000 });
        await expect(panel.locator('[data-testid="supervisor-proof"]')).toBeVisible();
        await expect(panel.locator('[data-testid="supervisor-reassessment"]')).toBeVisible();
        const details = panel.locator('[data-testid="supervisor-ledger-detail"]');
        expect(await details.evaluate((el) => !(el as HTMLDetailsElement).open).catch(() => true)).toBe(true);
      } catch (err) { failureReason = String((err as Error).message).replace(/\s+/g, " ").slice(0, 220); }
      const got = (await statLoc.innerText()).trim();
      const safe = !MUST_NOT_PROCEED.has(event.expectedDecision) || (!/^proceed$/i.test(got) && !/proceed with caution/i.test(got));
      results[sim.simulationId] = { playwrightDesktopStatus: failureReason || !safe ? "fail" : "pass", got, failureReason: failureReason ?? (safe ? null : `unsafe proceed: ${got}`) };
      expect(results[sim.simulationId].playwrightDesktopStatus, `${sim.simulationId}: ${results[sim.simulationId].failureReason ?? "ok"}`).toBe("pass");
    }
  });

  test("no fatal console errors across the simulations", () => {
    expect(fatal(), `fatal: ${fatal().join(" | ")}`).toEqual([]);
  });
});
