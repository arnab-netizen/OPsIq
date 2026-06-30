/**
 * Flow 16 — owner-pilot COMMAND CENTER (browser). Proves the runtime-fed command center: the top
 * priority strip (≤5 cards), the readiness score + gate, the dynamic input-guidance card, and the
 * action/proof card all render; the strip content CHANGES with the business (no static fallback); and
 * the MANUAL input path (POST /api/owner/manual-entry) raises confidence / clears missing data on the
 * weak business. No critical console errors.
 *
 * Requires: scripts/seed-owner-scenarios.ts + scripts/seed-e2e-owner-pilot.ts.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { authenticateUser, waitForPageReady } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";
import { PILOT_WEAK_BIZ } from "./owner-pilot-fixtures";
import { scenarioBusinessId } from "../../src/services/owner-mode/owner-scenario-profiles";

const consoleErrors: string[] = [];
function watchConsole(page: Page) {
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
}
function fatalErrors(): string[] {
  return consoleErrors.filter((e) => /Cannot read|is not a function|Hydration failed/i.test(e));
}

async function selectBusiness(page: Page, businessId: string) {
  await page.selectOption('select[name="businessSelector"]', businessId);
  await page.waitForLoadState("networkidle");
  await waitForPageReady(page);
}

test.describe.configure({ mode: "serial" });

test.describe("16 — owner-pilot command center (desktop, one login)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner", { waitUntil: "networkidle" });
    await waitForPageReady(page);
  });
  test.afterAll(async () => { await context.close(); });

  test("priority strip renders with no more than 5 runtime-fed cards", async () => {
    await selectBusiness(page, scenarioBusinessId("cash_crisis"));
    const strip = page.locator('[data-testid="owner-priority-strip"]');
    await expect(strip).toBeVisible();
    const cards = strip.locator('[data-testid^="priority-card-"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(5);
    // Each card answers the seven questions (labels present in the rendered card).
    await expect(strip).toContainText(/Why:/);
    await expect(strip).toContainText(/Do next:/);
    await expect(strip).toContainText(/Who:/);
    await expect(strip).toContainText(/Proof:/);
    await expect(strip).toContainText(/Reassess:/);
  });

  test("readiness score, input-guidance, and action/proof cards render from the runtime", async () => {
    await expect(page.locator('[data-testid="owner-readiness-score"]')).toBeVisible();
    await expect(page.locator('[data-testid="readiness-overall"]')).toBeVisible();
    await expect(page.locator('[data-testid="readiness-gate"]')).toBeVisible();

    await expect(page.locator('[data-testid="owner-input-guidance"]')).toBeVisible();
    await expect(page.locator('[data-testid="guidance-confidence"]')).toContainText(/confidence/i);

    await expect(page.locator('[data-testid="owner-action-plan"]')).toBeVisible();
    await expect(page.locator('[data-testid="action-responsible"]')).toContainText(/who owns it/i);
    await expect(page.locator('[data-testid="action-proof"]')).toContainText(/proof/i);
  });

  test("the strip is runtime-fed: a different business produces different priority content (no static fallback)", async () => {
    await selectBusiness(page, scenarioBusinessId("cash_crisis"));
    // Web-first assertion auto-retries until the runtime constraint settles for this business.
    await expect(page.locator('[data-testid="wbp-dominant-constraint"]')).toHaveText("cash_survival");
    const cashText = (await page.locator('[data-testid="owner-priority-strip"]').innerText()).toLowerCase();

    await selectBusiness(page, scenarioBusinessId("growth_scale"));
    await expect(page.locator('[data-testid="wbp-dominant-constraint"]')).toHaveText("profitable_growth");
    const growthText = (await page.locator('[data-testid="owner-priority-strip"]').innerText()).toLowerCase();

    // Same surface, different runtime input → different rendered priorities (a static card cannot do this).
    expect(cashText).not.toEqual(growthText);
  });

  test("the MANUAL input path raises confidence / clears missing data on the weak business", async () => {
    await selectBusiness(page, PILOT_WEAK_BIZ);
    // The weak business (no financial data) requests revenue as the next best input and is low-confidence.
    await expect(page.locator('[data-testid="guidance-next-input"]')).toContainText(/revenue/i);
    await expect(page.locator('[data-testid="guidance-confidence"]')).toContainText(/low|none/i);

    // Submit the financial minimum through the REAL manual-entry route (same session cookies).
    const post = async (category: string, fields: Record<string, number>) =>
      page.request.post("/api/owner/manual-entry", {
        data: { businessId: PILOT_WEAK_BIZ, category, fields, confirm: true },
      });
    const r1 = await post("revenue_sales", { revenue: 500000 });
    expect(r1.ok(), `manual-entry revenue: ${r1.status()}`).toBeTruthy();
    const body1 = await r1.json();
    expect(body1.confidenceImproved !== undefined).toBeTruthy();
    await post("expenses", { costOfGoods: 250000 });
    await post("cash_debt", { cashOnHand: 90000 });
    await post("payroll", { payroll: 120000 });
    await post("staff_attendance", { attendancePct: 92 });

    // Reload the command center for the weak business — the confirmed intakes now feed confidence.
    await page.goto("/owner", { waitUntil: "networkidle" });
    await waitForPageReady(page);
    await selectBusiness(page, PILOT_WEAK_BIZ);

    // Revenue is no longer requested, and confidence is no longer low/none — the input path moved it.
    await expect(page.locator('[data-testid="guidance-next-input"]')).not.toContainText(/revenue/i);
    await expect(page.locator('[data-testid="guidance-confidence"]')).not.toContainText(/\b(low|none)\b/i);
  });

  test("no fatal console errors across the command center", async () => {
    const fatal = fatalErrors();
    expect(fatal, `fatal console errors: ${fatal.join(" | ")}`).toEqual([]);
  });
});
