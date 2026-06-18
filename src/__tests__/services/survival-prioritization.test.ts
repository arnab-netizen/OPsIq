import { describe, it, expect } from "vitest";
import {
  chooseFirstAction,
  type PrioritizedFirstAction,
} from "@/services/consulting-engine/survival-prioritization";
import { runConsultingEngine } from "@/services/consulting-engine/orchestrator";
import {
  DiagnosisType,
  InterventionClass,
  ConfidenceLevel,
  type ConsultingEngineInput,
  type EvidenceItem,
} from "@/domain/consulting-engine/types";
import { v4 as uuid } from "uuid";

const C = DiagnosisType;

function ev(
  dimension: string,
  finding: string,
  isCritical = true,
  supportingData?: Record<string, string | number | boolean>
) {
  return { dimension, finding, isCritical, supportingData };
}

describe("R3 survival prioritization — priority ladder", () => {
  it("PC-01: survival pressure (3-month runway) outranks the retention action", () => {
    const r = chooseFirstAction({
      diagnosisType: C.CUSTOMER_RETENTION_EROSION,
      committed: true,
      evidence: [
        ev("financial_health", "Cash runway is three months and obligations are fixed", true, { cashRunwayMonths: 3 }),
        ev("customer_retention", "Churn is also rising at eight percent", true, { churnPct: 8 }),
      ],
    });
    expect(r?.tier).toBe("SURVIVAL_CASH");
    expect(r?.plan.title.toLowerCase()).toContain("cash-flow");
  });

  it("DC-01: a deep discount that turns contribution negative becomes a defer/verify action", () => {
    const r = chooseFirstAction({
      diagnosisType: C.UNIT_ECONOMICS_FAILURE,
      committed: true,
      evidence: [
        ev("financial_health", "Margins are thin and the owner wants a deep across-the-board discount", true, { marginPct: 3 }),
        ev("financial_health", "Contribution after the proposed discount would turn negative per unit", true, { contribution: -5 }),
      ],
    });
    expect(r?.tier).toBe("DEFER_IRREVERSIBLE");
    expect(r?.plan.title.toLowerCase()).toContain("defer");
  });

  it("high capex on a temporary demand surge defers the capex (irreversible-danger)", () => {
    const r = chooseFirstAction({
      diagnosisType: C.UNIT_ECONOMICS_FAILURE,
      committed: true,
      evidence: [
        ev("financial_health", "Owner intends to commit an irreversible automation line", true, { capexAmount: 800000, reversibility: 0 }),
        ev("market_position", "The demand spike traces to a one-off promotional event", true, { demandDurabilityMonths: 3 }),
      ],
    });
    expect(r?.tier).toBe("DEFER_IRREVERSIBLE");
  });

  it("legal/compliance risk prioritizes a compliance review", () => {
    const r = chooseFirstAction({
      diagnosisType: C.OPERATIONAL_BOTTLENECK,
      committed: true,
      evidence: [
        ev("operational_efficiency", "Turnaround slipped; backlog grows", true, { turnaroundDays: 12 }),
        ev("market_position", "An unresolved regulatory compliance breach is outstanding", true),
      ],
    });
    expect(r?.tier).toBe("LEGAL_CONTAINMENT");
    expect(r?.plan.kind).toBe("COMPLIANCE_REVIEW");
  });

  it("healthy / no committed diagnosis returns null (no prepended action; gate decides)", () => {
    expect(
      chooseFirstAction({ diagnosisType: C.UNKNOWN, committed: false, evidence: [ev("financial_health", "healthy ample reserves", false)] })
    ).toBeNull();
  });

  it("preserves R4: a retention case with no survival/legal/danger keeps the cohort-driver analysis", () => {
    const r = chooseFirstAction({
      diagnosisType: C.CUSTOMER_RETENTION_EROSION,
      committed: true,
      evidence: [ev("customer_retention", "Churn rose to nine percent", true, { churnPct: 9 })],
    });
    expect(r?.tier).toBe("BASE_R4");
    expect(r?.plan.title.toLowerCase()).toContain("driver");
  });

  it("preserves R4: a bottleneck case with no survival/legal/danger keeps the time-study", () => {
    const r = chooseFirstAction({
      diagnosisType: C.OPERATIONAL_BOTTLENECK,
      committed: true,
      evidence: [ev("operational_efficiency", "Turnaround slipped; backlog grows", true, { turnaroundDays: 12 })],
    });
    expect(r?.tier).toBe("BASE_R4");
    expect(r?.plan.title.toLowerCase()).toContain("time study");
  });

  it("does NOT override a valid cash diagnosis under short runway (cash template kept → null)", () => {
    const r = chooseFirstAction({
      diagnosisType: C.CASH_LIQUIDITY_CRISIS,
      committed: true,
      evidence: [ev("financial_health", "Cash runway is three months", true, { cashRunwayMonths: 3 })],
    });
    expect(r).toBeNull();
  });

  it("never returns a growth/scaling action and never converts abstention to proceed", () => {
    const cases: Array<Parameters<typeof chooseFirstAction>[0]> = [
      { diagnosisType: C.CUSTOMER_RETENTION_EROSION, committed: true, evidence: [ev("financial_health", "runway", true, { cashRunwayMonths: 2 })] },
      { diagnosisType: C.UNIT_ECONOMICS_FAILURE, committed: true, evidence: [ev("financial_health", "deep across-the-board discount", true, { contribution: -5 })] },
    ];
    for (const c of cases) {
      const r = chooseFirstAction(c) as PrioritizedFirstAction;
      expect(r.plan.class).not.toBe(InterventionClass.GROWTH_ENABLEMENT);
      expect(["MINIMAL", "LOW"]).toContain(r.plan.estimatedCostBand);
    }
    // not committed → never an action
    expect(chooseFirstAction({ diagnosisType: C.CASH_LIQUIDITY_CRISIS, committed: false, evidence: [] })).toBeNull();
  });
});

describe("R3 end-to-end through runConsultingEngine", () => {
  function evi(dim: EvidenceItem["dimension"], finding: string, isCritical: boolean, supportingData?: Record<string, string | number | boolean>): EvidenceItem {
    return { id: uuid(), dimension: dim, finding, confidence: ConfidenceLevel.HIGH, source: "test", timestamp: new Date(0), isCritical, supportingData };
  }
  function input(evidence: EvidenceItem[]): ConsultingEngineInput {
    return { engagementId: uuid(), businessProblem: "owner wants retention fixed", evidence, clientContext: { industry: "subscription", size: "small", revenueImpactUrgency: "CRITICAL" } };
  }

  it("cash survival dominates a co-matched retention signal under a 3-month runway (PC-01)", async () => {
    const out = await runConsultingEngine(
      input([
        evi("financial_health", "Cash runway is three months and obligations are fixed in the near term", true, { cashRunwayMonths: 3 }),
        evi("customer_retention", "Churn is rising at eight percent with weak onboarding driving it", true, { churnPct: 8 }),
        evi("customer_retention", "Repeat rate is slipping among recent cohorts", true, { repeatRatePct: 40 }),
      ])
    );
    const first = out.decisionMemo.recommendedInterventions[0].intervention;
    // PC-01 survival-dominance: under a critically short runway with cash co-matched,
    // cash_liquidity_crisis wins PRIMARY over the optimization (retention) diagnosis, and
    // the first action is cash stabilization. (Previously the diagnosis stayed retention
    // and R3 only re-prioritized the action; survival dominance now resolves it at the
    // diagnosis layer — the cash-first outcome is preserved.)
    expect(out.decisionMemo.rootCauseDiagnosis.type).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
    expect(first.title.toLowerCase()).toContain("cash flow forecast");
  });
});
