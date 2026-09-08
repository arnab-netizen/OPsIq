/**
 * VISUAL JOURNEY SMOKE — proves the premium-redesign navigation actually holds together: Home's
 * editorial top-priority/finance-priority content links through to the signature Finding
 * experience on Money (the "what OpsIQ found / evidence / how sure" card), from there to the
 * paired Finance action, then to Actions/Tasks, and back to Home — with no dead links and no loss
 * of active-business context along the way.
 */
import { test, expect, type Page } from "@playwright/test";
import { authenticateUser } from "./helpers";
import { TRUST_JOURNEY_OWNER, TRINITY_BUSINESS_NAME } from "./trust-journey-fixtures";

async function bodyText(page: Page): Promise<string> {
  return page.locator("body").innerText();
}

test.describe("Visual journey smoke — Home → Finding → Evidence → Action → back to Home", () => {
  test("premium-redesign navigation holds together end to end, no dead links, no context loss", async ({ page }) => {
    await authenticateUser(page, TRUST_JOURNEY_OWNER.email, TRUST_JOURNEY_OWNER.password);

    // Switch to Trinity Services, which has a real finance diagnosis + finding to walk through.
    await page.goto("/owner/data", { waitUntil: "networkidle" });
    const selector = page.locator('[data-testid="business-context-selector"]');
    await expect(selector).toBeVisible({ timeout: 10000 });
    const trinityValue = await selector.locator(`option:has-text("${TRINITY_BUSINESS_NAME}")`).getAttribute("value");
    await selector.selectOption(trinityValue!);
    await expect(page.locator('[data-testid="active-business-indicator"]')).toContainText(TRINITY_BUSINESS_NAME, { timeout: 10000 });

    // 1. Home — the executive briefing. Confirm it rendered and the business context is set.
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
    await expect(page.locator('[data-testid="active-business-indicator"]')).toContainText(TRINITY_BUSINESS_NAME);

    // 2. Finding — follow the real link from Home's finance-priority card through to Money,
    // the signature Finding experience (no synthetic navigation; this is the actual owner path).
    const financeLink = page.getByRole("link", { name: /see the full finance diagnosis/i }).first();
    await expect(financeLink).toBeVisible({ timeout: 10000 });
    await financeLink.click();
    await expect(page).toHaveURL(/\/owner\/finance/);
    await expect(page.getByText("What OpsIQ found").first()).toBeVisible({ timeout: 10000 });

    // 3. Evidence — the finding card's own labeled Evidence section, with a real measured value
    // and an explicit "how sure" statement (not a bare percentage).
    await expect(page.getByText("Evidence", { exact: true }).first()).toBeVisible();
    const findingText = await bodyText(page);
    expect(findingText).toMatch(/Measured:/);
    expect(findingText).toMatch(/How sure OpsIQ is:/);

    // 4. Action — the paired Finance action lives on the same page; follow through to Actions
    // (Tasks) via the sidebar, the real next stop for "what to do about it".
    await page.getByRole("link", { name: "Tasks" }).click();
    await expect(page).toHaveURL(/\/owner\/tasks/);
    await expect(page.getByRole("heading", { name: "Actions", exact: true })).toBeVisible();
    // No dead "what happens next" links on any real task row.
    for (const link of await page.locator('a:has-text("What happens next")').all()) {
      expect(await link.getAttribute("href")).toBeTruthy();
    }

    // 5. Back to Home — context must still read Trinity Services, not silently reset.
    await page.getByRole("link", { name: "Home", exact: true }).click();
    await expect(page).toHaveURL(/\/owner\/cockpit/);
    await expect(page.locator('[data-testid="active-business-indicator"]')).toContainText(TRINITY_BUSINESS_NAME);

    // No raw ISO datetimes or technical tokens surfaced anywhere in the journey's final state.
    const finalText = await bodyText(page);
    expect(finalText).not.toMatch(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(finalText).not.toMatch(/\bworkspaceId\b|\bbusinessId\b/);
  });
});
