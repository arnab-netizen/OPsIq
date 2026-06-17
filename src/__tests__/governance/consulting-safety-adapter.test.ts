import { describe, it, expect } from "vitest";
import {
  deriveSafetyGateInputs,
  assessConsultingOutput,
  hasCommittedDiagnosis,
  DIAGNOSIS_CONFIDENCE_SCORE,
} from "@/services/governance/consulting-safety-adapter";
import {
  DiagnosisConfidence,
  DiagnosisType,
  type ConsultingEngineOutput,
} from "@/domain/consulting-engine/types";

/**
 * Wiring proof for STAGE_A_SAFETY_VALIDATION_BLOCKER remediation step 1:
 * the consulting engine output is now routed through the abstention engine.
 */

type EngineOut = Pick<ConsultingEngineOutput, "status" | "decisionMemo">;

function makeOutput(opts: {
  status: ConsultingEngineOutput["status"];
  confidence: DiagnosisConfidence;
  type?: DiagnosisType;
  evidenceIds?: string[];
}): EngineOut {
  return {
    status: opts.status,
    // Only the fields the adapter reads are required; cast keeps the fixture small.
    decisionMemo: {
      id: "11111111-1111-1111-1111-111111111111",
      diagnosisConfidence: opts.confidence,
      rootCauseDiagnosis: {
        type: opts.type ?? DiagnosisType.UNKNOWN,
        evidenceIds: opts.evidenceIds ?? [],
      },
    } as unknown as ConsultingEngineOutput["decisionMemo"],
  };
}

describe("consulting-safety-adapter (abstention wiring)", () => {
  it("maps every diagnosis confidence level to a deterministic scalar in [0,1]", () => {
    for (const v of Object.values(DiagnosisConfidence)) {
      const s = DIAGNOSIS_CONFIDENCE_SCORE[v];
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
    expect(DIAGNOSIS_CONFIDENCE_SCORE[DiagnosisConfidence.INSUFFICIENT_EVIDENCE]).toBeLessThan(0.3);
    expect(DIAGNOSIS_CONFIDENCE_SCORE[DiagnosisConfidence.HIGH]).toBeGreaterThanOrEqual(0.6);
  });

  it("derives gate inputs from engine output fields (deterministic)", () => {
    const out = makeOutput({
      status: "SUCCESS",
      confidence: DiagnosisConfidence.HIGH,
      type: DiagnosisType.QUALITY_CONTROL_FAILURE,
      evidenceIds: ["a"],
    });
    const inputs = deriveSafetyGateInputs(out);
    expect(inputs.confidence_score).toBe(0.8);
    expect(inputs.has_evidence).toBe(true);
    expect(inputs.preconditions_met).toBe(true);
    // conservative, gate-relaxing defaults
    expect(inputs.evidence_contradictions).toBe(0);
    expect(inputs.irreversibility_score).toBe(0);
    expect(inputs.active_conflicts).toBe(0);
  });

  it("ABSTAINS on an INSUFFICIENT_EVIDENCE output and materializes a decision", () => {
    const out = makeOutput({
      status: "INSUFFICIENT_EVIDENCE",
      confidence: DiagnosisConfidence.INSUFFICIENT_EVIDENCE,
      type: DiagnosisType.UNKNOWN,
      evidenceIds: ["a"],
    });
    const r = assessConsultingOutput(out, out.decisionMemo.id);
    expect(r.assessment.abstain).toBe(true);
    expect(r.assessment.abstention_state).toBe("MISSING_PRECONDITIONS");
    const conds = r.assessment.unsafe_conditions.map((c) => c.condition_type);
    expect(conds).toContain("LOW_CONFIDENCE");
    expect(conds).toContain("PRECONDITION_UNMET");
    expect(r.escalation_required).toBe(true);
    expect(r.decision).not.toBeNull();
    expect(r.decision?.immutable).toBe(true);
    expect(r.decision?.actor).toBe("abstention-engine");
  });

  it("PROCEEDS on a confident SUCCESS output and emits no abstention decision", () => {
    const out = makeOutput({
      status: "SUCCESS",
      confidence: DiagnosisConfidence.HIGH,
      type: DiagnosisType.CUSTOMER_RETENTION_EROSION,
      evidenceIds: ["a", "b"],
    });
    const r = assessConsultingOutput(out, out.decisionMemo.id);
    expect(r.assessment.abstain).toBe(false);
    expect(r.decision).toBeNull();
    expect(hasCommittedDiagnosis(out)).toBe(true);
  });

  it("treats a missing/unknown diagnosis as not committed", () => {
    const out = makeOutput({
      status: "INSUFFICIENT_EVIDENCE",
      confidence: DiagnosisConfidence.INSUFFICIENT_EVIDENCE,
      type: DiagnosisType.UNKNOWN,
    });
    expect(hasCommittedDiagnosis(out)).toBe(false);
  });
});
