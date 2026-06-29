/**
 * Flow H — 10 representative public-case flows through the command-center whole-business card.
 *
 * Each scenario is a DB-backed owner business seeded to bind on a distinct dominant constraint (proven at
 * the service level by owner-scenario-constraints.test.ts). For each flow the card must render from the
 * runtime: dominant constraint, do-not-do/stop, next action, owner-workload/offload, proof, reassessment,
 * growth/arbitration, provider-backed + confidence, and stored-learning provenance — no critical console
 * errors. One login is shared across the serial flows (avoids the login rate limiter). 3 mobile flows.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { authenticateUser, waitForPageReady } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";
import { BROWSER_SCENARIOS, MOBILE_SCENARIOS, scenarioBusinessId, type Scenario } from "../../src/services/owner-mode/owner-scenario-profiles";

const consoleErrors: string[] = [];
function watchConsole(page: Page) {
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
}
function fatalErrors(): string[] {
  return consoleErrors.filter((e) => /Cannot read|is not a function|Hydration failed/i.test(e));
}

async function assertScenario(page: Page, s: Scenario) {
  const before = consoleErrors.length;
  await page.selectOption('select[name="businessSelector"]', scenarioBusinessId(s.id));
  await page.waitForLoadState("networkidle");
  await waitForPageReady(page);

  const panel = page.locator('[data-testid="owner-whole-business-plan"]');
  await expect(panel, `${s.id}: whole-business card`).toBeVisible();
  // dominant constraint = the scenario's expected binding constraint (rendered from the runtime)
  await expect(panel.locator('[data-testid="wbp-dominant-constraint"]'), `${s.id}: dominant`).toHaveText(s.expectedConstraint);
  await expect(panel.locator('[data-testid="wbp-top-priority"]')).toBeVisible();
  await expect(panel.locator('[data-testid="wbp-next-action"]')).toContainText(/\w+/);
  await expect(panel.locator('[data-testid="wbp-do-not-do"]'), `${s.id}: do-not-do`).toContainText(/do not|stop|blocked/i);
  await expect(panel.locator('[data-testid="wbp-owner-workload"]'), `${s.id}: owner workload`).toContainText(/owner workload|offload|delegate/i);
  await expect(panel.locator('[data-testid="wbp-proof"]'), `${s.id}: proof`).toContainText(/proof/i);
  await expect(panel.locator('[data-testid="wbp-reassessment"]'), `${s.id}: reassessment`).toContainText(/reassess/i);
  await expect(panel.locator('[data-testid="wbp-growth-gate"]'), `${s.id}: growth`).toContainText(/growth|scale/i);
  await expect(panel.locator('[data-testid="wbp-arbitration"]'), `${s.id}: arbitration`).toContainText(/arbitration|wins|rejected/i);
  await expect(panel.locator('[data-testid="wbp-provider-status"]'), `${s.id}: provider-backed`).toContainText(/provider-backed data/i);
  await expect(panel.locator('[data-testid="wbp-confidence"]'), `${s.id}: confidence`).toContainText(/confidence/i);
  await expect(panel.locator('[data-testid="wbp-learning"]'), `${s.id}: learning`).toContainText(/stored learning applied/i);

  const fatal = fatalErrors();
  expect(fatal, `${s.id}: fatal console errors: ${fatal.join(" | ")}`).toEqual([]);
  void before;
}

test.describe.configure({ mode: "serial" });

test.describe("H — representative whole-business flows (desktop, one login)", () => {
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

  for (const s of BROWSER_SCENARIOS) {
    test(`flow: ${s.id} → ${s.expectedConstraint}`, async () => {
      await assertScenario(page, s);
    });
  }
});

test.describe("H — representative whole-business flows (mobile viewport)", () => {
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

  for (const s of MOBILE_SCENARIOS) {
    test(`mobile flow: ${s.id} → ${s.expectedConstraint}`, async () => {
      await assertScenario(page, s);
    });
  }
});
