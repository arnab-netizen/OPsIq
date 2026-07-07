/**
 * Flow 51 — owner DEDICATED MANUAL-ENTRY UI (browser, PASS 45).
 *
 * Proves a real OWNER can safely log business operating facts through the dedicated /owner/manual-entry form
 * in the real app: the mandatory privacy warning + placeholders are shown; a PII-bearing note is blocked with
 * redaction guidance (client + server); a redacted operational note saves through the governed backend; the
 * owner can return to the cockpit; no PII / raw dump / fake financial claim appears; and the page stays low-load
 * (optional sections collapsed). Real app + real backend + server enforcement active.
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

test.describe("51 — owner manual-entry UI (desktop, one login)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner/manual-entry", { waitUntil: "networkidle" });
    await waitForPageReady(page);
  });
  test.afterAll(async () => { await context.close(); });

  test("the page loads with the mandatory privacy warning and placeholders", async () => {
    await expect(page.locator('[data-testid="manual-entry-page"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="manual-entry-warning"]')).toContainText(/phone numbers|emails|passwords/i);
    await expect(page.locator('[data-testid="manual-entry-safecopy"]')).toContainText(/CUSTOMER_001|STAFF_A/);
  });

  test("optional sections are collapsed by default (progressive disclosure)", async () => {
    const opt = page.locator('[data-testid="manual-entry-optional-cash_cost"]');
    if (!(await opt.count())) return; // tolerate no-business environments
    expect(await opt.evaluate((n) => (n as HTMLDetailsElement).open)).toBe(false);
  });

  test("reachable from the owner sidebar (Log business data)", async () => {
    await page.goto("/owner", { waitUntil: "networkidle" });
    await waitForPageReady(page).catch(() => undefined);
    await expect(page.locator('a[href="/owner/manual-entry"]').first()).toBeVisible();
    await page.goto("/owner/manual-entry", { waitUntil: "networkidle" });
    await waitForPageReady(page);
  });

  test("a PII-bearing note is blocked with redaction guidance and is NOT saved", async () => {
    const noBiz = page.locator('[data-testid="manual-entry-no-business"]');
    if (await noBiz.count()) { test.skip(true, "no business seeded in this environment"); return; }
    const section = page.locator('[data-testid="manual-entry-section-current_issue"]');
    await section.locator('[data-testid="manual-entry-note-current_issue"]').fill("call Mr Smith on 07700 900123 or email test@example.com");
    await section.locator('[data-testid="manual-entry-save-current_issue"]').click();
    await expect(section.locator('[data-testid="manual-entry-error-current_issue"]')).toContainText(/personal data detected|placeholder like CUSTOMER_001/i);
    await expect(section.locator('[data-testid="manual-entry-saved-current_issue"]')).toHaveCount(0);
  });

  test("a redacted operational note saves through the governed backend", async () => {
    const noBiz = page.locator('[data-testid="manual-entry-no-business"]');
    if (await noBiz.count()) { test.skip(true, "no business seeded in this environment"); return; }
    const section = page.locator('[data-testid="manual-entry-section-current_issue"]');
    await section.locator('[data-testid="manual-entry-note-current_issue"]').fill("late deliveries this week on several orders for CUSTOMER_001");
    await section.locator('[data-testid="manual-entry-save-current_issue"]').click();
    await expect(section.locator('[data-testid="manual-entry-saved-current_issue"]')).toBeVisible({ timeout: 10000 });
  });

  test("the owner can return to the cockpit; no PII / fake financials / autonomous claims on the page", async () => {
    await expect(page.locator('[data-testid="manual-entry-cockpit-link"]')).toHaveAttribute("href", "/owner/cockpit");
    const text = (await page.locator('[data-testid="manual-entry-page"]').innerText()).toLowerCase();
    expect(text).not.toMatch(/test@example\.com|07700\s?900123|mr smith/);
    expect(text).not.toMatch(/[$£€]\s?\d|\broi\b|win probability|guaranteed (recovery|profit|success)|fully autonomous|auto-submit|auto-contact/);
    expect(fatalErrors()).toEqual([]);
  });
});
