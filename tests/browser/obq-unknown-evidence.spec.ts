/**
 * OBQ owner decisions in a real browser: cash may be UNKNOWN, an unknown cost half is never zero, and a correction may
 * return a figure to UNKNOWN. Phone width (375px) and desktop; local loopback database only.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  isLocal, db, setAdmissionMode, signUpAndVerify, completeBusinessStep, fill, noHorizontalScroll, newPhone, LEAK,
} from "./helpers/obq";

const CASH_SENTENCE = /OpsIQ doesn't know your cash, so it can't say how long your cash will last/;
const COST_SENTENCE = /Some cost information is missing \(variable costs\), so OpsIQ cannot calculate total profit or margin yet/;

async function snapshotRows(email: string) {
  return db(async (c) =>
    (await c.query(
      `SELECT s.version, s.revenue, s.fixed_costs, s.variable_costs, s.cash_on_hand, s.superseded_by_id IS NOT NULL AS superseded
         FROM owner_financial_snapshots s JOIN workspace_memberships m ON m.workspace_id = s.workspace_id JOIN users u ON u.id = m.user_id
        WHERE u.email = $1 ORDER BY s.version`,
      [email],
    )).rows as Array<{ version: number; revenue: number | null; fixed_costs: number | null; variable_costs: number | null; cash_on_hand: number | null; superseded: boolean }>,
  );
}

async function readWith(page: Page, v: Record<string, string>) {
  await fill(page, v);
  await page.getByLabel("A good estimate").check();
  await expect(page.getByTestId("quick-primary-action")).toBeEnabled();
  await page.getByTestId("quick-primary-action").click();
  await expect(page.getByTestId("first-money-read")).toBeVisible({ timeout: 30000 });
}

async function openCorrection(page: Page) {
  await page.getByTestId("first-run-correct").click();
  await expect(page.getByTestId("first-result-correction")).toBeVisible();
}

async function submitCorrection(page: Page) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/owner/first-run/correct") && r.request().method() === "POST"),
    page.getByTestId("first-result-correction-submit").click(),
  ]);
  expect(res.status()).toBe(201);
  await expect(page.getByTestId("first-money-read")).toBeVisible({ timeout: 30000 });
}

test.describe("OBQ unknown-evidence semantics", () => {
  test.skip(!isLocal, "Refuses to run except against an explicit local Postgres DATABASE_URL.");
  test.setTimeout(180_000);
  test.beforeAll(async () => setAdmissionMode("OPEN_BETA"));
  test.afterAll(async () => setAdmissionMode("INVITE_ONLY"));

  test("an owner who does not know their cash completes OBQ, gets a supported read, and is told what it cannot conclude (375px)", async ({ browser }) => {
    const { context, page } = await newPhone(browser);
    const { email } = await signUpAndVerify(page);
    await completeBusinessStep(page);

    // Cash is blank: the form says so and does not demand a number.
    await fill(page, { revenue: "12000", fixedCosts: "7000", variableCosts: "4000" });
    await expect(page.locator('[data-testid="quick-financial-picture-form"] input[name="cashOnHand"]')).toHaveValue("");
    await page.getByLabel("A good estimate").check();
    await expect(page.getByTestId("quick-primary-action")).toBeEnabled();
    await expect(page.getByTestId("quick-feedback")).toContainText(/enough for a first read/i);
    await noHorizontalScroll(page, "quick form with blank cash");
    await page.getByTestId("quick-primary-action").click();
    await expect(page.getByTestId("first-money-read")).toBeVisible({ timeout: 30000 });

    // Stored as UNKNOWN (null), never 0.
    const rows = await snapshotRows(email);
    expect(rows).toHaveLength(1);
    expect(rows[0].cash_on_hand).toBeNull();

    // A real, specific finding the evidence supports — not generic advice — and it can be acted on.
    await expect(page.getByTestId("first-money-read-noticed")).not.toContainText(/can't point to a specific money problem/i);
    await expect(page.getByTestId("first-money-read-action")).not.toContainText(/Improve data completeness/i);
    await expect(page.getByTestId("first-run-accept")).toBeEnabled();

    // The withheld conclusion is explained in words, with no request to invent a number.
    const cannot = page.getByTestId("first-money-read-cannot-conclude");
    await expect(cannot).toBeVisible();
    await expect(cannot).toContainText(CASH_SENTENCE);
    await expect(cannot).toContainText(/don't need to estimate/);
    await expect(page.getByTestId("first-money-read-confidence")).not.toContainText(/fairly confident/i);
    const text = await page.getByTestId("first-money-read").innerText();
    expect(text).not.toMatch(LEAK);
    expect(text).not.toMatch(/run out|days of cash remaining/i);
    await noHorizontalScroll(page, "first read with unknown cash");

    // OBQ is complete: the owner can accept and reach the Cockpit.
    await page.getByTestId("first-run-accept").click();
    await expect(page.getByTestId("first-money-read-accepted")).toBeVisible();
    await page.getByTestId("first-run-skip-to-cockpit").click();
    await page.waitForURL(/\/owner\/cockpit/, { timeout: 20000 });
    await context.close();
  });

  test("corrections: known → different known, known → UNKNOWN, UNKNOWN → known / explicit zero — each re-evaluated, history kept (375px)", async ({ browser }) => {
    const { context, page } = await newPhone(browser);
    const { email } = await signUpAndVerify(page);
    await completeBusinessStep(page);
    await readWith(page, { revenue: "40000", fixedCosts: "20000", variableCosts: "30000", cashOnHand: "5000" });
    await expect(page.getByTestId("first-money-read-noticed")).toContainText(/net loss/i);
    await expect(page.getByTestId("first-money-read-cannot-conclude")).toHaveCount(0);

    // 1) known → different known: variable costs 30000 → 10000. The loss finding goes away.
    await openCorrection(page);
    await page.locator('[data-testid="first-result-correction"] input[name="variableCosts"]').fill("10000");
    await submitCorrection(page);
    await expect(page.getByTestId("first-money-read-noticed")).not.toContainText(/net loss/i);

    // 2) known → UNKNOWN: "I don't know" on variable costs. The field is disabled, nothing is typed, 0 is never sent.
    await openCorrection(page);
    const unknownBox = page.getByTestId("first-result-correction-unknown-variableCosts");
    await unknownBox.check();
    await expect(page.locator('[data-testid="first-result-correction"] input[name="variableCosts"]')).toBeDisabled();
    await noHorizontalScroll(page, "correction with an unknown figure");
    await submitCorrection(page);
    await expect(page.getByTestId("first-money-read-cannot-conclude")).toContainText(COST_SENTENCE);
    await expect(page.getByTestId("first-money-read-noticed")).not.toContainText(/net (loss|profit)|margin/i);
    let rows = await snapshotRows(email);
    expect(rows.map((r) => r.version)).toEqual([1, 2, 3]);
    expect(rows[2].variable_costs).toBeNull(); // UNKNOWN is the current state: not 0 and not the old 10000
    expect(rows[0].variable_costs).toBe(30000); // history untouched
    expect(rows[1].variable_costs).toBe(10000);

    // 3) UNKNOWN → known: the owner supplies a value again.
    await openCorrection(page);
    // A figure that is already unknown offers no "I don't know" control (nothing to clear).
    await expect(page.getByTestId("first-result-correction-unknown-variableCosts")).toHaveCount(0);
    await page.locator('[data-testid="first-result-correction"] input[name="variableCosts"]').fill("12000");
    await submitCorrection(page);
    await expect(page.getByTestId("first-money-read-cannot-conclude")).toHaveCount(0);

    // Cash: known → UNKNOWN (explained), then UNKNOWN → an explicit zero (a different state, no longer "unknown").
    await openCorrection(page);
    await page.getByTestId("first-result-correction-unknown-cashOnHand").check();
    await submitCorrection(page);
    await expect(page.getByTestId("first-money-read-cannot-conclude")).toContainText(CASH_SENTENCE);
    await openCorrection(page);
    await page.locator('[data-testid="first-result-correction"] input[name="cashOnHand"]').fill("0");
    await submitCorrection(page);
    await expect(page.getByTestId("first-money-read-cannot-conclude")).toHaveCount(0);

    rows = await snapshotRows(email);
    expect(rows.map((r) => r.version)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rows[3].variable_costs).toBe(12000);
    expect(rows[4].cash_on_hand).toBeNull();
    expect(rows[5].cash_on_hand).toBe(0);
    expect(rows.slice(0, -1).every((r) => r.superseded)).toBe(true);
    // Reload: the persisted, current read is the same one (not a stale earlier read).
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("first-money-read")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("first-money-read-cannot-conclude")).toHaveCount(0);
    await context.close();
  });

  test("partial costs on a desktop: no profit or margin is claimed, and the explanation names the missing half", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await signUpAndVerify(page);
    await completeBusinessStep(page);
    await readWith(page, { revenue: "100000", fixedCosts: "20000", cashOnHand: "5000" });
    await expect(page.getByTestId("first-money-read-cannot-conclude")).toContainText(COST_SENTENCE);
    const text = await page.getByTestId("first-money-read").innerText();
    expect(text).not.toMatch(/\b80\s?%|net profit|net margin/i);
    await context.close();
  });
});
