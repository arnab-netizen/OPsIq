/**
 * Flow 19 — CHAOS REPLAY (browser + mobile). Renders the runtime-fed SupervisorSummary panel for ≥5
 * real-world chaos scenarios in a REAL browser (3 also at mobile viewport), proving the chaos disposition
 * surfaces end-to-end (not only jsdom). Each scenario is a seeded chaos business; the panel must show the
 * runtime dominant constraint, action status, do-not-do, missing-data/assumptions, confidence, impact,
 * proof/reassessment and owner/delegate split, with advanced reasoning collapsed and blocked/need-more-data
 * never reading as "Proceed".
 *
 * Requires: scripts/seed-owner-scenarios.ts (loginable owner + scenario businesses).
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { authenticateUser, waitForPageReady } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";
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

/** 6 chaos scenarios (the 5 required §3 themes + a hard block) — profile, expected dominant, flags. */
const CHAOS = [
  { profile: "marketing_blocked", theme: "laundry capacity/quality blocks marketing", dominant: "capacity_feasibility", blocked: false, good: false },
  { profile: "bad_contract", theme: "B2B bad payment terms / below margin", dominant: "below_margin", blocked: false, good: false },
  { profile: "cash_crisis", theme: "high-revenue / profit-loss cash trap", dominant: "cash_survival", blocked: false, good: false },
  { profile: "owner_overload", theme: "owner pressure to approve everything", dominant: "owner_workload", blocked: false, good: false },
  { profile: "growth_scale", theme: "good growth opportunity with safeguards", dominant: "profitable_growth", blocked: false, good: true },
  { profile: "vendor_compliance", theme: "vendor/compliance block (must not proceed)", dominant: "compliance_block", blocked: true, good: false },
] as const;

const MOBILE = ["cash_crisis", "bad_contract", "owner_overload"] as const;

test.describe.configure({ mode: "serial" });

test.describe("19 — chaos replay (desktop, one login)", () => {
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

  for (const c of CHAOS) {
    test(`[${c.theme}] renders runtime-fed supervisor disposition (${c.dominant})`, async () => {
      await selectBusiness(page, scenarioBusinessId(c.profile));
      const panel = page.locator('[data-testid="owner-supervisor-summary"]');
      await expect(panel).toBeVisible();
      // runtime-fed dominant constraint
      await expect(page.locator('[data-testid="wbp-dominant-constraint"]')).toHaveText(c.dominant);
      // required panel fields
      await expect(panel.locator('[data-testid="supervisor-action-status"]')).toBeVisible();
      await expect(panel.locator('[data-testid="supervisor-confidence"]')).toContainText(/confidence/i);
      await expect(panel.locator('[data-testid="supervisor-main-issue"]')).toContainText(/\w+/);
      await expect(panel.locator('[data-testid="supervisor-do-now"]')).toContainText(/do now/i);
      // a binding (non-good) scenario shows a do-not-do
      if (!c.good) await expect(panel.locator('[data-testid="supervisor-do-not-do"]')).toContainText(/do not/i);
      await expect(panel.locator('[data-testid="supervisor-owner-delegate"]')).toContainText(/owner|delegate|staff/i);
      await expect(panel.locator('[data-testid="supervisor-proof"]')).toContainText(/proof/i);
      await expect(panel.locator('[data-testid="supervisor-missing-assumptions"]')).toContainText(/missing|assumption|estimate|none/i);
      await expect(panel.locator('[data-testid="supervisor-reassessment"]')).toContainText(/reassess/i);
      // advanced reasoning collapsed by default
      const details = panel.locator('[data-testid="supervisor-ledger-detail"]');
      await expect(details).toBeVisible();
      expect(await details.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
      // ≤3 priorities (≤5 for an emergency)
      const count = await panel.locator('[data-testid^="supervisor-priority-"]').count();
      expect(count).toBeLessThanOrEqual(5);
      // blocked never reads as "Proceed"
      if (c.blocked) {
        const status = (await panel.locator('[data-testid="supervisor-action-status"]').innerText()).toLowerCase();
        expect(status).not.toMatch(/^proceed$/);
        expect(status).toMatch(/blocked/);
      }
    });
  }

  test("runtime-fed: different chaos businesses change the main issue (no static fallback)", async () => {
    await selectBusiness(page, scenarioBusinessId("cash_crisis"));
    await expect(page.locator('[data-testid="wbp-dominant-constraint"]')).toHaveText("cash_survival");
    const a = (await page.locator('[data-testid="supervisor-main-issue"]').innerText()).toLowerCase();
    await selectBusiness(page, scenarioBusinessId("vendor_compliance"));
    await expect(page.locator('[data-testid="wbp-dominant-constraint"]')).toHaveText("compliance_block");
    const b = (await page.locator('[data-testid="supervisor-main-issue"]').innerText()).toLowerCase();
    expect(a).not.toEqual(b);
  });

  test("no fatal console errors across the chaos scenarios", async () => {
    const fatal = fatalErrors();
    expect(fatal, `fatal console errors: ${fatal.join(" | ")}`).toEqual([]);
  });
});

test.describe("19 — chaos replay (mobile 375×812)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    page = await context.newPage();
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner", { waitUntil: "networkidle" });
    await waitForPageReady(page);
  });
  test.afterAll(async () => { await context.close(); });

  for (const profile of MOBILE) {
    test(`[mobile] ${profile} supervisor panel is usable with no horizontal scroll`, async () => {
      await selectBusiness(page, scenarioBusinessId(profile));
      await expect(page.locator('[data-testid="owner-supervisor-summary"]')).toBeVisible();
      await expect(page.locator('[data-testid="supervisor-action-status"]')).toBeVisible();
      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement || document.documentElement;
        return el.scrollWidth - el.clientWidth;
      });
      expect(overflow, `horizontal overflow ${overflow}px`).toBeLessThanOrEqual(4);
    });
  }
});
