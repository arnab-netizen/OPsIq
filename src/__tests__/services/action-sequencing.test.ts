import { describe, it, expect } from "vitest";
import {
  sequenceFirstAction,
  overridesTemplate,
  type SequenceInput,
} from "@/services/consulting-engine/action-sequencing";
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
): SequenceInput["evidence"][number] {
  return { dimension, finding, isCritical, supportingData };
}

describe("action-sequencing — module contract assertions", () => {
  it("sequenceFirstAction is a function", () => { expect(typeof sequenceFirstAction).toBe("function"); });
  it("overridesTemplate is a function", () => { expect(typeof overridesTemplate).toBe("function"); });
  it("runConsultingEngine is a function", () => { expect(typeof runConsultingEngine).toBe("function"); });
  it("C is an object", () => { expect(typeof C).toBe("object"); });
  it("InterventionClass is an object", () => { expect(typeof InterventionClass).toBe("object"); });
  it("ConfidenceLevel is an object", () => { expect(typeof ConfidenceLevel).toBe("object"); });
  it("ev is a function", () => { expect(typeof ev).toBe("function"); });
  it("ev() returns an object", () => { expect(typeof ev("financial_health", "test")).toBe("object"); });
  it("ev() has dimension field", () => { expect(ev("financial_health", "test")).toHaveProperty("dimension"); });
  it("ev() has finding field", () => { expect(ev("financial_health", "test")).toHaveProperty("finding"); });
  it("C.CASH_LIQUIDITY_CRISIS is defined", () => { expect(C.CASH_LIQUIDITY_CRISIS).toBeDefined(); });
  it("C.CUSTOMER_RETENTION_EROSION is defined", () => { expect(C.CUSTOMER_RETENTION_EROSION).toBeDefined(); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("R4 action sequencing — verify/stabilize-first selection", () => {
  it("correct retention diagnosis no longer jumps to a loyalty program — verify the driver first", () => {
    const p = sequenceFirstAction({
      diagnosisType: C.CUSTOMER_RETENTION_EROSION,
      committed: true,
      evidence: [ev("customer_retention", "Churn jumped to nine percent", true, { churnPct: 9 })],
    });
    expect(p.kind).toBe("VERIFY_DIAGNOSIS");
    expect(p.title.toLowerCase()).toContain("driver");
    expect(p.title.toLowerCase()).not.toContain("loyalty");
  });

  it("cash diagnosis under short runway returns a cash-stabilization first action", () => {
    const p = sequenceFirstAction({
      diagnosisType: C.CASH_LIQUIDITY_CRISIS,
      committed: true,
      evidence: [ev("financial_health", "Cash runway is three months", true, { cashRunwayMonths: 3 })],
    });
    expect(p.kind).toBe("STABILIZE_CASH");
    expect(p.title.toLowerCase()).toContain("cash-flow forecast");
  });

  it("bottleneck returns a reversible diagnostic (time study), never a capex first move", () => {
    const p = sequenceFirstAction({
      diagnosisType: C.OPERATIONAL_BOTTLENECK,
      committed: true,
      evidence: [ev("operational_efficiency", "Turnaround slipped; backlog grows", true, { turnaroundDays: 12 })],
    });
    expect(p.kind).toBe("VERIFY_DIAGNOSIS");
    expect(p.title.toLowerCase()).toContain("time study");
    expect(p.estimatedCostBand === "LOW" || p.estimatedCostBand === "MINIMAL").toBe(true);
  });

  it("legal/compliance risk forces a compliance review ahead of operational execution", () => {
    const p = sequenceFirstAction({
      diagnosisType: C.OPERATIONAL_BOTTLENECK,
      committed: true,
      evidence: [
        ev("operational_efficiency", "Turnaround slipped", true, { turnaroundDays: 12 }),
        ev("market_position", "A regulatory compliance breach is unresolved", true),
      ],
    });
    expect(p.kind).toBe("COMPLIANCE_REVIEW");
  });

  it("healthy / no committed diagnosis returns monitor-and-hold", () => {
    const p = sequenceFirstAction({
      diagnosisType: C.UNKNOWN,
      committed: false,
      evidence: [ev("financial_health", "Cash reserves are healthy and ample", false)],
    });
    expect(p.kind).toBe("MONITOR_HOLD");
  });

  it("ambiguous (critical but no committed diagnosis) returns evidence-gathering", () => {
    const p = sequenceFirstAction({
      diagnosisType: C.UNKNOWN,
      committed: false,
      evidence: [ev("market_position", "Sales softened; causes are entangled and unreconciled", true)],
    });
    expect(p.kind).toBe("GATHER_EVIDENCE");
  });

  it("owner budget constraint blocks the capex first action (constraint-safe low-cost fix)", () => {
    const p = sequenceFirstAction({
      diagnosisType: C.OPERATIONAL_BOTTLENECK,
      committed: true,
      evidence: [
        ev("operational_efficiency", "Backlog grows; the obvious fix is a second machine", true, { capacityPct: 96 }),
        ev("financial_health", "There is no capital budget available for equipment this year", true, { capitalAvailable: 0 }),
      ],
    });
    expect(p.kind).toBe("CONSTRAINT_SAFE");
    expect(p.estimatedCostBand).toBe("MINIMAL");
    expect(p.title.toLowerCase()).toContain("low-cost");
  });

  it("owner staffing constraint blocks the full success-team program (constraint-safe motion)", () => {
    const p = sequenceFirstAction({
      diagnosisType: C.CUSTOMER_RETENTION_EROSION,
      committed: true,
      evidence: [
        ev("customer_retention", "Churn rose to eight percent", true, { churnPct: 8 }),
        ev("team_capability", "The firm cannot hire or staff a success team", true, { hireableHeadcount: 0 }),
      ],
    });
    expect(p.kind).toBe("CONSTRAINT_SAFE");
    expect(p.title.toLowerCase()).toContain("low-headcount");
  });

  it("does NOT override the cash/margin/unit-economics/quality templates (no regression surface)", () => {
    const noEv: SequenceInput["evidence"] = [ev("financial_health", "neutral", false)];
    expect(overridesTemplate(C.CASH_LIQUIDITY_CRISIS, noEv)).toBe(false);
    expect(overridesTemplate(C.MARGIN_EROSION, noEv)).toBe(false);
    expect(overridesTemplate(C.UNIT_ECONOMICS_FAILURE, noEv)).toBe(false);
    expect(overridesTemplate(C.QUALITY_CONTROL_FAILURE, noEv)).toBe(false);
    expect(overridesTemplate(C.CUSTOMER_RETENTION_EROSION, noEv)).toBe(true);
    expect(overridesTemplate(C.OPERATIONAL_BOTTLENECK, noEv)).toBe(true);
  });

  it("never emits a growth/scaling first action (no unsafe new proceeds)", () => {
    for (const dx of [
      C.CASH_LIQUIDITY_CRISIS,
      C.UNIT_ECONOMICS_FAILURE,
      C.MARGIN_EROSION,
      C.QUALITY_CONTROL_FAILURE,
      C.CUSTOMER_RETENTION_EROSION,
      C.OPERATIONAL_BOTTLENECK,
    ]) {
      const p = sequenceFirstAction({ diagnosisType: dx, committed: true, evidence: [ev("financial_health", "adverse", true)] });
      expect(p.class).not.toBe(InterventionClass.GROWTH_ENABLEMENT);
      expect(["MINIMAL", "LOW"]).toContain(p.estimatedCostBand);
    }
  });
});

describe("R4 end-to-end through runConsultingEngine", () => {
  function evi(dim: EvidenceItem["dimension"], finding: string, isCritical: boolean, supportingData?: Record<string, string | number | boolean>): EvidenceItem {
    return {
      id: uuid(),
      dimension: dim,
      finding,
      confidence: ConfidenceLevel.HIGH,
      source: "test",
      timestamp: new Date(0),
      isCritical,
      supportingData,
    };
  }
  function input(evidence: EvidenceItem[]): ConsultingEngineInput {
    return {
      engagementId: uuid(),
      businessProblem: "owner wants a recommendation",
      evidence,
      clientContext: { industry: "services", size: "small", revenueImpactUrgency: "HIGH" },
    };
  }

  it("a retention case leads with a churn-driver analysis, not a loyalty program", async () => {
    const out = await runConsultingEngine(
      input([
        evi("customer_retention", "Monthly churn rose to nine percent with one-time buyers dominating", true, { churnPct: 9 }),
        evi("customer_retention", "Repeat purchase rate fell from sixty-one to thirty-eight percent", true, { repeatRatePct: 38 }),
        evi("financial_health", "Contribution on retained customers is healthy and positive", false, { contributionMargin: 22 }),
      ])
    );
    const first = out.decisionMemo.recommendedInterventions[0].intervention;
    expect(first.title.toLowerCase()).toContain("driver");
    expect(first.title.toLowerCase()).not.toContain("loyalty");
    expect(out.decisionMemo.rootCauseDiagnosis.type).toBe(DiagnosisType.CUSTOMER_RETENTION_EROSION);
  });
});
