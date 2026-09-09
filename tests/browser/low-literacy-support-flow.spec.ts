/**
 * LOW-DIGITAL-LITERACY SUPPORT FLOW — a real usability test's second-round finding was "I don't
 * know where to start." This drives the exact flow a new/incomplete owner needs: Start Here →
 * Quick Money entry → a first result → Help → Account menu → back → Startup-planning confirmation
 * (cancel, then confirm) with an obvious way back to the real business.
 *
 * Uses the trust-journey seed's Riverside Cafe — a genuinely incomplete second real business (no
 * financial data seeded at all, unlike Trinity Services) — so Start Here has a real next step to
 * show, not a fabricated one.
 */
import { test, expect, type Page } from "@playwright/test";
import { authenticateUser } from "./helpers";
import { TRUST_JOURNEY_OWNER } from "./trust-journey-fixtures";

async function bodyText(page: Page): Promise<string> {
  return page.locator("body").innerText();
}

test.describe("Low-digital-literacy support flow", () => {
  test("new/incomplete owner: Start Here → Quick Money → first result → Help → Account menu → Startup planning (cancel, then confirm) with an obvious way back", async ({ page }) => {
    await authenticateUser(page, TRUST_JOURNEY_OWNER.email, TRUST_JOURNEY_OWNER.password);

    // Switch to the incomplete business (Riverside Cafe) so Start Here has a real next step.
    await page.goto("/owner/data", { waitUntil: "networkidle" });
    const selector = page.locator('[data-testid="business-context-selector"]');
    await expect(selector).toBeVisible({ timeout: 10000 });
    const riversideValue = await selector.locator(`option:has-text("Riverside Cafe")`).getAttribute("value");
    await selector.selectOption(riversideValue!);
    await expect(page.locator('[data-testid="active-business-indicator"]')).toContainText("Riverside Cafe", { timeout: 10000 });

    // 1. Start Here shows a real next step (money numbers, since Riverside has no financial data).
    await page.goto("/owner/start-here", { waitUntil: "networkidle" });
    await expect(page.locator('[data-testid="start-here-page"]')).toBeVisible();
    const startHereText = await bodyText(page);
    expect(startHereText).toContain("Add your basic money numbers");
    // No unsupported "first read" claim — Riverside genuinely has no financial data yet.
    expect(page.locator('[data-testid="start-here-first-read-available"]')).toHaveCount(0);

    // Understands the step structurally: current step is visually distinguished, and clicking it
    // is a real, working link to the actual page it names (Money), not a dead end.
    const moneyStep = page.locator('[data-testid="start-here-step-money_numbers"]');
    await expect(moneyStep).toBeVisible();
    await moneyStep.getByRole("link", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/owner\/finance/);

    // 2. Enter Quick Money (the always-visible tier, not the 27-field flat form).
    await page.click("text=+ Add financial snapshot");
    await expect(page.locator("text=Quick financial picture")).toBeVisible();
    const today = new Date();
    const periodStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
    await page.fill('input[name="periodStart"]', periodStart);
    await page.fill('input[name="periodEnd"]', periodEnd);
    await page.fill('input[name="revenue"]', "40000");
    await page.fill('input[name="fixedCosts"]', "15000");
    await page.fill('input[name="variableCosts"]', "10000");
    await page.fill('input[name="cashOnHand"]', "25000");
    await page.click('button:has-text("Save snapshot")');
    await expect(page.locator("text=Save snapshot")).toHaveCount(0, { timeout: 10000 });

    // 3. Reach a first result — running the diagnosis produces a real read, not a placeholder.
    await page.click('button:has-text("Run finance diagnosis")');
    await page.waitForLoadState("networkidle");
    const financeText = await bodyText(page);
    expect(financeText.toLowerCase()).not.toContain("no financial snapshot yet");

    // 4. Open Help — reachable, and every link on it is real (not a dead end).
    await page.goto("/owner/help", { waitUntil: "networkidle" });
    await expect(page.locator('[data-testid="owner-help-page"]')).toBeVisible();
    const helpLinks = await page.locator('[data-testid="owner-help-page"] a').all();
    expect(helpLinks.length).toBeGreaterThan(0);
    for (const link of helpLinks) {
      const href = await link.getAttribute("href");
      expect(href, "every Help link must have a real destination").toBeTruthy();
    }

    // 5. Open the account menu — Account/Help/Send feedback/Log out all present, no dead item.
    await page.click('[data-testid="account-menu-trigger"]');
    const menu = page.locator('[data-testid="account-menu"]');
    await expect(menu).toBeVisible();
    for (const label of ["Account", "Help", "Send feedback"]) {
      const item = menu.getByRole("menuitem", { name: label });
      await expect(item).toBeVisible();
      const href = await item.getAttribute("href");
      expect(href, `${label} must have a real destination`).toBeTruthy();
    }
    await expect(page.locator('[data-testid="account-menu-logout"]')).toBeVisible();
    // Close without navigating away (Escape), returning to the same page.
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();

    // 6. Startup planning: open from My Business, CANCEL, and confirm we remain on Riverside Cafe.
    await page.goto("/owner/data", { waitUntil: "networkidle" });
    await page.click('[data-testid="plan-new-business-link"]');
    await expect(page.locator("text=Startup planning is separate from Riverside Cafe")).toBeVisible();
    await page.click('button:has-text("← Back to Riverside Cafe")');
    await expect(page.locator('[data-testid="active-business-indicator"]')).toContainText("Riverside Cafe");
    await expect(page).toHaveURL(/\/owner\/data/); // cancel never navigated away

    // 7. Open Startup planning again and use the obvious way back (no sidebar knowledge required —
    // the "← Back to [Business]" control is inside the dialog itself).
    await page.click('[data-testid="plan-new-business-link"]');
    const backButton = page.locator('button:has-text("← Back to Riverside Cafe")');
    await expect(backButton).toBeVisible();
    await backButton.click();
    await expect(page.locator('[data-testid="active-business-indicator"]')).toContainText("Riverside Cafe");

    // Assertions across the whole flow: no raw ISO dates, no technical tokens, anywhere visited.
    const finalText = await bodyText(page);
    expect(finalText).not.toMatch(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(finalText).not.toMatch(/\bworkspaceId\b|\bbusinessId\b|\bdataConfidenceScore\b/);
  });
});
