/**
 * Flow 44 — owner PROCESS INTELLIGENCE UI (browser). Proves the owner can open the process-intelligence
 * surface in the real app: a logged-in OWNER opens `/owner/process-intelligence`, the page loads the
 * Owner Now View payload and renders either a top process breakdown (with its recommended correction +
 * approval level) or the honest DATA_INSUFFICIENT/empty state — with no fraud/negligence label and no
 * hidden score — and can navigate back to the Owner Now View.
 *
 * Requires: scripts/seed-owner-scenarios.ts + scripts/seed-e2e-proof-risk.ts (which seeds complaint/
 * rework operational events → a QUALITY_FAILURE_LOOP / REWORK_LOOP breakdown). Real app + real backend.
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

test.describe("44 — owner process intelligence UI (desktop, one login)", () => {
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

  test("the process-intelligence surface loads with its header", async () => {
    await expect(page.getByRole("heading", { name: /Where your process is breaking/i })).toBeVisible();
  });

  test("it renders a process breakdown (or an honest data-insufficient/empty state) with no prohibited labels", async () => {
    // Whatever the seeded data yields, exactly one of the three states renders.
    const panel = page.locator('[data-testid="process-intelligence-panel"]');
    const dataInsufficient = page.locator('[data-testid="process-intelligence-data-insufficient"]');
    const empty = page.locator('[data-testid="process-intelligence-empty"]');
    await expect(panel.or(dataInsufficient).or(empty).first()).toBeVisible({ timeout: 15000 });

    // If a real breakdown rendered, it shows a recommended fix + approval level.
    if (await panel.count()) {
      await expect(panel.getByTestId("pi-correction")).toContainText(/.+/);
      await expect(panel.getByTestId("pi-approval")).toContainText(/(Owner|Manager|Staff)/i);
    }
    const text = (await panel.or(dataInsufficient).or(empty).first().innerText()).toLowerCase();
    expect(text).not.toMatch(/\b(fraud|theft|thief|negligent|negligence|lazy)\b/);
    expect(text).not.toMatch(/\bhidden score\b/);
  });

  test("it routes the breakdown into proposed corrections (or an honest empty state) with no prohibited labels", async () => {
    const panel = page.locator('[data-testid="process-corrections-panel"]');
    const empty = page.locator('[data-testid="process-corrections-empty"]');
    await expect(panel.or(empty).first()).toBeVisible({ timeout: 15000 });

    // If corrections routed, each shows an instruction + an approval level + the PROPOSED status.
    if (await panel.count()) {
      const first = page.locator('[data-testid="pc-item"]').first();
      await expect(first.getByTestId("pc-item-instruction")).toContainText(/.+/);
      await expect(first.getByTestId("pc-item-approval")).toContainText(/(Owner|Manager|Staff)/i);
      await expect(first.getByTestId("pc-item-status")).toContainText(/PROPOSED/);
    }
    const text = (await panel.or(empty).first().innerText()).toLowerCase();
    expect(text).not.toMatch(/\b(fraud|theft|thief|negligent|negligence|lazy)\b/);
    expect(text).not.toMatch(/auto-?applied|approved automatically/);
  });

  test("the owner can navigate back to the Owner Now View", async () => {
    await page.getByTestId("back-to-now").click();
    await page.waitForURL(/\/owner\/now/, { timeout: 10000 });
    expect(new URL(page.url()).pathname).toBe("/owner/now");
    expect(fatalErrors()).toEqual([]);
  });

  test("the Owner Now View links to the process-intelligence surface", async () => {
    const link = page.locator('[data-testid="process-intelligence-link"]');
    await expect(link).toBeVisible();
    expect(await link.getAttribute("href")).toBe("/owner/process-intelligence");
  });
});
