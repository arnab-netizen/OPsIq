/**
 * Flow E — RBAC / workspace enforcement (server-side, not bypassable from the browser).
 *
 * A real member of the same workspace with NO owner role assignment is denied owner data
 * (the owner APIs return 403 and the control center does not render). An unauthenticated
 * direct navigation to /owner is redirected to /login — the URL cannot bypass the gate.
 */
import { test, expect } from "@playwright/test";
import { authenticateUser, waitForPageReady } from "./helpers";
import { E2E_MEMBER } from "./e2e-fixtures";

test.describe("E — RBAC / workspace enforcement", () => {
  test("a non-owner member is denied owner data (403) and sees no control center", async ({ page }) => {
    await authenticateUser(page, E2E_MEMBER.email, E2E_MEMBER.password);

    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/owner/command-center")),
      page.goto("/owner", { waitUntil: "networkidle" }),
    ]);
    // Server denies — capability enforcement is active (not a client-side hide).
    expect(resp.status()).toBe(403);

    await waitForPageReady(page).catch(() => undefined);
    await expect(page.locator('[data-testid="owner-control-center"]')).toHaveCount(0);
  });

  test("unauthenticated direct navigation to /owner is redirected to /login", async ({ browser }) => {
    const context = await browser.newContext(); // no session
    const page = await context.newPage();
    await page.goto("/owner", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });
});
