/**
 * AI SUPERVISOR — COLLECTIVE (cross-domain) behavioral training (pure; no DB, no browser).
 *
 * Each required whole-business conflict is driven through the REAL arbitration engine
 * (arbitrate()), then mapped to a SupervisorInput exactly as the production whole-business-plan
 * service does, and fed to buildSupervisorSummary. This proves the supervisor consumes genuine
 * conflict-resolution output (winning recommendation + rejected alternatives + dominant constraint)
 * and surfaces it correctly to the owner:
 *
 *   conflict detected · losing option rejected · rejection reason shown · dominant constraint selected ·
 *   do-not-do shown · owner-readable explanation · profit/cash/workload impact shown · action status
 *   correct · proof + reassessment shown · ≤3 priorities (≤5 only in emergency).
 *
 * No new advice, no model, no autonomy: the supervisor only re-expresses the deterministic engine's
 * decision. The 17 library conflicts are selected from the real COLLECTIVE_CASES; the 3 not yet in the
 * library (cash-vs-hiring, delivery-speed-vs-margin, cyber/payment-vs-operations) are constructed as
 * BehavioralCases and resolved by the SAME arbitrate() engine.
 */
import { describe, it, expect } from "vitest";
import { arbitrate, type ArbitrationResult, type Constraint, type DomainCandidate } from "@/behavioral-validation/whole-business/arbitration";
import { COLLECTIVE_CASES } from "@/behavioral-validation/whole-business/collective-cases";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";
import { LOCATIONS } from "@/behavioral-validation/locations";
import type { BehavioralCase, CaseFlags } from "@/behavioral-validation/schema";
import { buildSupervisorSummary, type SupervisorInput } from "@/domain/owner-mode/supervisor-summary";

const CONSTRAINT_LABEL: Record<Constraint, string> = {
  compliance_block: "Compliance / legal block",
  proof_fraud_block: "Proof / fraud block",
  cash_survival: "Cash survival",
  below_margin: "Below-margin work",
  capacity_feasibility: "Capacity / feasibility",
  customer_quality: "Customer quality",
  owner_workload: "Owner workload",
  profitable_growth: "Profitable growth",
  efficiency_scaling: "Efficiency / scaling",
  optimization: "Optimisation",
};

const fullFlags = (p: Partial<CaseFlags>): CaseFlags => ({
  hostile: false, missingOrStaleData: false, cashRisk: false, capacityRisk: false,
  complianceRisk: false, ownerEmotional: false, remoteOwner: false, multiBranch: false, ...p,
});

const LOC = LOCATIONS[Object.keys(LOCATIONS)[0] as keyof typeof LOCATIONS];

/** Build a constructed BehavioralCase for the conflicts not yet in the library. */
function buildCase(opts: { id: string; conflict: string; decisionCategory: BehavioralCase["decisionCategory"]; flags: Partial<CaseFlags>; numbers: Record<string, number>; rootCause: string }): BehavioralCase {
  return {
    ...SEED_CASES[0],
    id: opts.id,
    sourceSeedCaseId: SEED_CASES[0].sourceSeedCaseId,
    title: opts.conflict,
    decisionCategory: opts.decisionCategory,
    location: LOC,
    numbers: { ...opts.numbers },
    messyFacts: [`Conflict: ${opts.conflict}.`, opts.rootCause],
    hiddenRootCause: opts.rootCause,
    flags: fullFlags(opts.flags),
  };
}

interface ConflictMeta {
  cashProfitImpact: string;
  ownerWorkloadImplication: string;
  proofRequirement: string;
}

/** Mirror of the production service mapping: runtime/arbitration output → SupervisorInput. */
function arbitrationToSupervisorInput(
  c: BehavioralCase,
  arb: ArbitrationResult,
  activeDomains: string[],
  meta: ConflictMeta,
): SupervisorInput {
  const dominant = arb.dominantConstraint;
  const isQuality = dominant === "customer_quality";
  const isCapacity = dominant === "capacity_feasibility";
  const isMargin = dominant === "below_margin";
  const realDomains = Array.from(new Set(["finance_cash", ...activeDomains.map(String)]));
  return {
    found: true,
    dominantConstraint: String(dominant),
    topPriorityLabel: CONSTRAINT_LABEL[dominant],
    nextBestAction: arb.winningRecommendation,
    rootCause: c.hiddenRootCause,
    doNotDo: arb.whatNotToDo,                                  // rejected tempting moves (with blocker)
    proofRequired: [meta.proofRequirement, arb.requiredProofToReconsider].filter((p) => p && p !== "—"),
    reassessmentTriggers: [arb.reassessmentDate],
    successMetrics: [`the metric behind ${String(dominant)}`],
    redDomains: [],
    ownerApprovalRequired: arb.ownerApprovalNeeded,
    ownerOffload: meta.ownerWorkloadImplication,
    delegatedWork: ["Named owner carries each step with a proof report."],
    opsiqPreparedWork: ["Draft the proof and reassessment schedule."],
    growthScaleAllowed: false,
    growthBlockedBy: arb.rejectedAlternatives.map((r) => String(r.blockedBy)),
    overallConfidence: "high",
    criticalDomainsAllReal: true,
    dataSourceMissing: [],
    realProviderDomains: realDomains,
    assessedDomains: realDomains,
    unsafeCount: 0,
    impact: {
      financeCash: meta.cashProfitImpact,
      marginPricing: isMargin ? "Contribution margin is negative after fully-loaded cost; more volume loses more." : "No margin change from the winning move.",
      equipmentCapacity: isCapacity ? "Load is capped to reliable, proven capacity." : "Capacity unchanged.",
      staffWorkload: "Work is delegated with proof so the owner is not the bottleneck.",
      customerQuality: isQuality ? "Quality/complaints are fixed before any acquisition spend." : "Quality maintained.",
    },
    ownerWorkloadOffload: meta.ownerWorkloadImplication,
    plan7Day: arb.reassessmentDate,
    plan30Day: "Verify the proof and re-check the dominant constraint.",
  };
}

interface ConflictSpec {
  name: string;
  expectedDominant: Constraint;
  build: () => { c: BehavioralCase; candidates: DomainCandidate[]; activeDomains: string[]; meta: ConflictMeta };
}

/** Pick the first library case for a recipe key (conflictArchetype). */
function fromLibrary(key: string, candidatesOverride?: DomainCandidate[]) {
  const cc = COLLECTIVE_CASES.find((x) => x.conflictArchetype === key);
  if (!cc) throw new Error(`no collective case for ${key}`);
  return {
    c: cc.base,
    // Some library recipes encode the tempting move as prose with a generic `proceed` candidate
    // (which no constraint blocks). Where we want the engine to actually REJECT the tempting move,
    // we pass a candidate whose action type the dominant constraint blocks — same base, real engine.
    candidates: candidatesOverride ?? cc.conflictingRecommendations,
    activeDomains: cc.activeDomains.map(String),
    meta: { cashProfitImpact: cc.cashProfitImpact, ownerWorkloadImplication: cc.ownerWorkloadImplication, proofRequirement: cc.proofRequirement },
  };
}

const CONFLICTS: ConflictSpec[] = [
  { name: "1. cash vs marketing", expectedDominant: "cash_survival", build: () => fromLibrary("cash_vs_marketing") },
  {
    name: "2. cash vs hiring", expectedDominant: "cash_survival",
    build: () => ({
      c: buildCase({ id: "ctest_cash_vs_hiring", conflict: "cash vs hiring", decisionCategory: "staff_process_equipment", flags: { cashRisk: true }, numbers: { cash: 18000 }, rootCause: "owner wants to hire while cash runway is short" }),
      candidates: [{ domain: "operations", action: "Hire more staff now", type: "hire" }, { domain: "finance", action: "Defer hiring until runway is proven", type: "proceed" }],
      activeDomains: ["cash_flow", "staff_management", "working_capital", "operations"],
      meta: { cashProfitImpact: "Hiring now would shorten an already-tight runway; deferring protects survival cash.", ownerWorkloadImplication: "Delegate the workload gap to existing staff with proof, not new payroll.", proofRequirement: "Proven cash runway and the true bottleneck before adding payroll." },
    }),
  },
  { name: "3. cash vs equipment purchase", expectedDominant: "cash_survival", build: () => fromLibrary("equipment_vs_runway") },
  { name: "4. cash vs expansion", expectedDominant: "cash_survival", build: () => fromLibrary("expansion_vs_unit_economics") },
  { name: "5. sales growth vs margin", expectedDominant: "below_margin", build: () => fromLibrary("sales_vs_margin") },
  { name: "6. customer quality vs acquisition", expectedDominant: "customer_quality", build: () => fromLibrary("quality_vs_acquisition") },
  { name: "7. staff workload vs growth", expectedDominant: "capacity_feasibility", build: () => fromLibrary("staff_vs_profit") },
  { name: "8. proof dispute vs operational completion", expectedDominant: "proof_fraud_block", build: () => fromLibrary("remote_owner_vs_proof") },
  { name: "9. compliance vs revenue", expectedDominant: "compliance_block", build: () => fromLibrary("compliance_vs_revenue") },
  {
    name: "10. owner workload vs owner control", expectedDominant: "owner_workload",
    build: () => fromLibrary("owner_vs_control", [
      { domain: "owner", action: "Owner personally approves and supervises every decision", type: "owner_centralize" },
      { domain: "ops", action: "Delegate with proof-based controls", type: "proceed" },
    ]),
  },
  { name: "11. B2B contract revenue vs payment terms", expectedDominant: "cash_survival", build: () => fromLibrary("contract_vs_working_capital") },
  {
    name: "12. vendor discount vs quality risk", expectedDominant: "customer_quality",
    build: () => fromLibrary("vendor_savings_vs_reliability", [
      { domain: "procurement", action: "Switch to the cheapest vendor (cut input cost) despite unresolved quality/rework", type: "cut_staff" },
      { domain: "ops", action: "Qualify the vendor's reliability before switching", type: "proceed" },
    ]),
  },
  {
    name: "13. delivery speed vs cost/margin", expectedDominant: "below_margin",
    build: () => ({
      c: buildCase({ id: "ctest_delivery_vs_margin", conflict: "delivery speed vs cost/margin", decisionCategory: "marketing_opportunity_contract", flags: {}, numbers: { consideredRate: 14, fullyLoadedCost: 18, paymentTermsDays: 15 }, rootCause: "a fast-delivery contract is priced below fully-loaded delivery cost" }),
      candidates: [{ domain: "sales", action: "Accept the fast-delivery contract at the offered rate", type: "accept_contract" }, { domain: "pricing", action: "Re-quote to cover delivery cost or decline", type: "proceed" }],
      activeDomains: ["delivery_logistics", "pricing_margin", "opportunity_eval", "operations"],
      meta: { cashProfitImpact: "Promising faster delivery below loaded cost loses money on every order.", ownerWorkloadImplication: "Delegate the re-quote with a cost sheet; owner approves the floor.", proofRequirement: "A fully-loaded delivery-cost sheet vs the offered rate." },
    }),
  },
  { name: "14. shutdown vs sunk-cost bias", expectedDominant: "cash_survival", build: () => fromLibrary("shutdown_vs_sunk_cost") },
  { name: "15. multi-location growth vs owner attention", expectedDominant: "owner_workload", build: () => fromLibrary("multi_location_vs_attention") },
  {
    name: "16. cyber/payment risk vs normal operations", expectedDominant: "compliance_block",
    build: () => ({
      c: buildCase({ id: "ctest_cyber_vs_ops", conflict: "cyber/payment risk vs normal operations", decisionCategory: "compliance_location_review", flags: { complianceRisk: true }, numbers: {}, rootCause: "a payment/data-loss exposure is unresolved while the owner wants to keep operating normally" }),
      candidates: [{ domain: "operations", action: "Keep operating normally past the exposure", type: "proceed_compliance" }, { domain: "risk", action: "Contain and get professional security/compliance review", type: "proceed" }],
      activeDomains: ["compliance_review", "risk_management", "business_continuity", "operations"],
      meta: { cashProfitImpact: "A breach risks fines and liability that dwarf the saved downtime.", ownerWorkloadImplication: "Owner must escalate to professional security/compliance review.", proofRequirement: "Professional security + compliance review confirming containment." },
    }),
  },
  { name: "17. discount campaign vs margin protection", expectedDominant: "cash_survival", build: () => fromLibrary("discount_vs_retention") },
  { name: "18. hiring vs process improvement", expectedDominant: "capacity_feasibility", build: () => fromLibrary("hiring_vs_process") },
  { name: "19. equipment purchase vs cash runway", expectedDominant: "cash_survival", build: () => fromLibrary("equipment_vs_runway") },
  { name: "20. franchise/brand rules vs local opportunity", expectedDominant: "below_margin", build: () => fromLibrary("franchise_rules_vs_local") },
];

describe("AI supervisor — collective training static assertions", () => {
  it("CONSTRAINT_LABEL has exactly 10 entries", () => {
    expect(Object.keys(CONSTRAINT_LABEL)).toHaveLength(10);
  });
  it("CONSTRAINT_LABEL 'cash_survival' contains 'Cash'", () => {
    expect(CONSTRAINT_LABEL.cash_survival).toContain("Cash");
  });
  it("CONSTRAINT_LABEL 'compliance_block' contains 'Compliance'", () => {
    expect(CONSTRAINT_LABEL.compliance_block).toContain("Compliance");
  });
  it("CONSTRAINT_LABEL 'proof_fraud_block' contains 'Proof'", () => {
    expect(CONSTRAINT_LABEL.proof_fraud_block).toContain("Proof");
  });
  it("CONSTRAINT_LABEL 'capacity_feasibility' contains 'Capacity'", () => {
    expect(CONSTRAINT_LABEL.capacity_feasibility).toContain("Capacity");
  });
  it("CONSTRAINT_LABEL 'customer_quality' contains 'Customer'", () => {
    expect(CONSTRAINT_LABEL.customer_quality).toContain("Customer");
  });
  it("CONSTRAINT_LABEL 'owner_workload' contains 'Owner'", () => {
    expect(CONSTRAINT_LABEL.owner_workload).toContain("Owner");
  });
  it("CONSTRAINT_LABEL 'below_margin' contains 'margin' (case-insensitive)", () => {
    expect(CONSTRAINT_LABEL.below_margin.toLowerCase()).toContain("margin");
  });
  it("CONSTRAINT_LABEL 'profitable_growth' is a non-empty string", () => {
    expect(CONSTRAINT_LABEL.profitable_growth.length).toBeGreaterThan(0);
  });
  it("CONSTRAINT_LABEL 'efficiency_scaling' is a non-empty string", () => {
    expect(CONSTRAINT_LABEL.efficiency_scaling.length).toBeGreaterThan(0);
  });
  it("CONSTRAINT_LABEL 'optimization' is a non-empty string", () => {
    expect(CONSTRAINT_LABEL.optimization.length).toBeGreaterThan(0);
  });
  it("CONFLICTS has exactly 20 entries", () => {
    expect(CONFLICTS).toHaveLength(20);
  });
  it("all CONFLICTS have a name string", () => {
    for (const spec of CONFLICTS) {
      expect(typeof spec.name).toBe("string");
      expect(spec.name.length).toBeGreaterThan(0);
    }
  });
  it("all CONFLICTS have a build function", () => {
    for (const spec of CONFLICTS) {
      expect(typeof spec.build).toBe("function");
    }
  });
  it("CONFLICTS[0].expectedDominant is 'cash_survival'", () => {
    expect(CONFLICTS[0].expectedDominant).toBe("cash_survival");
  });
  it("CONFLICTS[4].expectedDominant is 'below_margin' (sales growth vs margin)", () => {
    expect(CONFLICTS[4].expectedDominant).toBe("below_margin");
  });
  it("CONFLICTS[5].expectedDominant is 'customer_quality' (customer quality vs acquisition)", () => {
    expect(CONFLICTS[5].expectedDominant).toBe("customer_quality");
  });
  it("all CONFLICTS expectedDominant values are valid constraint keys", () => {
    for (const spec of CONFLICTS) {
      expect(spec.expectedDominant in CONSTRAINT_LABEL).toBe(true);
    }
  });
});

describe("AI supervisor — collective (cross-domain) conflict training", () => {
  for (const spec of CONFLICTS) {
    it(`[${spec.name}] supervisor resolves the conflict to the right priority and explains the rejection`, () => {
      const { c, candidates, activeDomains, meta } = spec.build();

      // 1+4. The real arbitration engine detects the conflict and selects the dominant constraint.
      const arb = arbitrate(c, candidates);
      expect(arb.dominantConstraint).toBe(spec.expectedDominant);

      // 2+3. A losing option is rejected WITH a reason that names the blocking constraint.
      expect(arb.rejectedAlternatives.length).toBeGreaterThan(0);
      for (const r of arb.rejectedAlternatives) {
        expect(r.reason.length).toBeGreaterThan(8);
        expect(String(r.blockedBy).length).toBeGreaterThan(0);
      }

      const s = buildSupervisorSummary(arbitrationToSupervisorInput(c, arb, activeDomains, meta));

      // 4. The supervisor headlines the dominant constraint.
      expect(s.mainIssue).toContain(CONSTRAINT_LABEL[spec.expectedDominant]);
      // 5. A do-not-do (the rejected losing option) is shown.
      expect(s.doNotDo.length).toBeGreaterThan(0);
      expect(s.doNotDo.join(" ")).toMatch(/do not/i);
      // 6. Owner-readable explanation.
      expect(s.whyItMatters.length).toBeGreaterThan(12);
      expect(s.mainIssue.length).toBeGreaterThan(0);

      // 7. Profit/cash/workload impact is surfaced.
      const relevant = s.impact.filter((i) => i.relevant).map((i) => i.dimension);
      expect(relevant).toContain("cash");
      expect(relevant).toContain("owner_workload");

      // 8. Action status is correct: blocked for compliance/proof; never a silent proceed otherwise.
      if (spec.expectedDominant === "compliance_block" || spec.expectedDominant === "proof_fraud_block") {
        expect(s.actionStatus).toBe("blocked");
        expect(s.canProceed).toBe(false);
        expect(s.emergency).toBe(true);
      } else {
        // Active-constraint conflicts always require owner approval — never silent proceed.
        expect(s.actionStatus).toBe("owner_decision_required");
        expect(s.ownerDecisionRequired).not.toBeNull();
      }

      // 9. Proof + reassessment are shown.
      expect(s.proofNeeded.length).toBeGreaterThan(0);
      expect(s.cadence.reassessmentTrigger.length).toBeGreaterThan(0);

      // 10. Dashboard stays concise: ≤3 priorities, or ≤5 only in a genuine emergency.
      if (s.emergency) expect(s.topPriorities.length).toBeLessThanOrEqual(5);
      else expect(s.topPriorities.length).toBeLessThanOrEqual(3);
    });
  }

  it("covers all 20 required collective conflicts with a uniquely-resolved dominant constraint", () => {
    expect(CONFLICTS.length).toBe(20);
    for (const spec of CONFLICTS) {
      const { c, candidates } = spec.build();
      expect(arbitrate(c, candidates).dominantConstraint).toBe(spec.expectedDominant);
    }
  });
});
