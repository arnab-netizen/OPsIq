/**
 * Flow F — Owner command center mobile-viewport smoke.
 *
 * Proves the owner command center renders and stays usable on a small/mobile viewport against the
 * real seeded backend (no mock route): login as a real OWNER → /owner renders the control center
 * panel with its safety/next-action content, and no fatal page error occurs at 375×812.
 */
import { test, expect } from "@playwright/test";
import { authenticateUser, waitForPageReady } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";

test.describe("F — Owner command center (mobile viewport)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("renders the control center on a mobile viewport with no fatal error", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });

    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const panel = page.locator('[data-testid="owner-control-center"]');
    await expect(panel).toBeVisible();
    // Core owner content is reachable on mobile (next best action / do this next).
    await expect(page.locator("body")).toContainText(/next best action|do this next/i);

    // No Next.js fatal error overlay on the critical flow.
    await expect(page.locator("body")).not.toContainText(/Application error: a client-side exception/i);
    const fatal = consoleErrors.filter((e) => /Cannot read|is not a function|Hydration failed/i.test(e));
    expect(fatal, `fatal console errors: ${fatal.join(" | ")}`).toEqual([]);
  });
});
