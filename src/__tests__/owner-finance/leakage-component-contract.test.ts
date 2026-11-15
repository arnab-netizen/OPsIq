/**
 * D9 — the leakage-component contract, pure parts (the database round trip is leakage-component-persistence.db.test.ts).
 *
 * Covers: what is persisted for each combination, how an amendment merges, how a stored row is read back (component-aware vs
 * legacy), and that a legacy combined figure can never read as complete component coverage. Also pins that moving to
 * separately stored components did NOT change the existing data-confidence semantics of the "Refund / Rework Cost" input.
 */
import { describe, it, expect } from "vitest";
import { ValidationError } from "@/infra/errors";
import { rowToFinanceInput, toFinanceInput } from "@/services/owner-finance/snapshot.service";
import { LEAKAGE_COMPONENT_CONTRACT_V1, leakageColumns, resolveAmendedLeakage } from "@/services/owner-finance/leakage-components";
import { importantFieldValue, leakageCoverage, refundGroupParts } from "@/domain/owner-finance/cost-model";
import { calculateDataConfidence } from "@/domain/owner-finance/data-confidence";
import { costLeakageRatioPct, refundReworkLeakagePct } from "@/domain/owner-finance/metrics";
import type { FinancialSnapshotInput } from "@/domain/owner-finance/types";

const base = (o: Partial<FinancialSnapshotInput> = {}): FinancialSnapshotInput => ({
  periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR", revenue: 100_000, fixedCosts: 40_000, variableCosts: 30_000,
  cashOnHand: 20_000, discountAmount: 3_000, ...o,
});

describe("D9 leakageColumns — what is persisted", () => {
  it("keeps each component independent: a number stays a number, an explicit 0 stays 0, omitted/null/NaN become NULL", () => {
    expect(leakageColumns({ refundAmount: 0, reworkCost: 5, complaintCost: undefined })).toEqual({
      refundAmount: 0, reworkCost: 5, complaintCost: null, leakageCompVersion: LEAKAGE_COMPONENT_CONTRACT_V1, refundReworkCost: 5,
    });
    expect(leakageColumns({ refundAmount: null, reworkCost: Number.NaN, complaintCost: Number.POSITIVE_INFINITY })).toMatchObject({
      refundAmount: null, reworkCost: null, complaintCost: null, refundReworkCost: null,
    });
  });
  it("the compatibility aggregate is the sum of the KNOWN components, NULL when none is known, 0 only for a known zero", () => {
    expect(leakageColumns({}).refundReworkCost).toBeNull();
    expect(leakageColumns({ refundAmount: 0 }).refundReworkCost).toBe(0);
    expect(leakageColumns({ refundAmount: 1, reworkCost: 2, complaintCost: 3 }).refundReworkCost).toBe(6);
  });
  it("always stamps the component-aware marker", () => {
    expect(leakageColumns({}).leakageCompVersion).toBe(1);
  });
});

describe("D9 toFinanceInput — API input is NOT merged", () => {
  it("passes refund, rework and complaint through separately", () => {
    const i = toFinanceInput({ ...base(), refundAmount: 1, reworkCost: 2, complaintCost: 3 } as never);
    expect([i.refundAmount, i.reworkCost, i.complaintCost]).toEqual([1, 2, 3]);
    expect(i.legacyCombinedLeakage).toBeUndefined();
  });
  it("omitted components stay undefined (UNKNOWN), never 0", () => {
    const i = toFinanceInput({ ...base(), refundAmount: 1 } as never);
    expect([i.refundAmount, i.reworkCost, i.complaintCost]).toEqual([1, undefined, undefined]);
  });
});

describe("D9 rowToFinanceInput — component-aware vs legacy", () => {
  const row = (o: Record<string, unknown>) => ({ periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR", revenue: 100_000, discountAmount: 3_000, ...o });

  it("a component-aware row reads each component as stored and ignores the compatibility aggregate", () => {
    const i = rowToFinanceInput(row({ leakageCompVersion: 1, refundAmount: 2, reworkCost: null, complaintCost: 0, refundReworkCost: 999 }));
    expect([i.refundAmount, i.reworkCost, i.complaintCost, i.legacyCombinedLeakage]).toEqual([2, undefined, 0, undefined]);
  });
  it("a legacy row (no marker) exposes ONLY the combined figure; every component stays UNKNOWN", () => {
    const i = rowToFinanceInput(row({ refundReworkCost: 5_000 }));
    expect([i.refundAmount, i.reworkCost, i.complaintCost, i.legacyCombinedLeakage]).toEqual([undefined, undefined, undefined, 5_000]);
  });
  it("a legacy row is never component-aware even if stray component columns were somehow populated", () => {
    const i = rowToFinanceInput(row({ refundReworkCost: 5_000, refundAmount: 5_000, reworkCost: 0, complaintCost: 0 }));
    expect([i.refundAmount, i.reworkCost, i.complaintCost, i.legacyCombinedLeakage]).toEqual([undefined, undefined, undefined, 5_000]);
  });
  it("a marker this code does not know is read as legacy (conservative), not as complete", () => {
    const i = rowToFinanceInput(row({ leakageCompVersion: 7, refundAmount: 1, reworkCost: 1, complaintCost: 1, refundReworkCost: 3 }));
    expect(i.legacyCombinedLeakage).toBe(3);
    expect(leakageCoverage(i).complete).toBe(false);
  });
});

describe("D9 leakageCoverage — a legacy combined figure can never be complete", () => {
  it("legacy figure present: incomplete, the combined amount is KNOWN-but-ambiguous, the split is UNKNOWN", () => {
    const c = leakageCoverage(base({ legacyCombinedLeakage: 5_000 }));
    expect(c.complete).toBe(false);
    expect(c.known).toEqual(["discounts", "refunds, redone work and complaint costs combined"]);
    expect(c.unknown).toEqual(["the split between refunds, redone work and complaint costs"]);
  });
  it("a legacy figure of 0 is still ambiguous (a combined 0 does not prove each component was 0)", () => {
    expect(leakageCoverage(base({ legacyCombinedLeakage: 0 })).complete).toBe(false);
  });
  it("legacy takes precedence over component fields if both were ever present (never double counted, never complete)", () => {
    const i = base({ legacyCombinedLeakage: 5_000, refundAmount: 5_000, reworkCost: 0, complaintCost: 0 });
    expect(leakageCoverage(i).complete).toBe(false);
    expect(refundGroupParts(i)).toEqual([5_000]);
    expect(costLeakageRatioPct(i)).toBe(8); // (3,000 + 5,000) / 100,000, not 13
  });
  it("no legacy figure and all three components known is complete; any one unknown is not", () => {
    expect(leakageCoverage(base({ refundAmount: 1, reworkCost: 1, complaintCost: 1 })).complete).toBe(true);
    for (const miss of ["refundAmount", "reworkCost", "complaintCost"] as const) {
      const i = base({ refundAmount: 1, reworkCost: 1, complaintCost: 1, [miss]: undefined });
      expect(leakageCoverage(i).complete).toBe(false);
    }
  });
  it("the legacy known amount still contributes to the metrics (lower bound preserved, nothing silently dropped)", () => {
    const i = base({ legacyCombinedLeakage: 5_000 });
    expect(refundReworkLeakagePct(i)).toBe(5);
    expect(costLeakageRatioPct(i)).toBe(8);
  });
});

describe("D9 amendment — resolveAmendedLeakage", () => {
  const v1 = (refundAmount: number | null, reworkCost: number | null, complaintCost: number | null) => ({
    leakageCompVersion: 1, refundAmount, reworkCost, complaintCost, refundReworkCost: leakageColumns({ refundAmount, reworkCost, complaintCost }).refundReworkCost,
  });
  const legacy = (refundReworkCost: number | null) => ({ leakageCompVersion: null, refundAmount: null, reworkCost: null, complaintCost: null, refundReworkCost });

  it("component-aware: omitted keeps, number sets, null returns to UNKNOWN — per component", () => {
    const r = resolveAmendedLeakage(v1(10, 20, 30), { reworkCost: null, complaintCost: 0 });
    expect([r.refundAmount, r.reworkCost, r.complaintCost, r.refundReworkCost]).toEqual([10, null, 0, 10]);
  });
  it("component-aware: amending one component fabricates nothing for the other two", () => {
    const r = resolveAmendedLeakage(v1(null, null, null), { complaintCost: 4 });
    expect([r.refundAmount, r.reworkCost, r.complaintCost]).toEqual([null, null, 4]);
  });
  it("component-aware, nothing leakage-related amended: state carried forward unchanged", () => {
    const r = resolveAmendedLeakage(v1(10, null, 0), {});
    expect([r.refundAmount, r.reworkCost, r.complaintCost, r.leakageCompVersion, r.touched]).toEqual([10, null, 0, 1, false]);
  });
  it("legacy, nothing leakage-related amended: stays legacy — combined figure kept, components NULL, marker NULL", () => {
    const r = resolveAmendedLeakage(legacy(5_000), {});
    expect([r.refundAmount, r.reworkCost, r.complaintCost, r.leakageCompVersion, r.refundReworkCost]).toEqual([null, null, null, null, 5_000]);
    expect(r.upgradedFromLegacy).toBe(false);
  });
  it("legacy with no combined figure stays legacy with NULL aggregate", () => {
    expect(resolveAmendedLeakage(legacy(null), {}).refundReworkCost).toBeNull();
  });
  it("legacy + a PARTIAL restatement is refused (the combined figure cannot be split), naming the missing components", () => {
    try {
      resolveAmendedLeakage(legacy(5_000), { refundAmount: 100 });
      throw new Error("expected a ValidationError");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      const fieldErrors = ((e as ValidationError).details?.fieldErrors ?? []) as Array<{ path: string }>;
      expect(fieldErrors.map((f) => f.path).sort()).toEqual(["complaintCost", "reworkCost"]);
    }
    expect(() => resolveAmendedLeakage(legacy(5_000), { reworkCost: null })).toThrow(ValidationError);
  });
  it("legacy + a FULL restatement upgrades to component-aware; null components stay UNKNOWN (not 0)", () => {
    const r = resolveAmendedLeakage(legacy(5_000), { refundAmount: 1_000, reworkCost: null, complaintCost: 0 });
    expect([r.refundAmount, r.reworkCost, r.complaintCost, r.leakageCompVersion, r.refundReworkCost, r.upgradedFromLegacy]).toEqual([1_000, null, 0, 1, 1_000, true]);
  });
  it("the legacy combined figure is never copied into any component by any path", () => {
    for (const body of [{}, { refundAmount: 1, reworkCost: 2, complaintCost: 3 }, { refundAmount: null, reworkCost: null, complaintCost: null }]) {
      const r = resolveAmendedLeakage(legacy(5_000), body);
      for (const k of ["refundAmount", "reworkCost", "complaintCost"] as const) expect(r[k]).not.toBe(5_000);
    }
  });
});

describe("D9 — data-confidence semantics of the 'Refund / Rework Cost' input are unchanged", () => {
  const score = (i: FinancialSnapshotInput) => calculateDataConfidence(i, { now: new Date("2026-10-05") }).dataConfidenceScore;
  it("the input counts as supplied when ANY part is known — as components or as a legacy combined figure — and missing only when none is", () => {
    const none = score(base());
    const supplied = score(base({ refundAmount: 1 }));
    expect(supplied).toBe(none + 5);
    expect(score(base({ reworkCost: 1 }))).toBe(supplied);
    expect(score(base({ complaintCost: 0 }))).toBe(supplied);
    expect(score(base({ legacyCombinedLeakage: 5_000 }))).toBe(supplied);
    expect(score(base({ refundAmount: 1, reworkCost: 1, complaintCost: 1 }))).toBe(supplied);
  });
  it("importantFieldValue reports the group as supplied/missing consistently", () => {
    expect(importantFieldValue(base(), "refundAmount")).toBeUndefined();
    expect(importantFieldValue(base({ reworkCost: 0 }), "refundAmount")).toBe(0);
    expect(importantFieldValue(base({ legacyCombinedLeakage: 2 }), "refundAmount")).toBe(2);
    expect(importantFieldValue(base({ revenue: 7 }), "revenue")).toBe(7);
  });
});
