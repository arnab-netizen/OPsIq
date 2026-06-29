/**
 * Flow C — Finance/budget safety is visible; unsafe growth cannot silently succeed.
 *
 * The seed records a real committed statutory-payroll obligation due in 5 days, which drives
 * the Dynamic Budget mode to EMERGENCY through the real service path. /owner/budget must show
 * the cash-risk mode, the BLOCK decision (growth spend is blocked, not silently allowed), and
 * the reason / next best action (freeze + protect cash).
 */
import { test, expect } from "@playwright/test";
import { authenticateUser, waitForPageReady, captureScreenshot } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";

test.describe("C — Finance/budget safety visible", () => {
  test("budget shows EMERGENCY cash-risk, blocks growth spend, and shows the reason", async ({ page }) => {
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner/budget", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const body = page.locator("body");

    // Cash-risk / defensive budget mode is visible (not GROW).
    await expect(body).toContainText(/current budget mode/i);
    await expect(body).toContainText(/EMERGENCY/);

    // Unsafe growth cannot silently succeed: the decision is BLOCK and the reason is shown.
    await expect(body).toContainText(/next best action/i);
    await expect(body).toContainText(/BLOCK/);
    await expect(body).toContainText(/freeze|protect cash/i);
    // The "why" (top constraint) is surfaced — a reason, not a silent state.
    await expect(body).toContainText(/why first/i);

    await captureScreenshot(page, "C-budget-emergency");
  });
});
