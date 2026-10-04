/**
 * Canonical first-read sufficiency — ONE rule shared by Finance, onboarding, My Business, Start Here,
 * the quick path and the first-read CTA. Cases A–J of the minimum-effort-input mission.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateFirstReadSufficiency,
  firstReadSufficiencyFromRow,
  firstReadSufficiencyFromSnapshots,
  firstReadSufficiencyFromCategories,
} from "@/domain/owner-finance/first-read-sufficiency";
import { missingCriticalFinanceInputs } from "@/domain/owner-finance/data-confidence";
import { computeOnboardingState, blocksFirstRead } from "@/domain/owner-mode/owner-onboarding";
import { buildInputGuidance } from "@/domain/owner-mode/input-guidance";
import { rowsToSuppliedCategories } from "@/services/owner-mode/owner-onboarding.service";
import { computeStartHereSteps } from "@/domain/owner-mode/start-here";
import type { OwnerDomainRows } from "@/services/owner-mode/owner-db-providers";

const base = { profileType: "laundry_local_service", ownerRole: "owner_operated", businessName: "B" } as const;

/** A persisted-snapshot-shaped row. */
const row = (o: Record<string, number | null>) => ({ revenue: null, costOfGoods: null, fixedCosts: null, variableCosts: null, rent: null, payroll: null, utilities: null, cashOnHand: null, ...o });

/** Drive every consumer from the same snapshot row and return what each says about the first read. */
function everySurface(r: ReturnType<typeof row> | null) {
  const firstRead = firstReadSufficiencyFromSnapshots({ completed: r, provisional: null });
  const rows = { finance: r, cashflow: null, wcItems: [], confirmedIntakeDomains: [] } as unknown as OwnerDomainRows;
  const supplied = rowsToSuppliedCategories(rows);
  const onboarding = computeOnboardingState({ ...base, suppliedCategories: supplied, firstRead });
  const guidance = buildInputGuidance({ profileType: base.profileType, ownerRole: base.ownerRole, suppliedCategories: supplied, firstRead });
  const startHere = computeStartHereSteps({
    businessBasicsComplete: true,
    canRunFirstDiagnosis: onboarding.canRunFirstDiagnosis,
    missingMinimum: onboarding.missingMinimum,
    suppliedCategories: supplied,
    requirements: onboarding.requirements,
    hasEngagedAPriority: false,
  }).find((s) => s.id === "money_numbers")!;
  return { firstRead, onboarding, guidance, startHere };
}

describe("canonical first-read sufficiency — cases A–J", () => {
  it.each([
    ["A revenue + fixedCosts + cash", { revenue: 600000, fixedCosts: 200000, cashOnHand: 180000 }],
    ["B revenue + variableCosts + cash", { revenue: 600000, variableCosts: 250000, cashOnHand: 180000 }],
    ["C revenue + COGS + cash (detailed/import path)", { revenue: 600000, costOfGoods: 250000, cashOnHand: 180000 }],
    ["rent alone is a cost", { revenue: 1, rent: 1, cashOnHand: 1 }],
    ["payroll alone is a cost", { revenue: 1, payroll: 1, cashOnHand: 1 }],
    ["utilities alone is a cost", { revenue: 1, utilities: 1, cashOnHand: 1 }],
  ])("%s → sufficient on EVERY surface", (_name, values) => {
    const r = row(values);
    const { firstRead, onboarding, guidance, startHere } = everySurface(r);
    expect(firstRead.sufficient).toBe(true);
    expect(firstRead.missing).toEqual([]);
    // Finance's own engine agrees (the contract is the engine's, not a copy).
    expect(missingCriticalFinanceInputs({
      revenue: r.revenue ?? undefined, costOfGoodsOrServices: r.costOfGoods ?? undefined, fixedCosts: r.fixedCosts ?? undefined,
      variableCosts: r.variableCosts ?? undefined, rent: r.rent ?? undefined, salaryPayroll: r.payroll ?? undefined,
      utilities: r.utilities ?? undefined, cashOnHand: r.cashOnHand ?? undefined,
    })).toEqual([]);
    expect(onboarding.canRunFirstDiagnosis).toBe(true);
    expect(guidance.canRunFirstDiagnosis).toBe(true);
    expect(startHere.complete).toBe(true);
    for (const c of ["revenue_sales", "expenses", "fixed_costs", "payroll", "cash_debt"] as const) expect(blocksFirstRead(c, onboarding.firstRead)).toBe(false);
  });

  it.each([
    ["D revenue + cash only → costs missing", { revenue: 1, cashOnHand: 1 }, ["costs"]],
    ["E cost + cash only → revenue missing", { fixedCosts: 1, cashOnHand: 1 }, ["revenue"]],
    ["F revenue + cost only → cash missing", { revenue: 1, variableCosts: 1 }, ["cashOnHand"]],
    ["J blank snapshot → everything unknown", {}, ["revenue", "costs", "cashOnHand"]],
  ])("%s → blocked on every surface, naming only what is missing", (_name, values, missing) => {
    const { firstRead, onboarding, guidance, startHere } = everySurface(row(values));
    expect(firstRead.sufficient).toBe(false);
    expect(firstRead.missing).toEqual(missing);
    expect(onboarding.canRunFirstDiagnosis).toBe(false);
    expect(guidance.canRunFirstDiagnosis).toBe(false);
    expect(startHere.complete).toBe(false);
    expect(onboarding.confidenceBeforeDiagnosis).toBe("none");
  });

  it("G/H/I known zero revenue, cost and cash are PRESENT evidence, not missing", () => {
    const { firstRead, onboarding } = everySurface(row({ revenue: 0, fixedCosts: 0, cashOnHand: 0 }));
    expect(firstRead).toMatchObject({ sufficient: true, revenueKnown: true, costKnown: true, cashKnown: true });
    expect(onboarding.canRunFirstDiagnosis).toBe(true);
  });

  it("zero in one field never rescues a different missing field (zero ≠ blank)", () => {
    expect(firstReadSufficiencyFromRow(row({ revenue: 0 })).missing).toEqual(["costs", "cashOnHand"]);
    expect(evaluateFirstReadSufficiency({ revenue: 0, fixedCosts: 0 }).missing).toEqual(["cashOnHand"]);
  });

  it("no snapshot at all → basis none, everything missing", () => {
    const r = firstReadSufficiencyFromRow(null);
    expect(r).toMatchObject({ sufficient: false, basis: "none", missing: ["revenue", "costs", "cashOnHand"] });
  });

  it("the readiness copy names exactly the missing facts, in the owner's words", () => {
    const s = computeOnboardingState({ ...base, suppliedCategories: [], firstRead: evaluateFirstReadSufficiency({ revenue: 5, cashOnHand: 5 }) });
    expect(s.firstAction).toMatch(/one cost figure/);
    expect(s.firstAction).not.toMatch(/revenue|cash in hand/);
  });
});

describe("provisional vs completed basis (provisional periods stay provisional)", () => {
  const good = row({ revenue: 1, fixedCosts: 1, cashOnHand: 1 });
  it("a sufficient COMPLETED snapshot wins", () => {
    expect(firstReadSufficiencyFromSnapshots({ completed: good, provisional: good }).basis).toBe("completed");
  });
  it("a sufficient in-progress snapshot is labelled provisional, never completed", () => {
    const r = firstReadSufficiencyFromSnapshots({ completed: null, provisional: good });
    expect(r).toMatchObject({ sufficient: true, basis: "provisional" });
  });
  it("an incomplete completed snapshot does not borrow the provisional one's missing fields", () => {
    const r = firstReadSufficiencyFromSnapshots({ completed: row({ revenue: 1 }), provisional: row({ revenue: 1, fixedCosts: 1 }) });
    expect(r.sufficient).toBe(false);
    expect(r.basis).toBe("completed");
    expect(r.missing).toEqual(["costs", "cashOnHand"]);
  });
});

describe("category-presence adapter (callers without a snapshot) uses the same rule", () => {
  it("any one cost category satisfies the cost fact", () => {
    for (const cost of ["expenses", "fixed_costs", "payroll"] as const) {
      expect(firstReadSufficiencyFromCategories(new Set(["revenue_sales", cost, "cash_debt"])).sufficient).toBe(true);
    }
  });
  it("a missing fact blocks regardless of how many unrelated categories are supplied", () => {
    const r = firstReadSufficiencyFromCategories(new Set(["revenue_sales", "cash_debt", "marketing", "equipment_logs", "customer_count"]));
    expect(r.sufficient).toBe(false);
    expect(r.missing).toEqual(["costs"]);
  });
});

describe("rowsToSuppliedCategories is NOT the gate any more (no taxonomy artifact decides readiness)", () => {
  it("fixed-costs-only evidence maps to fixed_costs (never relabelled as expenses) yet the first read is open", () => {
    const rows = { finance: row({ revenue: 5, fixedCosts: 5, cashOnHand: 5 }), cashflow: null, wcItems: [], confirmedIntakeDomains: [] } as unknown as OwnerDomainRows;
    const supplied = rowsToSuppliedCategories(rows);
    expect(supplied).toContain("fixed_costs");
    expect(supplied).not.toContain("expenses");
    const s = computeOnboardingState({ ...base, suppliedCategories: supplied, firstRead: firstReadSufficiencyFromRow(rows.finance as never) });
    expect(s.canRunFirstDiagnosis).toBe(true);
  });
});
