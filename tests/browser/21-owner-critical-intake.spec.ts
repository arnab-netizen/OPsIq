/**
 * Flow 21 — CRITICAL-DOMAIN INGESTION (browser + mobile). Proves a real logged-in OWNER can, through the app UI,
 * enter the two critical ingestion domains that previously had NO owner write path — `equipment_capacity`
 * (OwnerCapacitySnapshot) and `owner_workload_memory` (OwnerWorkloadSnapshot) — which is what unblocked the structural
 * `need_more_data` wall (runtime-readiness P0). The owner creates a business, then submits a capacity snapshot and an
 * owner-workload snapshot on /owner/operations; each POST goes through the enforced route → service → DB and returns a
 * computed result rendered back to the owner. Mobile variant additionally asserts no horizontal overflow. No client
 * fakery; server enforcement (OWNER_MANAGE, workspace/business scope) stays active.
 *
 * Requires: scripts/seed-e2e-owner-pilot.ts (E2E owner + workspace).
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { authenticateUser, waitForPageReady } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";

const consoleErrors: string[] = [];
function watchConsole(page: Page) {
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
}
function fatalErrors(): string[] {
  return consoleErrors.filter((e) => /Cannot read|is not a function|Hydration failed/i.test(e));
}

/** Create a fresh business through the operations UI so the flow is self-contained, then return once selected. */
async function createBusiness(page: Page, name: string) {
  await page.getByRole("button", { name: "+ New business" }).click();
  await page.locator('input[name="name"]').fill(name);
  await page.selectOption('select[name="businessType"]', "laundry_local_service");
  await page.locator('input[name="currency"]').fill("INR");
  await page.getByRole("button", { name: "Create business" }).click();
  // After creation the page reloads the dashboard for the new business and shows the critical-intake section.
  await expect(page.locator('[data-testid="critical-intake-section"]')).toBeVisible({ timeout: 15000 });
  await waitForPageReady(page);
}

async function submitCapacity(page: Page) {
  await page.locator('[data-testid="capacity-form-toggle"]').click();
  await expect(page.locator('[data-testid="capacity-form"]')).toBeVisible();
  await page.getByTestId("capacity-currentRevenue").fill("100000");
  await page.getByTestId("capacity-utilization").fill("0.6");
  await page.getByTestId("capacity-submit").click();
  await expect(page.locator('[data-testid="capacity-result"]')).toContainText(/Capacity saved/i, { timeout: 15000 });
}

async function submitWorkload(page: Page) {
  await page.locator('[data-testid="workload-form-toggle"]').click();
  await expect(page.locator('[data-testid="workload-form"]')).toBeVisible();
  await page.getByTestId("workload-ownerMinutes").fill("300");
  await page.getByTestId("workload-sustainableMinutes").fill("480");
  await page.getByTestId("workload-submit").click();
  await expect(page.locator('[data-testid="workload-result"]')).toContainText(/workload saved/i, { timeout: 15000 });
}

test.describe.configure({ mode: "serial" });

test.describe("21 — owner critical-domain ingestion (desktop, one login)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner/operations", { waitUntil: "networkidle" });
    await waitForPageReady(page);
  });
  test.afterAll(async () => { await context.close(); });

  test("owner can submit capacity + owner-workload snapshots through the app", async () => {
    await createBusiness(page, `Critical Intake ${Date.now()}`);
    await submitCapacity(page);
    await submitWorkload(page);
  });

  test("no fatal console errors across the intake flow", () => {
    expect(fatalErrors(), `fatal: ${fatalErrors().join(" | ")}`).toEqual([]);
  });
});

test.describe("21 — owner critical-domain ingestion (mobile 375×812)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    page = await context.newPage();
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner/operations", { waitUntil: "networkidle" });
    await waitForPageReady(page);
  });
  test.afterAll(async () => { await context.close(); });

  test("[mobile] owner can submit capacity + workload with no horizontal overflow", async () => {
    await createBusiness(page, `Critical Intake M ${Date.now()}`);
    await submitCapacity(page);
    await submitWorkload(page);
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement;
      return el.scrollWidth - el.clientWidth;
    });
    expect(overflow, `overflow ${overflow}px`).toBeLessThanOrEqual(4);
  });
});
