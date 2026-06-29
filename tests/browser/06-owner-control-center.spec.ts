/**
 * Flow A — Owner command center (real backend, server-enforced).
 *
 * Proves the owner-visible control center end-to-end in a real browser against a seeded
 * PostgreSQL: login as a real OWNER → /owner renders the OpsIQ control center from real
 * backend data (no mock route), showing blocked/safety state, the next best action, the
 * what-NOT-to-do guidance and the owner-action / handled-by-OpsIQ attention summary.
 */
import { test, expect } from "@playwright/test";
import { authenticateUser, waitForPageReady, captureScreenshot } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";

test.describe("A — Owner control center (real data, server-enforced)", () => {
  test("renders the control center with safety state, next action, what-not-to-do, attention", async ({ page }) => {
    // Record the backend routes the page actually calls (prove the REAL governed routes are used).
    const apiCalls: string[] = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.pathname.startsWith("/api/")) apiCalls.push(u.pathname);
    });

    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const panel = page.locator('[data-testid="owner-control-center"]');
    await expect(panel).toBeVisible();

    // Attention summary (owner-action / handled-by-OpsIQ).
    await expect(panel).toContainText(/owner action/i);
    await expect(panel).toContainText(/handled by OpsIQ/i);

    // Blocked / safety state is visible (business condition survival risk + control sections).
    await expect(page.locator("body")).toContainText(/survival risk/i);
    await expect(panel).toContainText(/proof blocked|finance blocked|blocked recs/i);

    // Next best action is visible (control-center next action and/or the "Do this next" block).
    await expect(page.locator("body")).toContainText(/next best action|do this next/i);

    // What NOT to do is visible (seeded down-equipment bottleneck guarantees the guidance).
    await expect(panel).toContainText(/what NOT to do/i);

    // The page used the REAL governed routes — no mock governance surface.
    await page.waitForLoadState("networkidle");
    expect(apiCalls).toContain("/api/owner/command-center");
    expect(apiCalls).toContain("/api/owner/control-center");
    expect(apiCalls.some((p) => p.includes("/mock") || p.includes("/decisions/"))).toBe(false);

    await captureScreenshot(page, "A-owner-control-center");
  });
});
