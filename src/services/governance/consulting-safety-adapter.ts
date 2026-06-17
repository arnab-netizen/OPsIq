import type {
  ConsultingEngineOutput,
  DecisionMemo,
} from "@/domain/consulting-engine/types";
import { DiagnosisConfidence, DiagnosisType } from "@/domain/consulting-engine/types";
import {
  assessSafety,
  createAbstentionDecision,
  requiresEscalation,
  type SafetyAssessment,
  type EvidenceSupportSignal,
} from "./abstention-engine";
import { runCausalChallenge, type CausalEvidence } from "./causal-challenge";
import type { AbstentionDecision } from "@/domain/governance/abstention-contracts";

/**
 * Consulting → Abstention safety adapter.
 *
 * Remediation step 1 for STAGE_A_SAFETY_VALIDATION_BLOCKER (component B1):
 * deterministically derive the eight `assessSafety` scalar inputs from a
 * frozen consulting-engine output, so the abstention/safety gate actually
 * executes on every benchmark case instead of being dead code.
 *
 * This adapter changes NO scoring threshold, NO answer key, and NO benchmark
 * expected outcome. It only maps engine output → safety-gate inputs and runs
 * the existing gate.
 *
 * Mapping provenance (each input traced to a real engine-output field, with
 * conservative defaults documented where the engine exposes no signal):
 *  - confidence_score        ← diagnosisConfidence (enum → 0..1, table below)
 *  - has_evidence            ← rootCauseDiagnosis.evidenceIds.length > 0
 *  - evidence_contradictions ← 0 (engine exposes no contradiction counter)
 *  - scope_valid             ← true (consulting engine never leaves its scope)
 *  - preconditions_met       ← status !== "INSUFFICIENT_EVIDENCE"
 *  - irreversibility_score   ← 0 (engine output carries no irreversibility metric)
 *  - operator_capacity_avail ← true (not modeled in the benchmark case input)
 *  - active_conflicts        ← 0 (engine emits a single ranked memo, no rival set)
 *
 * The two conservative defaults that could only ever RELAX the gate
 * (irreversibility_score = 0, active_conflicts = 0) are deliberately chosen so
 * the gate cannot be made to look stricter than the engine evidence warrants.
 */

/** Deterministic confidence enum → scalar map used by the safety gate. */
export const DIAGNOSIS_CONFIDENCE_SCORE: Record<DiagnosisConfidence, number> = {
  [DiagnosisConfidence.DEFINITIVE]: 0.95,
  [DiagnosisConfidence.HIGH]: 0.8,
  [DiagnosisConfidence.MODERATE]: 0.55,
  [DiagnosisConfidence.PROVISIONAL]: 0.35,
  [DiagnosisConfidence.INSUFFICIENT_EVIDENCE]: 0.1,
};

export interface SafetyGateInputs {
  confidence_score: number;
  has_evidence: boolean;
  evidence_contradictions: number;
  scope_valid: boolean;
  preconditions_met: boolean;
  irreversibility_score: number;
  operator_capacity_available: boolean;
  active_conflicts: number;
  /** Evidence-support sufficiency signal (Option B). */
  evidence_support: EvidenceSupportSignal;
}

/** Options carrying production-available signals not present in the memo itself. */
export interface SafetyDerivationOptions {
  /** Total evidence items available to the engine for this case, if known. */
  totalEvidenceCount?: number;
  /**
   * The case evidence (dimension/finding/supportingData/isCritical) for the
   * RC-7 causal-challenge verifier. When omitted, the causal challenge is inert.
   */
  evidence?: CausalEvidence[];
}

export interface ConsultingSafetyResult {
  inputs: SafetyGateInputs;
  assessment: SafetyAssessment;
  escalation_required: boolean;
  decision: AbstentionDecision | null;
  causal_challenge: {
    committed: boolean;
    challenged: boolean;
    outOfModelCauseInProblem: boolean;
    adverseOffArchetypeEvidence: boolean;
    reasons: string[];
  };
}

/**
 * Derive the safety-gate scalar inputs from a frozen engine output.
 * Pure and deterministic.
 */
export function deriveSafetyGateInputs(
  output: Pick<ConsultingEngineOutput, "status" | "decisionMemo">,
  opts: SafetyDerivationOptions = {}
): SafetyGateInputs {
  const memo: DecisionMemo = output.decisionMemo;
  const confidence_score =
    DIAGNOSIS_CONFIDENCE_SCORE[memo.diagnosisConfidence] ?? 0.1;
  const usedEvidence = memo.rootCauseDiagnosis.evidenceIds?.length ?? 0;
  const has_evidence = usedEvidence > 0;
  const preconditions_met = output.status !== "INSUFFICIENT_EVIDENCE";

  // Evidence-support sufficiency (Option B): stop the prior field loss.
  // committed := the engine actually issued a diagnosis (not INSUFFICIENT_EVIDENCE).
  const committed = output.status !== "INSUFFICIENT_EVIDENCE";
  const total = opts.totalEvidenceCount;
  const supportRatio =
    total !== undefined && total > 0 ? usedEvidence / total : undefined;
  const hasMissingEvidence =
    (memo.rootCauseDiagnosis.missingEvidenceFor?.length ?? 0) > 0;

  const evidence_support: EvidenceSupportSignal = {
    committed,
    supportRatio,
    hasMissingEvidence,
  };

  return {
    confidence_score,
    has_evidence,
    evidence_contradictions: 0,
    scope_valid: true,
    preconditions_met,
    irreversibility_score: 0,
    operator_capacity_available: true,
    active_conflicts: 0,
    evidence_support,
  };
}

/**
 * Run the abstention/safety gate against a frozen engine output and, when the
 * gate abstains, materialize an immutable AbstentionDecision.
 */
export function assessConsultingOutput(
  output: Pick<ConsultingEngineOutput, "status" | "decisionMemo">,
  recommendationId: string,
  actor = "abstention-engine",
  opts: SafetyDerivationOptions = {}
): ConsultingSafetyResult {
  const inputs = deriveSafetyGateInputs(output, opts);

  // RC-7 Option A: causal challenge (inert unless evidence is supplied).
  const committed = output.status !== "INSUFFICIENT_EVIDENCE";
  const causal = runCausalChallenge({
    committed,
    businessProblem: output.decisionMemo.businessProblem ?? "",
    diagnosisType: output.decisionMemo.rootCauseDiagnosis.type,
    evidence: opts.evidence ?? [],
  });

  const assessment = assessSafety(
    inputs.confidence_score,
    inputs.has_evidence,
    inputs.evidence_contradictions,
    inputs.scope_valid,
    inputs.preconditions_met,
    inputs.irreversibility_score,
    inputs.operator_capacity_available,
    inputs.active_conflicts,
    inputs.evidence_support,
    {
      committed: causal.committed,
      challenged: causal.challenged,
      reasons: causal.reasons,
      abstention_hint: causal.abstention_hint,
    }
  );

  const escalation_required = requiresEscalation(assessment);

  let decision: AbstentionDecision | null = null;
  if (assessment.abstain && assessment.abstention_state) {
    const blocking_factors = assessment.unsafe_conditions
      .filter((c) => c.blocking)
      .map((c) => c.condition_type);
    decision = createAbstentionDecision(
      recommendationId,
      assessment.abstention_state,
      blocking_factors.length > 0 ? blocking_factors : ["UNSPECIFIED_BLOCKING_CONDITION"],
      inputs.confidence_score,
      escalation_required,
      actor
    );
  }

  return {
    inputs,
    assessment,
    escalation_required,
    decision,
    causal_challenge: {
      committed: causal.committed,
      challenged: causal.challenged,
      outOfModelCauseInProblem: causal.outOfModelCauseInProblem,
      adverseOffArchetypeEvidence: causal.adverseOffArchetypeEvidence,
      reasons: causal.reasons,
    },
  };
}

/** Convenience: did the engine produce a committed, non-unknown diagnosis? */
export function hasCommittedDiagnosis(
  output: Pick<ConsultingEngineOutput, "status" | "decisionMemo">
): boolean {
  return (
    output.status !== "INSUFFICIENT_EVIDENCE" &&
    output.decisionMemo.rootCauseDiagnosis.type !== DiagnosisType.UNKNOWN
  );
}
