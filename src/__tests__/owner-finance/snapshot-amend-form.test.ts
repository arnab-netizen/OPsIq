/**
 * N1 — the owner updates a saved period through the governed amendment: the draft → amendment rules.
 * Blank = leave; number / 0 = set (0 is a KNOWN zero); "I don't know" = back to UNKNOWN (null, never 0);
 * a typed figure equal to the recorded one is not a change; a legacy combined leakage figure is never split.
 */
import { describe, it, expect } from "vitest";
import { financialSnapshotAmendSchema } from "@/domain/owner-finance/validation";
import { isLegacyLeakageRow, planPeriodAmendment, recordedFiguresFromRow, describeChange } from "@/domain/owner-finance/snapshot-amend-form";
import { FINANCE_FIELDS } from "@/domain/owner-finance/snapshot-fields";

const row = (o: Record<string, unknown> = {}) => ({
  id: "s1", periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-09-30T00:00:00.000Z", currency: "INR",
  revenue: null, fixedCosts: 40_000, variableCosts: 30_000, cashOnHand: 20_000, leakageCompVersion: 1,
  refundAmount: 10, reworkCost: 20, complaintCost: 30, refundReworkCost: 60, discountAmount: 5,
  ...o,
});
const plan = (r: Record<string, unknown>, draft: Record<string, string> = {}, unknown: Record<string, boolean> = {}, q = false) => planPeriodAmendment(r, draft, unknown, q);

describe("recordedFiguresFromRow — what is recorded NOW (null = not recorded)", () => {
  it("maps every form figure, reading the differently-named columns", () => {
    const rec = recordedFiguresFromRow(row({ payroll: 7, costOfGoods: 3, overdueReceivables: 2, deliveryCost: 9 }));
    expect(rec.revenue).toBeNull();
    expect(rec.salaryPayroll).toBe(7);
    expect(rec.costOfGoodsOrServices).toBe(3);
    expect(rec.receivablesOverdue).toBe(2);
    expect(rec.deliveryFulfilmentCost).toBe(9);
    expect(Object.keys(rec).sort()).toEqual(FINANCE_FIELDS.map((f) => f.name).sort());
  });
});

describe("planPeriodAmendment — UNKNOWN revenue becomes known", () => {
  it("sends ONLY the changed figure; unrelated figures are never in the amendment", () => {
    const p = plan(row(), { revenue: "80000" });
    expect(p.fields).toEqual({ revenue: 80_000 });
    expect(p.canSave).toBe(true);
    expect(p.changes).toEqual([{ field: "revenue", label: "Revenue", before: null, after: 80_000 }]);
  });
  it("the plan is accepted by the REAL amend schema (the route's own validation)", () => {
    const p = plan(row(), { revenue: "80000" });
    expect(financialSnapshotAmendSchema.safeParse({ amendmentReason: "x", ...p.fields }).success).toBe(true);
  });
  it("an explicit 0 is a KNOWN zero and is sent as 0 — distinct from blank", () => {
    expect(plan(row(), { revenue: "0" }).fields).toEqual({ revenue: 0 });
    expect(plan(row(), { revenue: "" }).fields).toEqual({});
    expect(plan(row(), { revenue: "   " }).canSave).toBe(false);
  });
  it("comma-grouped and currency-prefixed amounts read the way the rest of the product reads them; ambiguous ones are refused", () => {
    expect(plan(row(), { revenue: "1,50,000" }).fields).toEqual({ revenue: 150_000 });
    expect(plan(row(), { revenue: "1.500" }).errors.revenue).toBeTruthy();
    expect(plan(row(), { revenue: "abc" }).errors.revenue).toBeTruthy();
    expect(plan(row(), { revenue: "-5" }).errors.revenue).toMatch(/negative/);
    expect(plan(row(), { revenue: "-5" }).canSave).toBe(false);
  });
});

describe("planPeriodAmendment — known → UNKNOWN", () => {
  it("'I don't know' on a recorded figure is null (never 0); typed text is ignored while it is ticked", () => {
    const p = plan(row(), { cashOnHand: "5" }, { cashOnHand: true });
    expect(p.fields).toEqual({ cashOnHand: null });
    expect(p.changes[0]).toMatchObject({ field: "cashOnHand", before: 20_000, after: null });
  });
  it("'I don't know' on a figure that is already unknown changes nothing", () => {
    const p = plan(row(), {}, { revenue: true });
    expect(p.fields).toEqual({});
    expect(p.canSave).toBe(false);
  });
  it("the amend schema accepts null (UNKNOWN) and still rejects a negative", () => {
    expect(financialSnapshotAmendSchema.safeParse({ amendmentReason: "x", cashOnHand: null }).success).toBe(true);
    expect(financialSnapshotAmendSchema.safeParse({ amendmentReason: "x", cashOnHand: -1 }).success).toBe(false);
  });
});

describe("planPeriodAmendment — nothing to save", () => {
  it("a typed figure equal to what is recorded is not a change", () => {
    const p = plan(row(), { fixedCosts: "40000" });
    expect(p.fields).toEqual({});
    expect(p.sameAsRecorded).toEqual(["fixedCosts"]);
    expect(p.canSave).toBe(false);
  });
  it("stating how reliable the numbers are is itself savable", () => {
    expect(plan(row(), {}, {}, true).canSave).toBe(true);
  });
  it("an unreadable figure blocks saving", () => {
    expect(plan(row(), { revenue: "x", fixedCosts: "41000" }).canSave).toBe(false);
  });
});

describe("D9 — leakage components amend independently on a component-aware row", () => {
  it("changing one component sends only that component (the others are untouched)", () => {
    const p = plan(row(), { reworkCost: "25" });
    expect(p.fields).toEqual({ reworkCost: 25 });
  });
  it("known → UNKNOWN for one component sends null for that one only", () => {
    expect(plan(row(), {}, { reworkCost: true }).fields).toEqual({ reworkCost: null });
  });
  it("UNKNOWN → known: a previously unknown component can be supplied alone", () => {
    expect(plan(row({ complaintCost: null, refundReworkCost: 30 }), { complaintCost: "12" }).fields).toEqual({ complaintCost: 12 });
  });
  it("an explicit zero for a component is a known 0, not UNKNOWN", () => {
    expect(plan(row({ complaintCost: null }), { complaintCost: "0" }).fields).toEqual({ complaintCost: 0 });
  });
});

describe("D9 — a LEGACY combined figure is never split", () => {
  const legacy = () => row({ leakageCompVersion: null, refundAmount: null, reworkCost: null, complaintCost: null, refundReworkCost: 5_000 });
  it("is recognised by the SAME rule as the server: the component marker is absent (with or without a combined figure)", () => {
    expect(isLegacyLeakageRow(legacy())).toBe(true);
    expect(isLegacyLeakageRow(row())).toBe(false);
    expect(isLegacyLeakageRow(row({ leakageCompVersion: null, refundReworkCost: null }))).toBe(true);
  });
  it("a pre-D9 row with no combined figure: adding one component alone is blocked client-side, and 'I don't know' is available (no stranded owner)", () => {
    const r = row({ leakageCompVersion: null, refundAmount: null, reworkCost: null, complaintCost: null, refundReworkCost: null });
    expect(plan(r, { refundAmount: "5" }).canSave).toBe(false);
    expect(plan(r, { refundAmount: "5" }, { reworkCost: true, complaintCost: true }).fields).toEqual({ refundAmount: 5, reworkCost: null, complaintCost: null });
  });
  it("touching one of the three without addressing the others is refused before any request, naming the missing ones", () => {
    const p = plan(legacy(), { refundAmount: "100" });
    expect(p.canSave).toBe(false);
    expect(p.formProblem).toMatch(/combined figure/);
    expect(Object.keys(p.errors).sort()).toEqual(["complaintCost", "reworkCost"]);
  });
  it("a full restatement (numbers and/or 'I don't know') is allowed; unknown parts are null, never 0", () => {
    const p = plan(legacy(), { refundAmount: "1000", complaintCost: "0" }, { reworkCost: true });
    expect(p.canSave).toBe(true);
    expect(p.fields).toEqual({ refundAmount: 1000, complaintCost: 0, reworkCost: null });
  });
  it("a legacy row left alone sends no leakage field at all (it stays legacy)", () => {
    expect(plan(legacy(), { revenue: "10" }).fields).toEqual({ revenue: 10 });
  });
});

describe("describeChange", () => {
  it("words a change before → after, and an unknown as 'back to unknown'", () => {
    const fmt = (n: number | null) => (n === null ? "—" : String(n));
    expect(describeChange({ field: "revenue", label: "Revenue", before: null, after: 80 }, fmt)).toBe("Revenue: not entered → 80");
    expect(describeChange({ field: "cashOnHand", label: "Cash in hand", before: 5, after: null }, fmt)).toBe("Cash in hand: 5 → not known (back to unknown)");
  });
});
