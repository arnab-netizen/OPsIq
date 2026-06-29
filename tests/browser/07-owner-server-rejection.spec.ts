/**
 * Flow B — Server rejection is visible; the UI never fakes success.
 *
 * The seeded delegated task requires proof and has NO accepted proof. The owner attempts to
 * complete it through the real /api/owner/tasks/complete route; the server FSM rejects it
 * (409 proof_not_accepted). The UI must surface the block reason and must NOT show a fake
 * "completed" success, and the server transition must not occur (state unchanged).
 */
import { test, expect } from "@playwright/test";
import { authenticateUser, waitForPageReady, captureScreenshot } from "./helpers";
import { E2E_OWNER, E2E_PROOF_BLOCKED_TASK_ID } from "./e2e-fixtures";

test.describe("B — Server rejection visible (proof gate)", () => {
  test("proof-required completion without proof is rejected; UI shows the reason, no fake success", async ({ page }) => {
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const actions = page.locator('[data-testid="owner-actions"]');
    await expect(actions).toBeVisible();

    // Enter the proof-blocked task id (owner override deliberately OFF — no proof bypass).
    await page.fill('input[placeholder="Task ID"]', E2E_PROOF_BLOCKED_TASK_ID);

    // Submit and capture the SERVER response — it must be a 409 block, not a 200 success.
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/owner/tasks/complete")),
      page.getByRole("button", { name: /complete task/i }).click(),
    ]);
    expect(resp.status()).toBe(409);
    const body = await resp.json();
    expect(body.blocked).toBe(true);
    expect(String(body.reason)).toMatch(/proof/i);

    // The UI surfaces the block reason and does NOT claim success.
    await expect(actions).toContainText(/blocked/i);
    await expect(actions).not.toContainText(/completed — status/i);

    await captureScreenshot(page, "B-server-rejection");
  });
});
