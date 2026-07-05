/**
 * Flow 43 — owner PROOF-RISK ADJUDICATION QUEUE (browser). Proves the real owner adjudication loop in
 * a real browser against the real app + backend: a logged-in OWNER opens `/owner/adjudication`, sees at
 * least one active proof-risk finding (the seeded self-review), cannot submit without a reason, submits
 * one valid governed outcome and sees the decision recorded, sees NO fraud/theft/negligence accusation
 * or hidden score, and can navigate back to the Owner Now View.
 *
 * Requires: scripts/seed-owner-scenarios.ts (loginable owner + workspace + active businesses) +
 * scripts/seed-e2e-proof-risk.ts (the self-review finding). No client fakery — the queue is fetched
 * from GET /api/owner/proof-risk/queue and the decision POSTs to the canonical adjudicate route.
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

test.describe("43 — owner proof-risk adjudication queue (desktop, one login)", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
    await page.goto("/owner/adjudication", { waitUntil: "networkidle" });
    await waitForPageReady(page);
  });
  test.afterAll(async () => { await context.close(); });

  test("the queue loads with its header and at least one active proof-risk item", async () => {
    await expect(page.getByRole("heading", { name: /Proof-risk review queue/i })).toBeVisible();
    const queue = page.getByTestId("adjudication-queue");
    await expect(queue).toBeVisible({ timeout: 15000 });
    const items = page.getByTestId("adjudication-item");
    expect(await items.count()).toBeGreaterThan(0);
    // The seeded self-review finding is present and adjudicable.
    const selfReview = page.locator('[data-testid="adjudication-item"][data-finding-type="SELF_REVIEW_ATTEMPT"]');
    await expect(selfReview.first()).toBeVisible();
    await expect(selfReview.first().getByTestId("item-proof-count")).toContainText(/Supporting proofs:/i);
  });

  test("a decision cannot be submitted without a reason", async () => {
    const item = page.locator('[data-testid="adjudication-item"][data-finding-type="SELF_REVIEW_ATTEMPT"]').first();
    await item.getByTestId("item-outcome-select").selectOption("REQUIRE_FRESH_PROOF");
    // With an outcome chosen but no reason, submit is disabled and the required-reason hint shows.
    await expect(item.getByTestId("item-submit")).toBeDisabled();
    await expect(item.getByTestId("item-reason-required")).toBeVisible();
  });

  test("submitting a valid outcome with a reason records the decision", async () => {
    const item = page.locator('[data-testid="adjudication-item"][data-finding-type="SELF_REVIEW_ATTEMPT"]').first();
    await item.getByTestId("item-outcome-select").selectOption("REQUIRE_FRESH_PROOF");
    await item.getByTestId("item-reason").fill("Owner review: require a fresh, independently reviewed proof for these two jobs.");
    await expect(item.getByTestId("item-submit")).toBeEnabled();
    await item.getByTestId("item-submit").click();
    // The canonical route records it; the keep-active finding stays and shows a success line.
    await expect(
      page.locator('[data-testid="adjudication-item"][data-finding-type="SELF_REVIEW_ATTEMPT"]').first().getByTestId("item-result")
    ).toContainText(/recorded/i, { timeout: 15000 });
  });

  test("no fraud/theft/negligence accusation or hidden score appears on the findings", async () => {
    const items = page.getByTestId("adjudication-item");
    const n = await items.count();
    for (let i = 0; i < n; i++) {
      const text = (await items.nth(i).innerText()).toLowerCase();
      expect(text).not.toMatch(/\b(fraud|theft|thief|negligent|negligence|stole|stealing|liar)\b/);
      expect(text).not.toMatch(/\bscore\b/);
    }
    // The standing fairness note (which explicitly negates those words) IS present on the queue.
    await expect(page.getByTestId("adjudication-queue")).toContainText(/not a fraud, theft, or negligence accusation/i);
  });

  test("the owner can navigate back to the Owner Now View", async () => {
    await page.getByTestId("back-to-now").click();
    await page.waitForURL(/\/owner\/now/, { timeout: 10000 });
    expect(new URL(page.url()).pathname).toBe("/owner/now");
    expect(fatalErrors()).toEqual([]);
  });
});
