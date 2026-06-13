/**
 * Owner SOP & Execution Accountability (Module 7) — deterministic execution
 * calculation engine.
 *
 * Pure functions only (no DB/I/O/LLM). Ratio metrics return `null` when not
 * computable from the provided inputs; nothing is invented. Composite scores are
 * bounded 0..100. SOP/execution is the EXECUTION lens (follow-through, overdue
 * work, repeated failures, verification + proof discipline, SOP coverage),
 * distinct from survival/growth.
 */
import { clampScore } from "@/domain/owner-spine/contracts";
import type {
  SopSnapshotInput,
  SopDerivedMetrics,
  ExecutionState,
  SopTier,
} from "./types";
import { resolveSopThresholds, type SopThresholds } from "./thresholds";
import { calculateDataConfidence, isValidCurrency } from "./data-confidence";

// --- safe numeric helpers ----------------------------------------------------

/** Present finite number, else null (fail closed on NaN/Infinity/missing). */
export function num(x: number | undefined | null): number | null {
  if (x === undefined || x === null || !Number.isFinite(x)) return null;
  return x;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

// --- follow-through ----------------------------------------------------------

export function completionRatePct(input: SopSnapshotInput): number | null {
  const assigned = num(input.actionsAssigned);
  const completed = num(input.actionsCompleted);
  if (assigned === null || completed === null || assigned <= 0) return null;
  return clampScore(round1((completed / assigned) * 100));
}

export function verificationRatePct(input: SopSnapshotInput): number | null {
  const completed = num(input.actionsCompleted);
  const verified = num(input.actionsVerified);
  if (completed === null || verified === null || completed <= 0) return null;
  return clampScore(round1((verified / completed) * 100));
}

export function overdueRatePct(input: SopSnapshotInput): number | null {
  const assigned = num(input.actionsAssigned);
  const overdue = num(input.actionsOverdue);
  if (assigned === null || overdue === null || assigned <= 0) return null;
  return round1((overdue / assigned) * 100);
}

// --- accountability friction -------------------------------------------------

export function disputeRatePct(input: SopSnapshotInput): number | null {
  const completed = num(input.actionsCompleted);
  const disputed = num(input.actionsDisputed);
  if (completed === null || disputed === null || completed <= 0) return null;
  return round1((disputed / completed) * 100);
}

export function reassignmentRatePct(input: SopSnapshotInput): number | null {
  const assigned = num(input.actionsAssigned);
  const reassigned = num(input.actionsReassigned);
  if (assigned === null || reassigned === null || assigned <= 0) return null;
  return round1((reassigned / assigned) * 100);
}

export function repeatedFailureRatePct(input: SopSnapshotInput): number | null {
  const assigned = num(input.actionsAssigned);
  const repeated = num(input.repeatedFailures);
  if (assigned === null || repeated === null || assigned <= 0) return null;
  return round1((repeated / assigned) * 100);
}

// --- proof + SOP coverage ----------------------------------------------------

export function proofCompliancePct(input: SopSnapshotInput): number | null {
  const required = num(input.proofRequired);
  const provided = num(input.proofProvided);
  if (required === null || provided === null || required <= 0) return null;
  return clampScore(round1((provided / required) * 100));
}

export function sopCoveragePct(input: SopSnapshotInput): number | null {
  const recurring = num(input.recurringProcesses);
  const documented = num(input.documentedSops);
  if (recurring === null || documented === null || recurring <= 0) return null;
  return clampScore(round1((documented / recurring) * 100));
}

// --- risk signals ------------------------------------------------------------

interface SopRiskSignals {
  lowCompletion: boolean;
  criticalCompletion: boolean;
  lowVerification: boolean;
  criticalVerification: boolean;
  highOverdue: boolean;
  criticalOverdue: boolean;
  highDispute: boolean;
  highReassignment: boolean;
  highRepeatedFailure: boolean;
  criticalRepeatedFailure: boolean;
  lowProof: boolean;
  lowSop: boolean;
  criticalSop: boolean;
}

function deriveRiskSignals(input: SopSnapshotInput, t: SopThresholds): SopRiskSignals {
  const completion = completionRatePct(input);
  const verification = verificationRatePct(input);
  const overdue = overdueRatePct(input);
  const dispute = disputeRatePct(input);
  const reassignment = reassignmentRatePct(input);
  const repeated = repeatedFailureRatePct(input);
  const proof = proofCompliancePct(input);
  const sop = sopCoveragePct(input);
  return {
    lowCompletion: completion !== null && completion < t.lowCompletionRatePct,
    criticalCompletion: completion !== null && completion < t.criticalCompletionRatePct,
    lowVerification: verification !== null && verification < t.lowVerificationRatePct,
    criticalVerification: verification !== null && verification < t.criticalVerificationRatePct,
    highOverdue: overdue !== null && overdue > t.highOverdueRatePct,
    criticalOverdue: overdue !== null && overdue > t.criticalOverdueRatePct,
    highDispute: dispute !== null && dispute > t.highDisputeRatePct,
    highReassignment: reassignment !== null && reassignment > t.highReassignmentRatePct,
    highRepeatedFailure: repeated !== null && repeated > t.highRepeatedFailureRatePct,
    criticalRepeatedFailure: repeated !== null && repeated > t.criticalRepeatedFailureRatePct,
    lowProof: proof !== null && proof < t.lowProofCompliancePct,
    lowSop: sop !== null && sop < t.lowSopCoveragePct,
    criticalSop: sop !== null && sop < t.criticalSopCoveragePct,
  };
}

// --- composite scores --------------------------------------------------------

export function executionRiskScore(input: SopSnapshotInput, t: SopThresholds): number {
  const s = deriveRiskSignals(input, t);
  let score = 0;
  if (s.criticalCompletion) score += 22;
  else if (s.lowCompletion) score += 11;
  if (s.criticalVerification) score += 15;
  else if (s.lowVerification) score += 8;
  if (s.criticalOverdue) score += 18;
  else if (s.highOverdue) score += 9;
  if (s.criticalRepeatedFailure) score += 18;
  else if (s.highRepeatedFailure) score += 9;
  if (s.highDispute) score += 8;
  if (s.highReassignment) score += 8;
  if (s.lowProof) score += 8;
  if (s.criticalSop) score += 14;
  else if (s.lowSop) score += 7;
  return clampScore(score);
}

export function executionHealthScore(input: SopSnapshotInput, t: SopThresholds): number {
  const risk = executionRiskScore(input, t);
  const completion = completionRatePct(input);
  // Follow-through health maps the completion rate (0..100%) directly onto 0..100.
  let throughput = 50;
  if (completion !== null) throughput = clampScore(completion);
  return clampScore(Math.round(0.6 * (100 - risk) + 0.4 * throughput));
}

export function executionOpportunityScore(input: SopSnapshotInput, t: SopThresholds): number {
  let score = 0;
  const overdue = overdueRatePct(input);
  if (overdue !== null) score += Math.min(overdue, 25); // recoverable overdue follow-through
  const repeated = repeatedFailureRatePct(input);
  if (repeated !== null) score += Math.min(repeated * 2, 25); // eliminable repeated failures
  const sop = sopCoveragePct(input);
  if (sop !== null && sop < 100) score += Math.min((100 - sop) / 2, 20); // SOP gap to close
  const verification = verificationRatePct(input);
  if (verification !== null && verification < 100) score += Math.min((100 - verification) / 4, 15); // verification gap
  const proof = proofCompliancePct(input);
  if (proof !== null && proof < t.lowProofCompliancePct) score += Math.min((t.lowProofCompliancePct - proof) / 5, 10); // proof discipline gap
  return clampScore(score);
}

// --- execution state ---------------------------------------------------------

export function executionState(
  input: SopSnapshotInput,
  t: SopThresholds,
  dataConfidenceScore: number
): ExecutionState {
  const s = deriveRiskSignals(input, t);

  if (s.criticalCompletion && (s.criticalOverdue || s.criticalRepeatedFailure)) return "BREAKDOWN";
  if (s.criticalCompletion || s.criticalVerification || s.criticalOverdue || s.criticalRepeatedFailure || s.criticalSop) {
    return "UNRELIABLE";
  }
  // Not enough trustworthy data to assert disciplined execution → caution.
  if (dataConfidenceScore < 50) return "SLIPPING";
  if (
    s.lowCompletion ||
    s.lowVerification ||
    s.highOverdue ||
    s.highDispute ||
    s.highReassignment ||
    s.highRepeatedFailure ||
    s.lowProof ||
    s.lowSop
  ) {
    return "SLIPPING";
  }
  const completion = completionRatePct(input);
  return completion === null || completion >= t.healthyCompletionRatePct ? "DISCIPLINED" : "ON_TRACK";
}

export function executionTier(state: ExecutionState): SopTier {
  switch (state) {
    case "BREAKDOWN":
      return "rescue";
    case "UNRELIABLE":
      return "recovery";
    case "SLIPPING":
    case "ON_TRACK":
      return "growth";
    case "DISCIPLINED":
      return "optimization";
  }
}

// --- orchestrator ------------------------------------------------------------

/**
 * Compute the full deterministic execution metric set for one snapshot. Does not
 * mutate `input`. Missing/invalid inputs yield `null` metrics + a missing-input
 * list; composite scores stay 0..100 with confidence reflecting completeness.
 */
export function computeSopMetrics(
  input: SopSnapshotInput,
  opts: { now?: Date } = {}
): SopDerivedMetrics {
  const t = resolveSopThresholds(input.industryTemplate);
  const confidence = calculateDataConfidence(input, {
    now: opts.now,
    staleDays: t.staleSnapshotDays,
  });
  const state = executionState(input, t, confidence.dataConfidenceScore);

  return {
    currency: input.currency,
    currencyValid: isValidCurrency(input.currency),

    completionRatePct: completionRatePct(input),
    verificationRatePct: verificationRatePct(input),
    overdueRatePct: overdueRatePct(input),
    disputeRatePct: disputeRatePct(input),
    reassignmentRatePct: reassignmentRatePct(input),
    repeatedFailureRatePct: repeatedFailureRatePct(input),
    proofCompliancePct: proofCompliancePct(input),
    sopCoveragePct: sopCoveragePct(input),

    executionHealthScore: executionHealthScore(input, t),
    executionRiskScore: executionRiskScore(input, t),
    executionOpportunityScore: executionOpportunityScore(input, t),
    dataConfidenceScore: confidence.dataConfidenceScore,

    executionState: state,
    executionTier: executionTier(state),

    missingRequiredInputs: confidence.missingCritical,
  };
}
