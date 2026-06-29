/**
 * Flow D — Opportunity / capacity / compliance indicators (where the UI surfaces them).
 *
 * Capacity: the seeded down machine surfaces as an equipment bottleneck in the control center.
 * SOP/process: the archetype's draft SOPs and processes surface as review indicators.
 * Opportunity: the owner decides an opportunity through the real /api/owner/opportunities/decide
 * route (server derives capacity + margin) and the verdict + reason render.
 *
 * Compliance: the control center has no dedicated compliance-count indicator today — recorded as
 * a product UI gap in OPSIQ_PLAYWRIGHT_MAX_OWNER_FLOW_REPORT.md (the licence IS seeded and read by
 * the compliance boundary; it is simply not surfaced as a control-center tile). Not faked here.
 */
import { test, expect } from "@playwright/test";
import { authenticateUser, waitForPageReady, captureScreenshot } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";

test.describe("D — Owner indicators (capacity, SOP, opportunity)", () => {
  test("capacity bottleneck + SOP review indicators render from real seeded data", async ({ page }) => {
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const panel = page.locator('[data-testid="owner-control-center"]');
    await expect(panel).toBeVisible();

    // Capacity: the seeded down machine surfaces as a named bottleneck (real data, not a placeholder).
    await expect(panel).toContainText(/equipment bottleneck/i);
    await expect(panel).toContainText(/industrial dryer/i);

    // SOP review indicator present.
    await expect(panel).toContainText(/SOPs to review/i);

    await captureScreenshot(page, "D-indicators");
  });

  test("owner decides an opportunity through the real route and sees a verdict + reason", async ({ page }) => {
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const actions = page.locator('[data-testid="owner-actions"]');
    await expect(actions).toBeVisible();
    await page.fill('input[placeholder="Fit score 0–1"]', "0.8");

    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/owner/opportunities/decide")),
      page.getByRole("button", { name: /^decide$/i }).click(),
    ]);
    expect(resp.status()).toBe(200);

    // Verdict + reason render (server-derived from the business's real capacity + margin).
    await expect(actions).toContainText(/accept|reject|defer/i);

    await captureScreenshot(page, "D-opportunity-decision");
  });
});
