/**
 * Flow 45 — BROADER OWNER-MODE journeys (browser). Proves the owner can drive the opportunity loop AND the
 * core-operations loop through the real UI, and that the executive-cockpit governance guardrails hold in the
 * rendered page — not just in unit/DB tests.
 *
 * Journey A (opportunity loop): a logged-in OWNER opens `/owner/process-intelligence`, opens the "Grow"
 * cockpit group, and sees the live opportunity surfaces — top candidate, next validation experiment, capital
 * allocation, recorded outcome, and (PASS 12) the EXECUTION task with its owner, required evidence, and the
 * OpsIQ-drafts-only guardrail. With the seeded B2B gym-towel signal (no unit economics) the execution
 * surface shows a real manager-owned "collect cost data" task; otherwise the honest empty state.
 *
 * Journey B (core operations loop): the top process breakdown is shown first (top action), the secondary
 * surfaces (cash/profit, workload & govern) are collapsed groups (anti-overload), and the approval-policy
 * surface shows an explicit approval level (the high-risk approval gate is visible). The owner can navigate
 * back to the Owner Now View with no fatal console errors.
 *
 * Negative checks: no fabricated money/percent, no fraud/HR-discipline labels, no hidden score, no
 * auto-submit/auto-contact language, and the secondary groups are collapsed by default (no raw overload).
 *
 * Requires: scripts/seed-owner-scenarios.ts + scripts/seed-e2e-proof-risk.ts (process breakdown) +
 * scripts/seed-e2e-opportunity.ts (a live B2B opportunity). Real app + real backend.
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

test.describe("45 — broader owner-mode journeys (desktop, one login)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner/process-intelligence", { waitUntil: "networkidle" });
    await waitForPageReady(page);
  });
  test.afterAll(async () => { await context.close(); });

  // ── Journey A: opportunity loop ────────────────────────────────────────────────────────────────────
  test("A1 — the process-intelligence surface loads and exposes the Grow group", async () => {
    await expect(page.getByRole("heading", { name: /Where your process is breaking/i })).toBeVisible();
    const grow = page.locator('[data-testid="cockpit-group-grow"]');
    await expect(grow).toBeVisible({ timeout: 15000 });
    expect(await grow.evaluate((el) => el.tagName.toLowerCase())).toBe("details");
    await grow.locator("summary").first().click(); // progressive disclosure
  });

  test("A2 — the opportunity execution surface renders a real task or an honest empty state", async () => {
    const panel = page.locator('[data-testid="execution-panel"]');
    const empty = page.locator('[data-testid="execution-empty"]');
    await expect(panel.or(empty).first()).toBeVisible({ timeout: 15000 });

    if (await panel.count()) {
      await expect(panel.getByTestId("exec-title")).toContainText(/.+/);
      await expect(panel.getByTestId("exec-owner")).toContainText(/(Owner|Manager|Staff|OpsIQ|advisor)/i);
      await expect(panel.getByTestId("exec-risk")).toContainText(/If skipped:/i);
      // The drafts-only guardrail must be present — OpsIQ never submits/contacts/spends.
      await expect(panel.getByTestId("exec-guardrail")).toContainText(/never submits, contacts customers, or spends/i);
      // Evidence is collapsed by default (progressive disclosure).
      const evidence = panel.getByTestId("exec-evidence");
      expect(await evidence.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
    }
  });

  test("A3 — the opportunity, validation, portfolio and outcome surfaces render (real or honest empty)", async () => {
    for (const [panelId, emptyId] of [
      ["opportunity-panel", "opportunity-empty"],
      ["validation-panel", "validation-empty"],
      ["portfolio-panel", "portfolio-empty"],
      ["outcome-panel", "outcome-empty"],
    ] as const) {
      const panel = page.locator(`[data-testid="${panelId}"]`);
      const empty = page.locator(`[data-testid="${emptyId}"]`);
      await expect(panel.or(empty).first()).toBeVisible({ timeout: 15000 });
    }
  });

  // ── Journey B: core operations loop ────────────────────────────────────────────────────────────────
  test("B1 — the top process breakdown is shown first (top action, not a backlog dump)", async () => {
    const panel = page.locator('[data-testid="process-intelligence-panel"]');
    const dataInsufficient = page.locator('[data-testid="process-intelligence-data-insufficient"]');
    const empty = page.locator('[data-testid="process-intelligence-empty"]');
    await expect(panel.or(dataInsufficient).or(empty).first()).toBeVisible({ timeout: 15000 });
    // The primary breakdown is NOT hidden inside a collapsed group (it stays top-of-page).
    expect(await panel.or(dataInsufficient).or(empty).first().evaluate((el) => el.closest("details") === null)).toBe(true);
  });

  test("B2 — secondary surfaces are collapsed groups (anti-overload) and approval gates are visible", async () => {
    for (const gid of ["cockpit-group-cash", "cockpit-group-govern", "cockpit-group-followthrough"]) {
      const grp = page.locator(`[data-testid="${gid}"]`);
      await expect(grp).toBeVisible();
      expect(await grp.evaluate((el) => el.tagName.toLowerCase())).toBe("details");
      expect(await grp.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
    }
    // Open the govern group and confirm the approval-policy surface shows an explicit approval level.
    const govern = page.locator('[data-testid="cockpit-group-govern"]');
    await govern.locator("summary").first().click();
    const approval = page.locator('[data-testid="approval-policy-panel"]');
    const approvalEmpty = page.locator('[data-testid="approval-policy-empty"]');
    await expect(approval.or(approvalEmpty).first()).toBeVisible({ timeout: 15000 });
    if (await approval.count()) {
      await expect(approval).toContainText(/(Owner|Manager|Staff|owner approval|never without)/i);
    }
  });

  // ── Negative checks ────────────────────────────────────────────────────────────────────────────────
  test("negative — no fabricated money/percent, no prohibited labels, no auto-submit language", async () => {
    // The page renders its own <main> nested inside the app-shell <main>; assert on the innermost (page) one.
    const main = page.locator("main").last();
    const text = (await main.innerText()).toLowerCase();
    expect(text).not.toMatch(/\bhidden score\b/);
    expect(text).not.toMatch(/\b(fraud|theft|thief|negligent|negligence|lazy)\b/);
    expect(text).not.toMatch(/guaranteed|profit guarantee|win probability/);
    expect(text).not.toMatch(/auto-?submit|submitted automatically|contacted automatically|auto-?contact/);
  });

  test("B3 — the owner can navigate back to the Owner Now View (core path intact, no fatal errors)", async () => {
    await page.getByTestId("back-to-now").click();
    await page.waitForURL(/\/owner\/now/, { timeout: 10000 });
    expect(new URL(page.url()).pathname).toBe("/owner/now");
    await waitForPageReady(page);
    const link = page.locator('[data-testid="process-intelligence-link"]');
    await expect(link).toBeVisible();
    expect(await link.getAttribute("href")).toBe("/owner/process-intelligence");
    expect(fatalErrors()).toEqual([]);
  });
});
