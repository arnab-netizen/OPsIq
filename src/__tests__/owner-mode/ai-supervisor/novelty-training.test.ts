/**
 * AI SUPERVISOR — NEW / UNFAMILIAR SITUATION behavioral training (pure; no DB, no browser).
 *
 * Proves the supervisor handles novel situations WITHOUT fake certainty:
 *  - confidence is lowered and can never read "high" while a critical domain is missing;
 *  - a specific data request OR an escalation (owner decision / professional review) is produced;
 *  - a safe immediate next step is given (enter data / contain / get review) — never a silent "proceed";
 *  - NO high-risk autonomous action (high-risk ⇒ owner decision; legal/fraud ⇒ blocked);
 *  - the dashboard disposition is cautionary (canProceed is false);
 *  - learning/assumptions stay marked (no unmarked material assumption).
 *
 * Trains the EXISTING deterministic seam buildSupervisorSummary — no new advice, model, or autonomy.
 */
import { describe, it, expect } from "vitest";
import { buildSupervisorSummary, type SupervisorInput } from "@/domain/owner-mode/supervisor-summary";

function base(over: Partial<SupervisorInput> = {}): SupervisorInput {
  return {
    found: true,
    dominantConstraint: "optimization",
    topPriorityLabel: "Routine optimization",
    nextBestAction: "Apply the measured optimization with proof.",
    rootCause: "Stable; only fine-tuning remains.",
    doNotDo: [],
    proofRequired: ["measured proof of the change"],
    reassessmentTriggers: ["after the proof is accepted"],
    successMetrics: ["the metric behind the change"],
    redDomains: [],
    ownerApprovalRequired: false,
    ownerOffload: "Hand routine checks to the supervisor; owner reviews exceptions only.",
    delegatedWork: ["Supervisor owns the step with a proof report."],
    opsiqPreparedWork: ["Draft the checklist and reassessment schedule."],
    growthScaleAllowed: false,
    growthBlockedBy: [],
    overallConfidence: "high",
    criticalDomainsAllReal: true,
    dataSourceMissing: [],
    realProviderDomains: ["finance_cash", "operations"],
    assessedDomains: ["finance_cash", "operations"],
    unsafeCount: 0,
    impact: {
      financeCash: "Cash neutral.",
      marginPricing: "No margin change.",
      equipmentCapacity: "Capacity unchanged.",
      staffWorkload: "No staff change.",
      customerQuality: "Quality maintained.",
    },
    ownerWorkloadOffload: "Hand routine checks to the supervisor; owner reviews exceptions only.",
    plan7Day: "Stabilise and verify the proof.",
    plan30Day: "Re-check the KPI.",
    ...over,
  };
}

type Kind = "sparse" | "blocked" | "high_risk";

interface NoveltyCase {
  name: string;
  kind: Kind;
  over: Partial<SupervisorInput>;
}

const CASES: NoveltyCase[] = [
  {
    name: "1. unfamiliar business category (no domain priors)", kind: "sparse",
    over: { criticalDomainsAllReal: false, overallConfidence: "low", dataSourceMissing: ["finance_cash", "operations", "pricing_margin"], realProviderDomains: [], assessedDomains: ["finance_cash", "operations", "pricing_margin"], rootCause: "Unfamiliar business category; no domain priors yet." },
  },
  {
    name: "2. sparse data (only one weak signal)", kind: "sparse",
    over: { criticalDomainsAllReal: false, overallConfidence: "none", dataSourceMissing: ["finance_cash", "working_capital"], realProviderDomains: [], assessedDomains: ["finance_cash", "working_capital", "operations"] },
  },
  {
    name: "3. unusual contract (novel terms, incomplete numbers)", kind: "high_risk",
    over: { dominantConstraint: "below_margin", topPriorityLabel: "Below-margin work", overallConfidence: "medium", ownerApprovalRequired: true, nextBestAction: "Re-quote to a viable margin or decline; do not sign on novel terms.", doNotDo: ["Do not sign the unusual contract before a fully-loaded cost check."], proofRequired: ["fully-loaded cost vs the novel terms"], rootCause: "Contract terms are unfamiliar and may be below loaded cost." },
  },
  {
    name: "4. sudden competitor action (uncertain demand impact)", kind: "sparse",
    over: { dominantConstraint: "profitable_growth", topPriorityLabel: "Profitable growth", criticalDomainsAllReal: false, overallConfidence: "low", dataSourceMissing: ["sales", "marketing"], realProviderDomains: ["finance_cash"], assessedDomains: ["finance_cash", "sales", "marketing"], rootCause: "A competitor's sudden move; demand impact is not yet measured." },
  },
  {
    name: "5. new local compliance uncertainty", kind: "blocked",
    over: { dominantConstraint: "compliance_block", topPriorityLabel: "Compliance / legal block", overallConfidence: "medium", nextBestAction: "Pause and obtain a written professional compliance/tax review for the new locality.", doNotDo: ["Do not proceed in the new locality before professional review."], proofRequired: ["written professional compliance review"], redDomains: ["compliance_review"], rootCause: "Local law/tax for this new area is uncertain." },
  },
  {
    name: "6. new equipment/process (unproven throughput)", kind: "sparse",
    over: { dominantConstraint: "capacity_feasibility", topPriorityLabel: "Capacity / feasibility", criticalDomainsAllReal: false, overallConfidence: "low", dataSourceMissing: ["equipment_capacity"], realProviderDomains: ["finance_cash", "operations"], assessedDomains: ["finance_cash", "operations", "equipment_capacity"], rootCause: "A new process/machine has no measured throughput yet." },
  },
  {
    name: "7. unusual staff/vendor behavior (unverifiable numbers)", kind: "blocked",
    over: { dominantConstraint: "proof_fraud_block", topPriorityLabel: "Proof / fraud block", overallConfidence: "medium", unsafeCount: 1, nextBestAction: "Require independent verification before acting on the report.", doNotDo: ["Do not act on unverifiable staff/vendor-reported numbers."], proofRequired: ["independent third-party verification"], redDomains: ["proof_anti_gaming"], rootCause: "Reported numbers from an unusual pattern cannot be verified." },
  },
  {
    name: "8. unexpected customer complaint pattern", kind: "sparse",
    over: { dominantConstraint: "customer_quality", topPriorityLabel: "Customer quality", criticalDomainsAllReal: false, overallConfidence: "low", dataSourceMissing: ["customer_reputation"], realProviderDomains: ["finance_cash", "operations"], assessedDomains: ["finance_cash", "operations", "customer_reputation"], rootCause: "A new complaint pattern with no root-cause data yet." },
  },
  {
    name: "9. new growth opportunity (unproven unit economics)", kind: "high_risk",
    over: { dominantConstraint: "profitable_growth", topPriorityLabel: "Profitable growth", overallConfidence: "medium", ownerApprovalRequired: true, nextBestAction: "Test via a capped, proof-gated pilot before any scale commitment.", proofRequired: ["pilot unit-economics proof"], growthScaleAllowed: false, growthBlockedBy: ["unproven unit economics"], rootCause: "A new opportunity whose unit economics are unproven at scale." },
  },
  {
    name: "10. external shock (sudden cash/demand disruption)", kind: "high_risk",
    over: { dominantConstraint: "cash_survival", topPriorityLabel: "Cash survival", overallConfidence: "medium", nextBestAction: "Protect cash first and re-plan against the shock.", doNotDo: ["Do not commit discretionary spend during the shock."], proofRequired: ["updated cash runway under the shock"], growthBlockedBy: ["cash runway", "demand drop"], rootCause: "An external shock has disrupted cash/demand suddenly." },
  },
];

describe("AI supervisor — novelty training CASES fixture assertions", () => {
  it("CASES has exactly 10 entries", () => {
    expect(CASES).toHaveLength(10);
  });
  it("all CASES have a non-empty name string", () => {
    for (const c of CASES) {
      expect(typeof c.name).toBe("string");
      expect(c.name.length).toBeGreaterThan(0);
    }
  });
  it("all CASES have kind that is 'sparse', 'blocked', or 'high_risk'", () => {
    const valid = new Set<Kind>(["sparse", "blocked", "high_risk"]);
    for (const c of CASES) {
      expect(valid.has(c.kind)).toBe(true);
    }
  });
  it("all CASES have an over object", () => {
    for (const c of CASES) {
      expect(typeof c.over).toBe("object");
      expect(c.over).not.toBeNull();
    }
  });
  it("CASES[0].name starts with '1.'", () => {
    expect(CASES[0].name).toMatch(/^1\./);
  });
  it("CASES[9].name starts with '10.'", () => {
    expect(CASES[9].name).toMatch(/^10\./);
  });
  it("sparse CASES count is 5", () => {
    expect(CASES.filter((c) => c.kind === "sparse").length).toBe(5);
  });
  it("blocked CASES count is 2", () => {
    expect(CASES.filter((c) => c.kind === "blocked").length).toBe(2);
  });
  it("high_risk CASES count is 3", () => {
    expect(CASES.filter((c) => c.kind === "high_risk").length).toBe(3);
  });
  it("all CASES names are unique", () => {
    const names = CASES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it("base() helper returns found: true", () => {
    expect(base().found).toBe(true);
  });
  it("base() helper returns dominantConstraint: 'optimization'", () => {
    expect(base().dominantConstraint).toBe("optimization");
  });
  it("base() helper returns overallConfidence: 'high'", () => {
    expect(base().overallConfidence).toBe("high");
  });
  it("base() helper returns growthScaleAllowed: false", () => {
    expect(base().growthScaleAllowed).toBe(false);
  });
  it("base() helper returns unsafeCount: 0", () => {
    expect(base().unsafeCount).toBe(0);
  });
  it("blocked CASES have dominantConstraint compliance_block or proof_fraud_block", () => {
    for (const c of CASES.filter((c) => c.kind === "blocked")) {
      expect(["compliance_block", "proof_fraud_block"]).toContain(c.over.dominantConstraint);
    }
  });
  it("some high_risk CASES have ownerApprovalRequired: true in over", () => {
    const highRisk = CASES.filter((c) => c.kind === "high_risk");
    expect(highRisk.some((c) => c.over.ownerApprovalRequired === true)).toBe(true);
  });
  it("sparse CASES have criticalDomainsAllReal: false in over", () => {
    for (const c of CASES.filter((c) => c.kind === "sparse")) {
      expect(c.over.criticalDomainsAllReal).toBe(false);
    }
  });
});

describe("AI supervisor — new / unfamiliar situation training", () => {
  for (const nc of CASES) {
    it(`[${nc.name}] handled with caution: no fake certainty, no high-risk autonomous action`, () => {
      const s = buildSupervisorSummary(base(nc.over));

      // Never fabricates confidence; novelty/sparse can never read "high".
      expect(s.confidence).not.toBe("high");

      // The dashboard disposition is cautionary — never a clean proceed for a novel situation.
      expect(s.canProceed).toBe(false);
      expect(s.actionStatus).not.toBe("proceed");

      // A safe immediate next step exists (enter data / contain / get review) — and it is not empty.
      expect(s.doNow.length).toBeGreaterThan(0);

      // Assumptions are always marked (no unmarked material assumption leaks through).
      expect(s.ledger.assumptionsAreMarked).toBe(true);

      if (nc.kind === "sparse") {
        // Lower confidence + a SPECIFIC data request, surfaced as the top priority and the do-now.
        expect(["none", "low"]).toContain(s.confidence);
        expect(s.actionStatus).toBe("need_more_data");
        expect(s.doNow).toMatch(/missing|enter|data/i);
        expect(s.ledger.missingData.length).toBeGreaterThan(0);
        const priorityText = s.topPriorities.map((p) => `${p.whatIsWrong} ${p.doNext}`).join(" ");
        expect(priorityText).toMatch(/add real records|missing/i);
        expect(s.ledger.whatWouldChange).toMatch(/record|data|evidence|proof/i);
      }

      if (nc.kind === "blocked") {
        // Legal-uncertainty / unverifiable-numbers ⇒ blocked + escalation to professional / independent review.
        expect(s.actionStatus).toBe("blocked");
        expect(s.emergency).toBe(true);
        expect(s.doNotDo.length).toBeGreaterThan(0);
        expect(s.proofNeeded.join(" ")).toMatch(/professional|review|independent|verification/i);
      }

      if (nc.kind === "high_risk") {
        // High-risk novel move ⇒ owner decision (never autonomous); proof + reassessment shown.
        expect(s.actionStatus).toBe("owner_decision_required");
        expect(s.ownerDecisionRequired).not.toBeNull();
        expect(s.proofNeeded.length).toBeGreaterThan(0);
        expect(s.cadence.reassessmentTrigger.length).toBeGreaterThan(0);
      }

      // Dashboard stays concise even under novelty.
      if (s.emergency) expect(s.topPriorities.length).toBeLessThanOrEqual(5);
      else expect(s.topPriorities.length).toBeLessThanOrEqual(3);
    });
  }

  it("a high-risk novel action is NEVER auto-approved (no autonomous proceed across the whole set)", () => {
    for (const nc of CASES) {
      const s = buildSupervisorSummary(base(nc.over));
      expect(s.canProceed).toBe(false);
    }
  });
});
