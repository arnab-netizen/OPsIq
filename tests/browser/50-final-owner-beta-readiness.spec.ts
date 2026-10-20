/**
 * Flow 50 — final owner beta-readiness remediation, in a real browser against the real app and a real (disposable) database.
 *
 * N1  create an incomplete period (revenue UNKNOWN) → reopen → complete it → reload → the correction is current
 * D9  known leakage components → take one to UNKNOWN → reload → explicit zero → reload
 * N2  cash UNKNOWN → My Business never says cash was supplied
 * N3  cost-leak recommendation → Home does not claim "no profit leak" beside it
 * N4  no raw internal field names anywhere an owner reads
 * N5  confidence concepts are visibly distinct
 * N6  each contradictory input returns meaningful owner-facing guidance
 *
 * Requires the owner e2e seed (scripts/seed-e2e-owner.ts): test1@staging.local owns a workspace with a laundry business and an
 * April 2026 snapshot. This spec only adds NEW periods (Aug / Sept 2026) so it never touches the seeded one.
 */
import { test, expect, type Page } from "@playwright/test";
import { authenticateUser } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";

test.describe.configure({ mode: "serial" });

const RAW = /\b(bankBalance|cashOnHand|cashInHand|refundReworkCost|totalLiquidFunds|dataConfidenceScore)\b|\bundefined\b|\[object Object\]/;

async function openMoney(page: Page) {
  await page.goto("/owner/finance", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Money" })).toBeVisible();
}
async function openAddForm(page: Page, from: string, to: string) {
  // before a first read is possible Money offers the full form behind "Enter full financial detail instead"
  const add = page.getByRole("button", { name: /\+ Add financial snapshot|Enter full financial detail instead/ });
  await add.click();
  await page.getByLabel("These numbers cover: from").fill(from);
  await page.getByLabel("These numbers cover: to").fill(to);
  await page.getByLabel("How reliable are these numbers?").selectOption("ACTUAL");
  // the optional sections are collapsed by default; open them so every field can be filled
  await page.evaluate(() => document.querySelectorAll("form details").forEach((d) => { (d as HTMLDetailsElement).open = true; }));
}
const fill = (page: Page, label: string, v: string) => page.getByLabel(label, { exact: true }).fill(v);
const periodRow = (page: Page, text: string) => page.getByTestId("finance-saved-period").filter({ hasText: text });

test.describe("50 — final owner beta-readiness (one login)", () => {
  let page: Page;
  const errors: string[] = [];

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
  });

  test("N1: an incomplete period (revenue UNKNOWN) is saved and listed", async () => {
    await openMoney(page);
    await openAddForm(page, "2026-09-01", "2026-09-30");
    await fill(page, "Fixed costs", "40000");
    await fill(page, "Variable costs", "30000");
    await fill(page, "Cash in hand", "20000");
    await fill(page, "Discount amount", "15000"); // a real cost leak, so Home has a Finance cost-leakage finding to reconcile (N3)
    await page.getByRole("button", { name: "Save snapshot" }).click();
    const row = periodRow(page, "September 2026");
    await expect(row).toBeVisible();
    await expect(row).toContainText("Revenue: not entered");
    await expect(row).toContainText("Cash in hand: INR 20,000");
  });

  test("N1: adding the same period again is not a dead end — the owner is offered the update, with what they typed", async () => {
    await openMoney(page);
    await openAddForm(page, "2026-09-01", "2026-09-30");
    await fill(page, "Revenue", "80000");
    await page.getByRole("button", { name: "Save snapshot" }).click();
    const alert = page.getByTestId("snapshot-save-error");
    await expect(alert).toContainText("You already have figures saved for this period");
    await expect(alert).not.toContainText(/409|conflict|amend|duplicate/i);
    await alert.getByRole("button", { name: "Update that period with what I typed" }).click();
    const editor = page.getByTestId("finance-period-editor");
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel(/^Revenue/)).toHaveValue("80000"); // carried over
    await expect(page.getByTestId("finance-period-editor-changes")).toContainText("Revenue: not entered → INR 80,000");
    await page.getByTestId("finance-period-editor-submit").click();
    await expect(page.getByTestId("finance-update-notice")).toContainText("Saved as a correction");
  });

  test("N1: after a reload the correction is the current version, and history is kept (updated once)", async () => {
    await openMoney(page);
    const row = periodRow(page, "September 2026");
    await expect(row).toContainText("Revenue: INR 80,000");
    await expect(row).toContainText("updated 1 time");
    // unrelated figures survived the amendment
    await row.getByTestId("finance-saved-period-update").click();
    const editor = page.getByTestId("finance-period-editor");
    await expect(editor.getByLabel(/^Fixed costs/)).toBeVisible();
    await expect(editor).toContainText("Recorded now: INR 40,000"); // fixed costs untouched
    await expect(editor).toContainText("Recorded now: INR 30,000"); // variable costs untouched
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("D9: component amendments are isolated — known, then one to UNKNOWN, then an explicit zero, each surviving a reload", async () => {
    await openMoney(page);
    await periodRow(page, "September 2026").getByTestId("finance-saved-period-update").click();
    let editor = page.getByTestId("finance-period-editor");
    await editor.getByLabel(/^Refund amount/).fill("100");
    await editor.getByLabel(/^Rework cost/).fill("200");
    await editor.getByLabel(/^Complaint cost/).fill("300");
    await page.getByTestId("finance-period-editor-submit").click();
    await expect(page.getByTestId("finance-update-notice")).toContainText("Saved as a correction");

    // one component → UNKNOWN
    await page.reload({ waitUntil: "networkidle" });
    await periodRow(page, "September 2026").getByTestId("finance-saved-period-update").click();
    editor = page.getByTestId("finance-period-editor");
    await expect(editor).toContainText("Recorded now: INR 200");
    await page.getByTestId("finance-period-unknown-reworkCost").check();
    await page.getByTestId("finance-period-editor-submit").click();
    await expect(page.getByTestId("finance-update-notice")).toContainText("Saved as a correction");

    // reload: rework is back to UNKNOWN, refund and complaint untouched; then an explicit zero for complaint
    await page.reload({ waitUntil: "networkidle" });
    await periodRow(page, "September 2026").getByTestId("finance-saved-period-update").click();
    editor = page.getByTestId("finance-period-editor");
    const hintOf = async (label: RegExp) => {
      const id = ((await editor.getByLabel(label).getAttribute("aria-describedby")) ?? "").split(" ")[0];
      return page.locator(`[id="${id}"]`).textContent();
    };
    expect(await hintOf(/^Rework cost/)).toContain("Recorded now: not entered");
    expect(await hintOf(/^Refund amount/)).toContain("Recorded now: INR 100");
    expect(await hintOf(/^Complaint cost/)).toContain("Recorded now: INR 300");
    await editor.getByLabel(/^Complaint cost/).fill("0");
    await page.getByTestId("finance-period-editor-submit").click();
    await expect(page.getByTestId("finance-update-notice")).toContainText("Saved as a correction");

    await page.reload({ waitUntil: "networkidle" });
    await periodRow(page, "September 2026").getByTestId("finance-saved-period-update").click();
    editor = page.getByTestId("finance-period-editor");
    expect(await hintOf(/^Complaint cost/)).toContain("Recorded now: INR 0"); // a KNOWN zero, distinct from "not entered"
    expect(await hintOf(/^Rework cost/)).toContain("Recorded now: not entered");
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("N1: the owner re-runs the diagnosis on the corrected figures and Money shows them", async () => {
    await openMoney(page);
    const button = page.getByRole("button", { name: /diagnos/i }).first();
    await expect(button).toBeVisible();
    await button.click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("finance-period-scope")).toBeVisible();
  });

  test("N2: with cash UNKNOWN, My Business never says cash was supplied and names the period", async () => {
    await openMoney(page);
    await periodRow(page, "September 2026").getByTestId("finance-saved-period-update").click();
    await page.getByTestId("finance-period-unknown-cashOnHand").check();
    await page.getByTestId("finance-period-editor-submit").click();
    await expect(page.getByTestId("finance-update-notice")).toContainText("Saved as a correction");
    await page.goto("/owner/data", { waitUntil: "networkidle" });
    const statement = page.getByTestId("data-hub-first-read-ready");
    await expect(statement).toBeVisible();
    const text = (await statement.textContent()) ?? "";
    expect(text).toContain("You have given OpsIQ revenue and a cost figure for September 2026.");
    expect(text).toMatch(/Cash in hand is not entered/);
    expect(text).not.toMatch(/revenue, a cost figure and cash/);
  });

  test("N3/N4/N5: Home — no 'no profit leak' beside a cost-leak target, no raw names, distinct confidence labels", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    // every collapsed section is opened so nothing an owner could expand is skipped; innerText = what a person reads (no <script> data)
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { (d as HTMLDetailsElement).open = true; }));
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(RAW);
    expect(body).not.toMatch(/No profit leak detected yet/);
    expect(body).not.toMatch(/No profit leak detected/i);
    const title = page.getByTestId("owner-decision-title");
    if ((await title.count()) && /cost leakage|discount/i.test((await title.first().textContent()) ?? "")) {
      // the main target IS a Finance cost leak → the profit-leak card must say where that leak is
      await expect(page.getByTestId("cockpit-profit-leak-section")).toContainText("Cost leakage found in your Money figures");
    }
    const target = page.getByTestId("owner-decision-confidence");
    if (await target.count()) await expect(target.first()).toContainText(/^Confidence in this main target:|Needs your information|Refresh the analysis first|Figures disagree|No main target yet/);
    await page.goto("/owner/finance", { waitUntil: "networkidle" });
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { (d as HTMLDetailsElement).open = true; }));
    const money = await page.locator("body").innerText();
    expect(money).not.toMatch(RAW);
    if (await page.getByTestId("finance-data-completeness").count()) {
      await expect(page.getByTestId("finance-data-completeness")).toContainText(/^Data completeness: /);
    }
    for (const el of await page.getByTestId("finding-strength").all()) await expect(el).toContainText(/^Finding strength: /);
    expect(money).not.toMatch(/How sure OpsIQ is/);
  });

  const CASES: Array<{ name: string; fill: () => Promise<void>; label: string; says: RegExp }> = [
    { name: "repeat customers > total customers", fill: async () => { await fill(page, "Customer count", "10"); await fill(page, "Repeat customers", "25"); }, label: "Repeat customers", says: /Repeat customers \(25\) cannot be more than total customers \(10\)/ },
    { name: "overdue receivables > total receivables", fill: async () => { await fill(page, "Receivables", "1000"); await fill(page, "Receivables overdue", "1500"); }, label: "Receivables overdue", says: /Overdue receivables \(1500\) cannot be more than total receivables \(1000\)/ },
    { name: "overdue payables > total payables", fill: async () => { await fill(page, "Payables", "800"); await fill(page, "Payables overdue", "900"); }, label: "Payables overdue", says: /Overdue payables \(900\) cannot be more than total payables \(800\)/ },
    { name: "fixed-cost components > total fixed costs", fill: async () => { await fill(page, "Fixed costs", "1000"); await fill(page, "Rent", "700"); await fill(page, "Salary / payroll", "600"); await fill(page, "Utilities", "100"); }, label: "Fixed costs", says: /Total fixed costs \(1000\) is less than the rent, payroll and utilities you entered \(1400\)/ },
    { name: "B2C + B2B revenue > total revenue", fill: async () => { await fill(page, "Revenue", "5000"); await fill(page, "B2C revenue", "4000"); await fill(page, "B2B revenue", "2000"); }, label: "Revenue", says: /Revenue \(5000\) is less than the consumer and business revenue you entered \(6000\)/ },
  ];
  for (const c of CASES) {
    test(`N6: ${c.name}`, async () => {
      await openMoney(page);
      await openAddForm(page, "2026-08-01", "2026-08-31");
      await c.fill();
      await page.getByRole("button", { name: "Save snapshot" }).click();
      const alert = page.getByTestId("snapshot-save-error");
      await expect(alert).toContainText("Nothing was saved");
      await expect(alert).not.toContainText(/try (saving )?again/i);
      const input = page.getByLabel(c.label, { exact: true });
      await expect(input).toHaveAttribute("aria-invalid", "true");
      await expect(input).toBeFocused();
      const described = await input.getAttribute("aria-describedby");
      await expect(page.locator(`[id="${described!.split(" ")[0]}"]`)).toContainText(c.says);
      expect(await input.inputValue()).not.toBe(""); // typed values are still there
      await expect(page.locator("body")).not.toContainText(/periodEnd|periodStart|Validation failed/);
    });
  }

  test("N6: reversed date range", async () => {
    await openMoney(page);
    await openAddForm(page, "2026-08-31", "2026-08-01");
    await fill(page, "Revenue", "123");
    await page.getByRole("button", { name: "Save snapshot" }).click();
    await expect(page.getByTestId("snapshot-save-error")).toContainText("Nothing was saved");
    const end = page.getByLabel("These numbers cover: to");
    await expect(end).toHaveAttribute("aria-invalid", "true");
    await expect(end).toBeFocused();
    await expect(page.locator(`[id="${(await end.getAttribute("aria-describedby"))!.split(" ")[0]}"]`)).toHaveText("The end of the period can't be before its start. Check both dates.");
    await expect(page.getByLabel("Revenue", { exact: true })).toHaveValue("123");
  });

  test("no fatal client errors during the run", async () => {
    expect(errors.filter((e) => /Cannot read|is not a function|Hydration failed/i.test(e))).toEqual([]);
  });
});
