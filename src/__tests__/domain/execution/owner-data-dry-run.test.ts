import { describe, it, expect } from "vitest";
import {
  ProductDimension,
  OWNER_DATA_INTAKE_CHECKLIST,
  assessDryRunReadiness,
  buildBlankIntakeTemplate,
} from "@/domain/execution/owner-data-dry-run";
import type { TrialPackInput } from "@/domain/execution/trial-pack";

/** A complete, realistic owner-data payload (no fabricated values are asserted as truth — this is a test fixture). */
function completeInput(over: Partial<TrialPackInput> = {}): TrialPackInput {
  return {
    businessProfile: { businessName: "Acme Laundry", industry: "laundry", locationOrService: "Pune", ownerRole: "owner", headcount: 4 },
    ownerGoals: { primaryGoal: "reduce rework", topPainPoint: "redo jobs", currentMonthlyRevenueBand: "2-5L", urgency: "high" },
    paymentCash: { cashRunwayMonths: 3, monthlyFixedCost: 120000, outstandingReceivables: 40000 },
    pricingBoundary: { maxDiscountPercent: 10, maxRefund: 0, refundPromiseAllowed: false, priceQuoteAllowed: false, allowedActions: ["call_customer"] },
    employees: [{ name: "R", role: "counter_staff", reliability: "medium", isKeyPerson: false }],
    capacity: { dailyJobCapacity: 80, currentBacklog: 12, peakHours: ["18:00-20:00"] },
    customersOrders: [{ customerSegment: "retail", orderValue: 300, channel: "walk_in", date: "2026-06-20" }],
    sopInput: { taskType: "wash", currentSteps: ["sort", "wash", "fold"] },
    proofExamples: [{ taskType: "wash", proofType: "photo", exampleDescription: "folded stack" }],
    complaintHistory: [{ issue: "missing item", frequency: "weekly", severity: "medium" }],
    marginTarget: 35,
    ...over,
  };
}

describe("[slice26] owner-data dry-run checklist", () => {
  it("covers all four product dimensions with at least one blocking input each", () => {
    const blockingDims = new Set(
      OWNER_DATA_INTAKE_CHECKLIST.filter((i) => i.blocking).map((i) => i.dimension)
    );
    expect(blockingDims).toEqual(
      new Set([
        ProductDimension.CONSULTING_LIFECYCLE,
        ProductDimension.BUSINESS_CONDITION,
        ProductDimension.INTERVENTION_MODE_PHASE,
        ProductDimension.HUMAN_EXECUTION_REALITY,
      ])
    );
  });

  it("each checklist item names concrete required fields", () => {
    for (const item of OWNER_DATA_INTAKE_CHECKLIST) {
      expect(item.requiredFields.length).toBeGreaterThan(0);
      expect(item.format.length).toBeGreaterThan(0);
      expect(item.why.length).toBeGreaterThan(0);
    }
  });

  it("blank template has a null slot per section and fabricates nothing", () => {
    const t = buildBlankIntakeTemplate();
    for (const item of OWNER_DATA_INTAKE_CHECKLIST) {
      expect(t[item.section]).toBeNull();
    }
  });
});

describe("[slice26] dry-run readiness — fail closed", () => {
  it("empty data is BLOCKED with all blocking gaps and all dimensions uncovered", () => {
    const r = assessDryRunReadiness({});
    expect(r.ready).toBe(false);
    expect(r.verdict).toBe("BLOCKED_MISSING_REQUIRED_DATA");
    expect(r.blockingGaps.length).toBe(
      OWNER_DATA_INTAKE_CHECKLIST.filter((i) => i.blocking).length
    );
    expect(r.uncoveredDimensions.length).toBe(4);
    // Provisional output is still safe + owner-approval gated.
    expect(r.provisional.requiresOwnerApproval).toBe(true);
    expect(r.provisional.safeProvisionalOnly).toBe(true);
  });

  it("complete data is READY for a supervised dry run", () => {
    const r = assessDryRunReadiness(completeInput());
    expect(r.ready).toBe(true);
    expect(r.verdict).toBe("READY_FOR_SUPERVISED_DRY_RUN");
    expect(r.blockingGaps).toHaveLength(0);
    expect(r.uncoveredDimensions).toHaveLength(0);
  });

  it("a structurally-present but BLANK pack is fail-closed BLOCKED (no false READY)", () => {
    const blank: TrialPackInput = {
      businessProfile: { businessName: "", industry: "", locationOrService: "", ownerRole: "", headcount: 0 },
      ownerGoals: { primaryGoal: "", topPainPoint: "", currentMonthlyRevenueBand: "", urgency: "" },
      paymentCash: { cashRunwayMonths: 0, monthlyFixedCost: 0, outstandingReceivables: 0 },
      pricingBoundary: { maxDiscountPercent: 0, maxRefund: 0, refundPromiseAllowed: false, priceQuoteAllowed: false, allowedActions: [] },
      employees: [{ name: "", role: "", reliability: "", isKeyPerson: false }],
      capacity: { dailyJobCapacity: 0, currentBacklog: 0, peakHours: [] },
    };
    const r = assessDryRunReadiness(blank);
    expect(r.ready).toBe(false);
    // Empty strings/arrays in required fields are not satisfied; numeric 0 alone isn't enough.
    expect(r.blockingGaps.map((g) => g.section)).toEqual(
      expect.arrayContaining(["businessProfile", "ownerGoals", "pricingBoundary", "employees", "capacity"])
    );
  });

  it("numeric zero counts as a provided value (0 is valid, not missing)", () => {
    const r = assessDryRunReadiness(completeInput({ paymentCash: { cashRunwayMonths: 0, monthlyFixedCost: 0, outstandingReceivables: 0 } }));
    expect(r.blockingGaps.map((g) => g.section)).not.toContain("paymentCash");
  });

  it("a single missing blocking section blocks the dry run and flags its dimension", () => {
    const r = assessDryRunReadiness(completeInput({ pricingBoundary: undefined }));
    expect(r.ready).toBe(false);
    expect(r.blockingGaps.map((g) => g.section)).toContain("pricingBoundary");
    expect(r.uncoveredDimensions).toContain(ProductDimension.INTERVENTION_MODE_PHASE);
  });

  it("missing only optional sections stays READY but lowers confidence", () => {
    const r = assessDryRunReadiness(
      completeInput({ customersOrders: [], complaintHistory: [], proofExamples: [], sopInput: undefined, marginTarget: null })
    );
    expect(r.ready).toBe(true);
    expect(r.nonBlockingGaps.length).toBeGreaterThan(0);
    expect(r.completeness.score).toBeLessThan(1);
  });

  it("readiness never silently starts execution — provisional always requires owner approval", () => {
    const r = assessDryRunReadiness(completeInput());
    expect(r.provisional.requiresOwnerApproval).toBe(true);
    expect(r.nextActions.some((a) => /approve/i.test(a))).toBe(true);
  });
});
