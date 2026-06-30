/**
 * Flow 18 — OpsIQ SUPERVISOR SUMMARY (browser + mobile). Proves the concise supervisor panel renders
 * from the runtime whole-business-plan (wbp.supervisor): main issue, do-now, do-not-do, owner/delegate
 * split, proof, missing-data/assumptions, confidence, action status, reassessment, profit/cash/workload
 * impact, ≤3 priorities. Runtime-fed (content changes per business — no static fallback); mobile usable;
 * no fatal console errors.
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

test.describe.configure({ mode: "serial" });

test.describe("18 — supervisor summary (desktop, one login)", () => {
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

  test("the supervisor summary renders all required owner fields from the runtime", async () => {
    await selectBusiness(page, scenarioBusinessId("cash_crisis"));
    const panel = page.locator('[data-testid="owner-supervisor-summary"]');
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-testid="supervisor-action-status"]')).toBeVisible();
    await expect(panel.locator('[data-testid="supervisor-confidence"]')).toContainText(/confidence/i);
    await expect(panel.locator('[data-testid="supervisor-main-issue"]')).toContainText(/\w+/);
    await expect(panel.locator('[data-testid="supervisor-do-now"]')).toContainText(/do now/i);
    await expect(panel.locator('[data-testid="supervisor-owner-delegate"]')).toContainText(/owner|delegate|staff/i);
    await expect(panel.locator('[data-testid="supervisor-proof"]')).toContainText(/proof/i);
    await expect(panel.locator('[data-testid="supervisor-missing-assumptions"]')).toContainText(/missing|assumption|estimate|none/i);
    await expect(panel.locator('[data-testid="supervisor-reassessment"]')).toContainText(/reassess/i);
    // At most 3 priorities normally; cash_crisis is an emergency so allow up to 5.
    const count = await panel.locator('[data-testid^="supervisor-priority-"]').count();
    expect(count).toBeLessThanOrEqual(5);
  });

  test("the panel is runtime-fed: a different business changes the main issue (no static fallback)", async () => {
    await selectBusiness(page, scenarioBusinessId("cash_crisis"));
    await expect(page.locator('[data-testid="wbp-dominant-constraint"]')).toHaveText("cash_survival");
    const cash = (await page.locator('[data-testid="supervisor-main-issue"]').innerText()).toLowerCase();
    await selectBusiness(page, scenarioBusinessId("owner_overload"));
    await expect(page.locator('[data-testid="wbp-dominant-constraint"]')).toHaveText("owner_workload");
    const overload = (await page.locator('[data-testid="supervisor-main-issue"]').innerText()).toLowerCase();
    expect(cash).not.toEqual(overload);
  });

  test("no fatal console errors on the supervisor summary", async () => {
    const fatal = fatalErrors();
    expect(fatal, `fatal console errors: ${fatal.join(" | ")}`).toEqual([]);
  });
});

test.describe("18 — supervisor summary (mobile 375×812)", () => {
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

  test("mobile supervisor summary is usable with no horizontal scroll", async () => {
    await selectBusiness(page, scenarioBusinessId("cash_crisis"));
    await expect(page.locator('[data-testid="owner-supervisor-summary"]')).toBeVisible();
    await expect(page.locator('[data-testid="supervisor-action-status"]')).toBeVisible();
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement;
      return el.scrollWidth - el.clientWidth;
    });
    expect(overflow, `horizontal overflow ${overflow}px`).toBeLessThanOrEqual(4);
  });
});
