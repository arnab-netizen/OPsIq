/**
 * Flow 26 — STAFF/PROOF/ANTI-GAMING pack, REAL browser mobile (375×812). Renders all 120 Staff/Proof scenarios
 * from DB-backed data at mobile viewport, grouped by the 12 subcategories. Proves per scenario: panel renders,
 * action status matches the intended disposition, no horizontal overflow, and NO high-risk / professional-review
 * / fraud / collusion case reads "Proceed". Shardable via SPA_SHARD_INDEX / SPA_SHARD_TOTAL. Writes a mobile
 * run-ledger. Requires seed-staff-proof-e2e.ts.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { writeFileSync } from "fs";
import { authenticateUser, waitForPageReady } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";
import { STAFF_PROOF_ANTI_GAMING_PACK, STAFF_PROOF_SUBCATEGORIES } from "../../src/domain/scenarios/staff-proof-anti-gaming-pack";
import { HIGH_PROOF_RISK_STATES, HIGH_MANIPULATION_RISK_STATES } from "../../src/domain/scenarios/business-reality-scenario";
import { staffProofBusinessId } from "../../scripts/seed-staff-proof-scenarios";

const STATUS_LABEL: Record<string, string> = {
  proceed: "Proceed", cautious_proceed: "Proceed with caution", owner_decision_required: "Owner decision required",
  need_more_data: "Need more data", blocked: "Blocked",
};
const SUBCATS = [...STAFF_PROOF_SUBCATEGORIES];

const shardIndex = Number(process.env.SPA_SHARD_INDEX ?? 0);
const shardTotal = Number(process.env.SPA_SHARD_TOTAL ?? 0);
const subcats = shardTotal > 0 ? SUBCATS.filter((_, i) => (i % shardTotal) === (shardIndex - 1)) : SUBCATS;

const results: Record<string, { playwrightMobileStatus: "pass" | "fail"; got: string; failureReason: string | null }> = {};

async function selectBusiness(page: Page, businessId: string) {
  await page.selectOption('select[name="businessSelector"]', businessId);
  await expect(page.locator('select[name="businessSelector"]')).toHaveValue(businessId, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
  await waitForPageReady(page);
}

test.describe.configure({ mode: "serial" });

test.describe("26 — Staff/Proof/Anti-Gaming mobile 375×812 (one login)", () => {
  let context: BrowserContext; let page: Page;
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 375, height: 812 } }); page = await context.newPage();
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner", { waitUntil: "networkidle" }); await waitForPageReady(page);
  });
  test.afterAll(async () => {
    // Write to the repo root (NOT test-results/, which the HTML reporter clears between runs).
    writeFileSync("OPSIQ_STAFF_PROOF_ANTI_GAMING_MOBILE.run.json", JSON.stringify({ layer: "spa-mobile", shardIndex, shardTotal, count: Object.keys(results).length, results }, null, 2) + "\n", "utf8");
    await context.close();
  });

  for (const sub of subcats) {
    const entries = STAFF_PROOF_ANTI_GAMING_PACK.filter((s) => s.category === sub);
    test(`[mobile][${sub}] all ${entries.length} Staff/Proof scenarios render usably`, async () => {
      expect(entries.length).toBe(10);
      for (const s of entries) {
        await selectBusiness(page, staffProofBusinessId(s.scenarioId));
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
        const mustNotProceed = s.highRisk || s.professionalReviewRequired
          || HIGH_PROOF_RISK_STATES.has(s.expectedProofRiskState ?? "none")
          || HIGH_MANIPULATION_RISK_STATES.has(s.expectedManipulationRiskState ?? "none");
        const safe = !mustNotProceed || (!/^proceed$/i.test(got) && !/proceed with caution/i.test(got));
        results[s.scenarioId] = { playwrightMobileStatus: failureReason || !safe ? "fail" : "pass", got, failureReason: failureReason ?? (safe ? null : `unsafe proceed: ${got}`) };
        expect(results[s.scenarioId].playwrightMobileStatus, `${s.scenarioId}: ${results[s.scenarioId].failureReason ?? "ok"}`).toBe("pass");
      }
    });
  }
});
