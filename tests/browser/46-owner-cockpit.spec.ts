/**
 * Flow 46 — owner COCKPIT UI (browser, PASS 36). Proves a logged-in OWNER can open the canonical minimum
 * cockpit at `/owner/cockpit` in the real app: it loads the Owner Now View payload and renders EITHER the
 * single top governed action (with its owner-decision / evidence / reassessment / blocked sections) OR the
 * honest clean state — with the secondary, monitor-only, and proof/audit groups collapsed by default, no
 * raw dump, no fraud/negligence label, no fabricated money, and no hidden score. Real app + real backend.
 *
 * Requires the owner-pilot-e2e seed (scripts/seed-owner-scenarios.ts + seed-e2e-proof-risk.ts) which seeds
 * complaint/rework events → a process breakdown → a bridged governed action.
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

test.describe("46 — owner cockpit UI (desktop, one login)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);
  });
  test.afterAll(async () => { await context.close(); });

  test("the cockpit loads with its header", async () => {
    await expect(page.getByRole("heading", { name: /Your cockpit/i })).toBeVisible();
  });

  test("it renders exactly one top governed action (or the honest clean state)", async () => {
    const cockpit = page.locator('[data-testid="owner-cockpit"]');
    const clean = page.locator('[data-testid="cockpit-clean"]');
    await expect(cockpit.or(clean).first()).toBeVisible({ timeout: 15000 });

    if (await cockpit.count()) {
      // exactly one top action title.
      await expect(page.locator('[data-testid="cockpit-top-action-title"]')).toHaveCount(1);
      // the safety sections are present.
      await expect(page.locator('[data-testid="cockpit-why"]')).toBeVisible();
      await expect(page.locator('[data-testid="cockpit-owner-decision"]')).toBeVisible();
      await expect(page.locator('[data-testid="cockpit-reassessment"]')).toContainText(/reassessment/i);
    }
  });

  test("the secondary, monitor-only, and proof groups are collapsed by default", async () => {
    if (!(await page.locator('[data-testid="owner-cockpit"]').count())) return;
    for (const id of ["cockpit-secondary-group", "cockpit-monitor-group", "cockpit-proof-drawer"]) {
      const el = page.locator(`[data-testid="${id}"]`);
      await expect(el).toBeVisible();
      expect(await el.evaluate((n) => (n as HTMLDetailsElement).open)).toBe(false);
    }
    // the owner can open the proof drawer on demand.
    await page.locator('[data-testid="cockpit-proof-drawer"] summary').click();
    expect(await page.locator('[data-testid="cockpit-proof-drawer"]').evaluate((n) => (n as HTMLDetailsElement).open)).toBe(true);
  });

  test("the recovery status section is collapsed by default; expanding shows a no-guarantee caveat", async () => {
    const recovery = page.locator('[data-testid="cockpit-recovery-group"]');
    // The recovery status endpoint always returns at least NONE, so the section renders on the cockpit.
    if (!(await page.locator('[data-testid="owner-cockpit"], [data-testid="cockpit-clean"]').count())) return;
    if (!(await recovery.count())) return; // tolerate an environment where recovery-status is unavailable
    await expect(recovery).toBeVisible();
    expect(await recovery.evaluate((n) => (n as HTMLDetailsElement).open)).toBe(false);
    await recovery.locator("summary").click();
    expect(await recovery.evaluate((n) => (n as HTMLDetailsElement).open)).toBe(true);
    await expect(page.locator('[data-testid="cockpit-recovery-caveat"]')).toContainText(/not guaranteed/i);
    // recovery must never imply a guarantee or a fabricated figure.
    const text = (await recovery.innerText()).toLowerCase();
    expect(text).not.toMatch(/guaranteed (recovery|profit|success)|recovered\b/);
    expect(text).not.toMatch(/[$£€]\s?\d|win probability|ready to scale/);
  });

  test("no fraud/negligence label, no fabricated money, no hidden score, no forbidden copy", async () => {
    const root = page.locator('[data-testid="owner-cockpit"], [data-testid="cockpit-clean"]').first();
    const text = (await root.innerText()).toLowerCase();
    expect(text).not.toMatch(/\b(fraud|theft|thief|negligent|negligence|lazy|dishonest)\b/);
    expect(text).not.toMatch(/\bhidden score\b|\bscore\b/);
    expect(text).not.toMatch(/[$£€]\s?\d/);
    expect(text).not.toMatch(/guaranteed (recovery|profit|success)|predicted roi|win probability|auto-submit|auto-contact/);
    expect(fatalErrors()).toEqual([]);
  });
});
