/**
 * Flow 22 — EXHAUSTIVE chaos replay, REPRESENTATIVE mobile (§7). At mobile viewport (375×812) renders a
 * representative slice of the 180 chaos scenarios: up to 3 per category (one good + one bad + one ugly where
 * available) ⇒ ≥45 scenarios spanning ALL 15 categories, all good/bad/ugly classes, and both genuine chaos
 * action statuses (blocked + owner_decision_required). Proves the runtime-fed supervisor panel is usable on
 * mobile (renders, correct runtime dominant + status, no horizontal scroll). Writes a mobile results
 * artifact. Requires scripts/seed-chaos-e2e.ts.
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

/** Up to 3 per category — one good, one bad, one ugly where present (deterministic). */
function representativeSlice() {
  const out: typeof CHAOS_LEDGER = [];
  for (const cat of CATEGORIES) {
    const inCat = CHAOS_LEDGER.filter((e) => e.category === cat);
    for (const gbu of ["good", "bad", "ugly"] as const) {
      const pick = inCat.find((e) => e.goodBadUgly === gbu);
      if (pick) out.push(pick);
    }
  }
  return out;
}

const SLICE = representativeSlice();
const mobileResults: Record<string, { playwrightMobileStatus: "pass" | "fail"; got: { dominant: string; status: string }; failureReason: string | null }> = {};

async function selectBusiness(page: Page, businessId: string) {
  await page.selectOption('select[name="businessSelector"]', businessId);
  await page.waitForLoadState("networkidle");
  await waitForPageReady(page);
}

test.describe.configure({ mode: "serial" });

test.describe("22 — exhaustive chaos replay (mobile 375×812, representative)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    page = await context.newPage();
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner", { waitUntil: "networkidle" });
    await waitForPageReady(page);
  });
  test.afterAll(async () => {
    try { mkdirSync("test-results", { recursive: true }); } catch { /* exists */ }
    writeFileSync("test-results/chaos-mobile-results.json",
      JSON.stringify({ layer: "playwright-mobile", count: Object.keys(mobileResults).length, results: mobileResults }, null, 2) + "\n", "utf8");
    await context.close();
  });

  test(`covers ${SLICE.length} representative scenarios across all 15 categories and good/bad/ugly`, () => {
    expect(SLICE.length).toBeGreaterThanOrEqual(45);
    expect(new Set(SLICE.map((e) => e.category)).size).toBe(15);
    const gbu = new Set(SLICE.map((e) => e.goodBadUgly));
    expect(gbu.has("good") && gbu.has("bad") && gbu.has("ugly")).toBe(true);
  });

  for (const cat of CATEGORIES) {
    const entries = SLICE.filter((e) => e.category === cat);
    test(`[mobile][${cat}] ${entries.length} scenarios render usably with correct runtime disposition`, async () => {
      for (const e of entries) {
        await selectBusiness(page, chaosBusinessId(e.scenarioId));
        const panel = page.locator('[data-testid="owner-supervisor-summary"]');
        await expect(panel, e.scenarioId).toBeVisible();
        let failureReason: string | null = null;
        try {
          await expect(page.locator('[data-testid="wbp-dominant-constraint"]'), e.scenarioId).toHaveText(e.expectedDominantConstraint);
          await expect(panel.locator('[data-testid="supervisor-action-status"]')).toHaveText(STATUS_LABEL[e.expectedActionStatus]);
          const overflow = await page.evaluate(() => {
            const el = document.scrollingElement || document.documentElement;
            return el.scrollWidth - el.clientWidth;
          });
          expect(overflow, `horizontal overflow ${overflow}px`).toBeLessThanOrEqual(4);
        } catch (err) {
          failureReason = String((err as Error).message).replace(/\s+/g, " ").slice(0, 240);
        }
        const dom = (await page.locator('[data-testid="wbp-dominant-constraint"]').innerText()).trim();
        const status = (await panel.locator('[data-testid="supervisor-action-status"]').innerText()).trim();
        mobileResults[e.scenarioId] = {
          playwrightMobileStatus: failureReason ? "fail" : "pass",
          got: { dominant: dom, status },
          failureReason,
        };
        expect(mobileResults[e.scenarioId].playwrightMobileStatus, `${e.scenarioId}: ${failureReason ?? "ok"}`).toBe("pass");
      }
    });
  }
});
