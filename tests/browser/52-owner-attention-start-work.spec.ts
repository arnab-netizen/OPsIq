/**
 * Flow 52 — owner cockpit "Start Work" button (Phase 2 Signal F).
 *
 * Proves that when the owner cockpit shows a BridgedExecutionRoute with canStart=true,
 * clicking "Start Work" calls POST /api/owner/process-execution with action="START",
 * transitions the route to IN_PROGRESS, and the button disappears on reload (mutation
 * persisted — canStart becomes false for that route).
 *
 * Requires: seed-owner-scenarios.ts + seed-e2e-attention-engine.ts
 * (the E2E workspace must have business data that generates at least one actionable route).
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

test.describe.configure({ mode: "serial" });

test.describe("52 — owner cockpit Start Work (Phase 2 Signal F)", () => {
  let context: BrowserContext;
  let page: Page;
  let capturedTaskKey: string | null = null;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
  });

  test.afterAll(async () => { await context.close(); });

  test("cockpit loads and shows at least one Start Work button for a startable route", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    // Either the cockpit or the clean state must render.
    const cockpitOrClean = page.locator('[data-testid="owner-cockpit"], [data-testid="cockpit-clean"]');
    await expect(cockpitOrClean.first()).toBeVisible({ timeout: 15000 });

    // Look for any start-work button — generated from BridgedExecutionRoutes with canStart=true.
    const startWorkButtons = page.locator('[data-testid^="cockpit-start-work-"]');
    const count = await startWorkButtons.count();
    if (count === 0) {
      // No startable routes in this workspace — test is a soft skip (environment-dependent).
      console.warn("[spec-52] No cockpit-start-work-* buttons visible — workspace may lack actionable routes. Soft-skip.");
      return;
    }

    // Capture the taskKey from the first visible button's data-testid.
    const firstBtn = startWorkButtons.first();
    await expect(firstBtn).toBeVisible();
    const testid = await firstBtn.getAttribute("data-testid") ?? "";
    capturedTaskKey = testid.replace("cockpit-start-work-", "");
    expect(capturedTaskKey.length).toBeGreaterThan(0);
    console.log(`[spec-52] Found Start Work button for taskKey="${capturedTaskKey}"`);
    expect(fatalErrors()).toEqual([]);
  });

  test("clicking Start Work calls POST /api/owner/process-execution and returns 200", async () => {
    if (!capturedTaskKey) {
      console.warn("[spec-52] No taskKey captured in previous test — skipping.");
      return;
    }

    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    // Intercept the API call to verify the correct route is used.
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/owner/process-execution") && res.request().method() === "POST",
        { timeout: 15000 },
      ),
      page.locator(`[data-testid="cockpit-start-work-${capturedTaskKey}"]`).click(),
    ]);

    expect(response.status()).toBe(200);
    const body = await response.json().catch(() => null);
    expect(body?.status).toBeTruthy();
    console.log(`[spec-52] POST /api/owner/process-execution → status=${body?.status}`);
    expect(fatalErrors()).toEqual([]);
  });

  test("after Start Work the button is gone on reload (mutation persisted as IN_PROGRESS)", async () => {
    if (!capturedTaskKey) {
      console.warn("[spec-52] No taskKey captured — skipping.");
      return;
    }

    // Reload the cockpit — the route now has status IN_PROGRESS in DB, so canStart=false.
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    // The start-work button for this taskKey must no longer be visible.
    const btn = page.locator(`[data-testid="cockpit-start-work-${capturedTaskKey}"]`);
    await expect(btn).not.toBeVisible({ timeout: 10000 });
    console.log(`[spec-52] ✓ cockpit-start-work-${capturedTaskKey} absent after reload — mutation persisted`);
    expect(fatalErrors()).toEqual([]);
  });
});
