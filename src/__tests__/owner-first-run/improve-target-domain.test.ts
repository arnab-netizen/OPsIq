/**
 * The pure decisions behind "Improve this recommendation": where the owner goes (by EXISTING evidence), what the button says,
 * which snapshot a read is about, whether a correction changes anything, and what the owner is told after coming back.
 */
import { describe, it, expect } from "vitest";
import {
  amendmentChangesNothing,
  buildImproveOutcome,
  categoryConsumedByRead,
  decideBankImproveTarget,
  decideImproveTarget,
  financeFieldsForCategory,
  type ImproveFacts,
  type ImproveReadTokens,
} from "@/domain/owner-first-run/improve-target";
import { selectFirstReadHead } from "@/domain/owner-finance/first-read-sufficiency";
import { assessCorrectionDraft, correctionFields } from "@/domain/owner-first-run/correction-form";
import { withFirstRunReturn } from "@/domain/owner-first-run/first-run-return";
import { OWNER_INPUT_CATEGORIES } from "@/domain/owner-mode/input-catalog";

const READ = { snapshotId: "s1", periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-09-30T00:00:00.000Z", currency: "GBP" };
const facts = (over: Partial<ImproveFacts> & { category: string }): ImproveFacts => ({
  read: READ,
  finance: { revenue: 12000, fixedCosts: 7000, variableCosts: 4000, cashOnHand: 1500 },
  cashflow: { effective: null, usableBankBalance: null, ignoredRecent: [] },
  ...over,
});
const entry = (o: Partial<NonNullable<ImproveFacts["cashflow"]["effective"]>> = {}) => ({
  id: "c1", updatedAt: "2026-10-01T10:00:00.000Z", periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-09-30T00:00:00.000Z", currency: "GBP", bankBalance: null, cashInHand: 200, ...o,
});

describe("decideImproveTarget — Finance-backed evidence", () => {
  it("is on the read's own Finance entry: 'Edit this' with the current value when recorded", () => {
    const t = decideImproveTarget(facts({ category: "revenue_sales" }));
    expect(t).toMatchObject({ kind: "EDIT_FINANCE", snapshotId: "s1", hasValue: true, actionLabel: "Edit this", href: "/owner/first-run?correct=revenue_sales", currency: "GBP" });
    expect((t as { currentValues: unknown }).currentValues).toEqual([{ field: "revenue", label: "Revenue", value: 12000 }]);
  });
  it("'Add this' (to the same entry) when blank — never a second entry for another period", () => {
    const t = decideImproveTarget(facts({ category: "payroll" }));
    expect(t).toMatchObject({ kind: "EDIT_FINANCE", hasValue: false, actionLabel: "Add this", snapshotId: "s1" });
  });
  it("a recorded zero is a value ('Edit this'), a null is not", () => {
    expect(decideImproveTarget(facts({ category: "payroll", finance: { payroll: 0 } }))).toMatchObject({ hasValue: true, actionLabel: "Edit this" });
    expect(decideImproveTarget(facts({ category: "payroll", finance: { payroll: null } }))).toMatchObject({ hasValue: false });
  });
  it("lists every figure the question covers, in a fixed order, with the amendment field names the Correct flow accepts", () => {
    const t = decideImproveTarget(facts({ category: "fixed_costs", finance: { fixedCosts: 7000, rent: null, utilities: 90 } })) as { currentValues: Array<{ field: string; value: number | null }> };
    expect(t.currentValues.map((v) => [v.field, v.value])).toEqual([["fixedCosts", 7000], ["rent", null], ["utilities", 90]]);
    expect(financeFieldsForCategory("expenses").map((f) => f.name)).toEqual(["variableCosts", "costOfGoodsOrServices"]);
    expect(financeFieldsForCategory("payroll").map((f) => f.name)).toEqual(["salaryPayroll"]);
    expect(financeFieldsForCategory("inventory_stock")).toEqual([]);
  });
});

describe("decideImproveTarget — the bank balance (Cashflow)", () => {
  it("nothing recorded → ADD, dated to the read's period with the return marker", () => {
    const t = decideBankImproveTarget(facts({ category: "cash_debt" }));
    expect(t).toMatchObject({ kind: "ADD", actionLabel: "Add this", href: "/owner/cashflow?periodStart=2026-09-01&periodEnd=2026-09-30&returnTo=first-run" });
  });
  it("an entry for the read's period exists without a balance → EDIT_CASHFLOW 'Add this' to THAT entry", () => {
    const t = decideBankImproveTarget(facts({ category: "cash_debt", cashflow: { effective: entry(), usableBankBalance: null, ignoredRecent: [] } }));
    expect(t).toMatchObject({ kind: "EDIT_CASHFLOW", snapshotId: "c1", updatedAt: "2026-10-01T10:00:00.000Z", hasValue: false, actionLabel: "Add this", href: "/owner/cashflow?edit=c1&returnTo=first-run" });
  });
  it("a usable balance → 'Edit this' with the current value", () => {
    const t = decideBankImproveTarget(facts({ category: "cash_debt", cashflow: { effective: entry({ bankBalance: 1500 }), usableBankBalance: 1500, ignoredRecent: [] } }));
    expect(t).toMatchObject({ kind: "EDIT_CASHFLOW", hasValue: true, actionLabel: "Edit this" });
    expect((t as { currentValues: unknown }).currentValues).toEqual([{ field: "bankBalance", label: "Bank balance", value: 1500 }, { field: "cashInHand", label: "Cash in hand", value: 200 }]);
  });
  it("an entry too old for the freshness window cannot count, however it is edited → ADD a new entry for the read's period", () => {
    const old = entry({ periodStart: "2026-05-01T00:00:00.000Z", periodEnd: "2026-05-31T00:00:00.000Z", bankBalance: 500 });
    expect(decideBankImproveTarget(facts({ category: "cash_debt", cashflow: { effective: old, usableBankBalance: null, ignoredRecent: [] } })).kind).toBe("ADD");
    const oldBlank = entry({ periodStart: "2026-05-01T00:00:00.000Z", periodEnd: "2026-05-31T00:00:00.000Z" });
    expect(decideBankImproveTarget(facts({ category: "cash_debt", cashflow: { effective: oldBlank, usableBankBalance: null, ignoredRecent: [] } })).kind).toBe("ADD");
  });
  it("a blank entry from a fresh EARLIER period is completed in place (it is the row the read consults)", () => {
    const earlier = entry({ periodStart: "2026-08-10T00:00:00.000Z", periodEnd: "2026-08-31T00:00:00.000Z" });
    expect(decideBankImproveTarget(facts({ category: "cash_debt", cashflow: { effective: earlier, usableBankBalance: null, ignoredRecent: [] } }))).toMatchObject({ kind: "EDIT_CASHFLOW", snapshotId: "c1" });
  });
  it("a balance saved for a period the read does not use → NOT_USED_BY_READ naming BOTH periods, with the way that counts", () => {
    const t = decideBankImproveTarget(facts({ category: "cash_debt", cashflow: { effective: null, usableBankBalance: null, ignoredRecent: [{ periodStart: "2026-10-01T00:00:00.000Z", periodEnd: "2026-10-31T00:00:00.000Z" }] } }));
    expect(t).toMatchObject({ kind: "NOT_USED_BY_READ", reason: "PERIOD_MISMATCH", next: { kind: "ADD" } });
    expect((t as { explanation: string }).explanation).toBe("Saved, but this read doesn't use it, because it covers October 2026 and your read covers September 2026.");
  });
  it("an ignored entry is irrelevant once the read HAS a usable balance", () => {
    const t = decideBankImproveTarget(facts({ category: "cash_debt", cashflow: { effective: entry({ bankBalance: 9 }), usableBankBalance: 9, ignoredRecent: [{ periodStart: "2026-10-01T00:00:00.000Z", periodEnd: "2026-10-31T00:00:00.000Z" }] } }));
    expect(t.kind).toBe("EDIT_CASHFLOW");
  });
  it("the latest ignored period is the one named", () => {
    const t = decideBankImproveTarget(facts({ category: "cash_debt", cashflow: { effective: null, usableBankBalance: null, ignoredRecent: [
      { periodStart: "2026-10-01T00:00:00.000Z", periodEnd: "2026-10-31T00:00:00.000Z" }, { periodStart: "2026-11-01T00:00:00.000Z", periodEnd: "2026-11-30T00:00:00.000Z" },
    ] } })) as { explanation: string };
    expect(t.explanation).toContain("November 2026");
  });
});

describe("decideImproveTarget — cash_debt order and non-money evidence", () => {
  it("cash in hand first, then the bank balance the read can use, then debt, then edit the balance", () => {
    expect(decideImproveTarget(facts({ category: "cash_debt", finance: { cashOnHand: null } }))).toMatchObject({ kind: "EDIT_FINANCE", currentValues: [{ field: "cashOnHand" }] });
    expect(decideImproveTarget(facts({ category: "cash_debt" })).kind).toBe("ADD");
    const withBank = { effective: entry({ bankBalance: 5 }), usableBankBalance: 5, ignoredRecent: [] };
    expect(decideImproveTarget(facts({ category: "cash_debt", cashflow: withBank }))).toMatchObject({ kind: "EDIT_FINANCE", currentValues: [{ field: "loanEmiDebtPayments" }, { field: "totalDebtOutstanding" }] });
    expect(decideImproveTarget(facts({ category: "cash_debt", cashflow: withBank, finance: { cashOnHand: 1, debtPayments: 0, totalDebtOutstanding: 0 } })).kind).toBe("EDIT_CASHFLOW");
  });
  it("every catalog category has an answer; the ones the money read never consumes are NOT_USED_BY_READ with a real add path", () => {
    for (const category of OWNER_INPUT_CATEGORIES) {
      const t = decideImproveTarget(facts({ category }));
      expect(["ADD", "EDIT_FINANCE", "EDIT_CASHFLOW", "NOT_USED_BY_READ"]).toContain(t.kind);
      if (t.kind === "NOT_USED_BY_READ") {
        expect(t.reason).toBe("CATEGORY_NOT_READ");
        expect(t.addHref).toMatch(/^\/owner\/.+returnTo=first-run/);
        expect(t.explanation).toMatch(/won't change this recommendation/);
      }
    }
    expect(decideImproveTarget(facts({ category: "inventory_stock" })).kind).toBe("NOT_USED_BY_READ");
    expect(decideImproveTarget(facts({ category: "marketing" })).kind).toBe("EDIT_FINANCE");
  });
  it("the decision reads only persisted facts: identical facts always give the identical answer", () => {
    const f = facts({ category: "payroll" });
    expect(decideImproveTarget(f)).toEqual(decideImproveTarget(JSON.parse(JSON.stringify(f))));
  });
});

describe("withFirstRunReturn is idempotent", () => {
  it("never doubles the marker", () => {
    expect(withFirstRunReturn("/owner/cashflow?edit=1&returnTo=first-run")).toBe("/owner/cashflow?edit=1&returnTo=first-run");
    expect(withFirstRunReturn("/owner/finance")).toBe("/owner/finance?returnTo=first-run");
    expect(withFirstRunReturn(withFirstRunReturn("/owner/manual-entry#sec"))).toBe("/owner/manual-entry?returnTo=first-run#sec");
  });
});

describe("selectFirstReadHead — agrees with first-read sufficiency", () => {
  const ok = { id: "ok", revenue: 1, fixedCosts: 1, cashOnHand: 1 };
  const thin = { id: "thin", revenue: 1 };
  it("a sufficient completed snapshot wins; else a sufficient provisional one; else completed; else provisional", () => {
    expect(selectFirstReadHead({ completed: ok, provisional: { ...ok, id: "p" } })).toEqual({ head: ok, basis: "completed" });
    expect(selectFirstReadHead({ completed: thin, provisional: { ...ok, id: "p" } })).toMatchObject({ head: { id: "p" }, basis: "provisional" });
    expect(selectFirstReadHead({ completed: thin, provisional: { id: "p2", revenue: 5 } })).toMatchObject({ head: { id: "thin" }, basis: "completed" });
    expect(selectFirstReadHead({ completed: null, provisional: thin })).toMatchObject({ head: { id: "thin" }, basis: "provisional" });
    expect(selectFirstReadHead({ completed: null, provisional: null })).toEqual({ head: null, basis: "none" });
  });
});

describe("amendmentChangesNothing", () => {
  const row = { revenue: 12000, fixedCosts: 7000, payroll: null, evidenceQuality: "GOOD_ESTIMATE" };
  it("is true only when every figure (and the stated reliability) equals what is recorded", () => {
    expect(amendmentChangesNothing(row, { amendmentReason: "r", revenue: 12000 })).toBe(true);
    expect(amendmentChangesNothing(row, { amendmentReason: "r", revenue: 12000, evidenceQuality: "GOOD_ESTIMATE" })).toBe(true);
    expect(amendmentChangesNothing(row, { amendmentReason: "r", revenue: 12001 })).toBe(false);
    expect(amendmentChangesNothing(row, { amendmentReason: "r", evidenceQuality: "ACTUAL" })).toBe(false);
    expect(amendmentChangesNothing(row, { amendmentReason: "r", salaryPayroll: 0 })).toBe(false); // null → 0 is a change
    expect(amendmentChangesNothing(row, { amendmentReason: "r", notes: "x" })).toBe(false); // unknown column → conservative
    expect(amendmentChangesNothing(row, { amendmentReason: "r" })).toBe(false); // nothing given is not a "no-op correction" either
  });
});

describe("correction form fields", () => {
  it("always offers the four quick figures and adds the server's extra figures once", () => {
    expect(correctionFields().map((f) => f.name)).toEqual(["revenue", "fixedCosts", "variableCosts", "cashOnHand"]);
    expect(correctionFields([{ name: "salaryPayroll", label: "Payroll / staff cost" }, { name: "revenue", label: "Revenue" }]).map((f) => f.name)).toEqual(["revenue", "fixedCosts", "variableCosts", "cashOnHand", "salaryPayroll"]);
  });
  it("blank is unchanged, 0 is real, junk is an error, and entering what is recorded is flagged", () => {
    const fields = correctionFields([{ name: "salaryPayroll", label: "Payroll" }]);
    const a = assessCorrectionDraft({ revenue: "12000", salaryPayroll: "0", fixedCosts: "abc" }, fields, { revenue: 12000, salaryPayroll: null });
    expect(a.values).toEqual({ revenue: 12000, salaryPayroll: 0 });
    expect(a.errors.fixedCosts).toBeTruthy();
    expect(a.sameAsRecorded).toEqual(["revenue"]);
  });
});

describe("buildImproveOutcome — never claims more than is true", () => {
  const humanize = (k: string) => k;
  const tokens = (o: Partial<ImproveReadTokens> = {}): ImproveReadTokens => ({
    noticed: "Fixed costs are high", recommendedAction: "Review fixed costs", confidenceTier: "LOW", evidenceQuality: "GOOD_ESTIMATE",
    missingEvidence: ["Fixed costs"], sharpenBy: null, cautions: ["c1"], ...o,
  });
  const before = (o: Record<string, unknown> = {}) => ({
    recommendedAction: "Review fixed costs", confidenceTier: "LOW", evidenceQuality: "GOOD_ESTIMATE", missingEvidence: ["Fixed costs"], questionLabel: "Payroll",
    noticed: "Fixed costs are high", sharpenBy: null as string | null, cautions: ["c1"], ...o,
  });
  it("identical tokens → UNCHANGED: 'Nothing changed in your read', no improvement wording", () => {
    const o = buildImproveOutcome({ questionLabel: "Payroll", before: before(), after: tokens(), target: null, humanize });
    expect(o.kind).toBe("UNCHANGED");
    expect(o.headline).toBe("Nothing changed in your read");
    expect(o.lines.join(" ")).not.toMatch(/improv|latest information|What changed/i);
  });
  it("identical read while the evidence is still blank says it is still missing", () => {
    const target = decideImproveTarget(facts({ category: "payroll" }));
    const o = buildImproveOutcome({ questionLabel: "Payroll", before: before(), after: tokens(), target, humanize });
    expect(o.lines.join(" ")).toMatch(/still missing/);
  });
  it("any differing token → CHANGED, and each change is stated from the tokens", () => {
    const o = buildImproveOutcome({ questionLabel: "Payroll", before: before(), after: tokens({ confidenceTier: "HIGH", missingEvidence: [], cautions: [], recommendedAction: "Raise prices" }), target: null, humanize });
    expect(o.kind).toBe("CHANGED");
    const text = o.lines.join("\n");
    expect(text).toMatch(/How sure OpsIQ is: low → high/);
    expect(text).toMatch(/No longer missing: fixed costs/);
    expect(text).toMatch(/No longer a caution: c1/);
    expect(text).toMatch(/Recommendation: Review fixed costs → Raise prices/);
  });
  it("a cleared 'what would sharpen this' request is reported", () => {
    const o = buildImproveOutcome({ questionLabel: null, before: before({ sharpenBy: "Add your bank balance" }), after: tokens({ sharpenBy: null }), target: null, humanize });
    expect(o.lines.join("\n")).toMatch(/OpsIQ no longer needs: add your bank balance/);
  });
  it("evidence saved for an unused period → NOT_USED with the periods, even though the read is unchanged", () => {
    const target = decideBankImproveTarget(facts({ category: "cash_debt", cashflow: { effective: null, usableBankBalance: null, ignoredRecent: [{ periodStart: "2026-10-01T00:00:00.000Z", periodEnd: "2026-10-31T00:00:00.000Z" }] } }));
    const o = buildImproveOutcome({ questionLabel: "Cash", before: before(), after: tokens(), target, humanize });
    expect(o.kind).toBe("NOT_USED");
    expect(o.headline).toBe("Saved, but this read doesn't use it");
    expect(o.lines.join(" ")).toContain("because it covers October 2026 and your read covers September 2026");
  });
  it("a category the money read never uses says so, without pretending anything was saved", () => {
    const target = decideImproveTarget(facts({ category: "inventory_stock" }));
    const o = buildImproveOutcome({ questionLabel: "Stock", before: before(), after: tokens(), target, humanize });
    expect(o.kind).toBe("NOT_USED");
    expect(o.headline).toBe("Your read doesn't use that kind of information");
    expect(o.lines.join(" ")).not.toMatch(/Saved/);
  });
  it("no 'before' record → UNCOMPARABLE: the read is refreshed, but no claim about change either way", () => {
    const o = buildImproveOutcome({ questionLabel: null, before: null, after: tokens(), target: null, humanize });
    expect(o.kind).toBe("UNCOMPARABLE");
    expect(o.lines.join(" ")).toMatch(/can't compare/);
    expect(o.lines.join(" ")).not.toMatch(/improv|latest information|Nothing changed/i);
  });
  it("an older 'before' record (no optional tokens) compares only what it captured", () => {
    const old = { recommendedAction: "Review fixed costs", confidenceTier: "LOW", evidenceQuality: "GOOD_ESTIMATE", missingEvidence: ["Fixed costs"], questionLabel: "Payroll" };
    expect(buildImproveOutcome({ questionLabel: "Payroll", before: old, after: tokens(), target: null, humanize }).kind).toBe("UNCHANGED");
    expect(buildImproveOutcome({ questionLabel: "Payroll", before: old, after: tokens({ missingEvidence: [] }), target: null, humanize }).kind).toBe("CHANGED");
  });
});

describe("one source of truth: what the read consumes", () => {
  it("categoryConsumedByRead is true exactly when decideImproveTarget does NOT answer 'category not read'", () => {
    for (const category of OWNER_INPUT_CATEGORIES) {
      const t = decideImproveTarget(facts({ category }));
      const notRead = t.kind === "NOT_USED_BY_READ" && t.reason === "CATEGORY_NOT_READ";
      expect(categoryConsumedByRead(category), category).toBe(!notRead);
    }
    expect(categoryConsumedByRead("inventory_stock")).toBe(false);
    expect(categoryConsumedByRead("cash_debt")).toBe(true);
  });
});

describe("buildImproveOutcome — the cash/debt sequence never says the wrong thing is missing", () => {
  const humanize = (k: string) => k;
  const same = {
    noticed: "n", recommendedAction: "a", confidenceTier: "LOW", evidenceQuality: "GOOD_ESTIMATE", missingEvidence: ["Debt"], sharpenBy: null as string | null, cautions: [] as string[],
  };
  const before = { ...same, questionLabel: "Your bank balance", category: "cash_debt" };
  it("bank balance added, target moved on to the debt figures: names the debt figures, not 'the information you went to add'", () => {
    const target = decideImproveTarget(facts({
      category: "cash_debt",
      finance: { cashOnHand: 1500, debtPayments: null, totalDebtOutstanding: null },
      cashflow: { effective: entry({ bankBalance: 900 }), usableBankBalance: 900, ignoredRecent: [] },
    }));
    expect(target.kind).toBe("EDIT_FINANCE");
    const o = buildImproveOutcome({ questionLabel: "Your bank balance", before, after: { ...same }, target, humanize });
    const text = o.lines.join(" ");
    expect(text).not.toMatch(/information you went to add is still missing/);
    expect(text).toMatch(/OpsIQ still needs: loan \/ emi payments, total debt outstanding/);
  });
  it("bank balance really still missing: says the bank balance is still needed", () => {
    const target = decideImproveTarget(facts({ category: "cash_debt" }));
    expect(target.kind).toBe("ADD");
    const o = buildImproveOutcome({ questionLabel: "Your bank balance", before, after: { ...same }, target, humanize });
    expect(o.lines.join(" ")).toMatch(/OpsIQ still needs: bank balance/);
  });
  it("a non-cash question still gets the plain sentence when its figure is blank", () => {
    const target = decideImproveTarget(facts({ category: "payroll" }));
    const o = buildImproveOutcome({ questionLabel: "Payroll", before: { ...before, category: "payroll" }, after: { ...same }, target, humanize });
    expect(o.lines.join(" ")).toMatch(/information you went to add is still missing/);
  });
});
