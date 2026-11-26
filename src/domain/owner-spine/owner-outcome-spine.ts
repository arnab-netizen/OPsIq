/**
 * Canonical outcome spine — pure helpers (no I/O, no rules engine).
 *
 * The spine LINKS existing facts and stores versioned snapshots of `assessOwnerOutcome()` output. Nothing here
 * re-derives target attainment, resolution, attribution or learning: those are server-derived by the policy and
 * only persisted, never accepted from a client.
 */
import type { OwnerOutcomeAssessment, OwnerOutcomeInput, OutcomeDirection } from "./owner-outcome-policy";
import { sha256Hex, stableStringify, type OwnerDecisionState } from "./owner-decision-record";

export const OWNER_OUTCOME_POLICY_VERSION = "owner-outcome-policy-v1" as const;

export type OutcomeSourceSystem = "SYSTEM_A" | "SYSTEM_B" | "NONE";
export type CommitmentFidelity = "AS_RECOMMENDED" | "MODIFIED_BY_OWNER" | "NOT_COMMITTED" | "NO_DECISION";

/** The chain of a decision is its candidate (deterministic); an undecided legacy process task gets its own chain. */
export function chainKeyForCandidate(candidateId: string): string {
  return candidateId;
}
export function chainKeyForLegacyProcessTask(taskId: string): string {
  return `process_task:${taskId}`;
}

/**
 * A MODIFIED decision means the owner changed the actual action: the result followed X', not the recommendation X.
 * A REJECTED / DEFERRED decision means the owner did not commit to the recommendation at all, so nothing observed on the
 * chain may be read as following it. Carried on every assessment so an outcome is never presented as the exact execution
 * of what OpsIQ recommended unless the owner ACCEPTED it as recommended.
 */
export function commitmentFidelityFor(state: OwnerDecisionState | null): CommitmentFidelity {
  if (state === null) return "NO_DECISION";
  if (state === "ACCEPTED") return "AS_RECOMMENDED";
  if (state === "MODIFIED") return "MODIFIED_BY_OWNER";
  return "NOT_COMMITTED";
}

/**
 * Direction for a System B outcome, taken only from a persisted owner commitment that is explicitly linked to the task.
 * `unknown` when there is no commitment, the commitment recorded no direction, or the commitment names a different
 * metric than the task measures (then its direction does not apply to this measurement).
 */
export function directionFromCommitment(
  commitment: { targetDirection: string | null; verificationMetric: string | null } | null,
  taskTargetMetricName: string | null
): { direction: "up" | "down" | null; note: string | null } {
  if (!commitment) return { direction: null, note: null };
  if (commitment.targetDirection !== "up" && commitment.targetDirection !== "down") return { direction: null, note: null };
  if (commitment.verificationMetric && taskTargetMetricName && commitment.verificationMetric !== taskTargetMetricName) {
    return { direction: null, note: "The commitment's metric differs from the task's metric; its direction was not applied." };
  }
  return { direction: commitment.targetDirection, note: null };
}

export interface OutcomeLinks {
  ownerDecisionId: string | null;
  sourceSystem: OutcomeSourceSystem;
  systemAActionId: string | null;
  systemAVerificationId: string | null;
  processTaskId: string | null;
  processTaskKey: string | null;
  ownerActionOutcomeId: string | null;
  reassessmentEventId: string | null;
  learningCandidateRef: string | null;
  newerDiagnosisDomain: string | null;
  newerDiagnosisCycleId: string | null;
  newerDiagnosisEvidenceAsOf: Date | null;
}

/** The facts fed to the policy, as stored (everything except the caller's clock). */
export function serializeOutcomeInput(input: OwnerOutcomeInput): Record<string, unknown> {
  const { now: _now, ...facts } = input;
  void _now;
  return JSON.parse(stableStringify(facts)) as Record<string, unknown>;
}

/**
 * Identity of "what was concluded, from which links and facts". An identical re-assessment (same links, facts and
 * conclusions) is the same snapshot, so retries and racing writers cannot create a second version of it.
 */
export function assessmentFingerprint(p: { chainKey: string; links: OutcomeLinks; input: OwnerOutcomeInput; assessment: OwnerOutcomeAssessment }): string {
  const a = p.assessment;
  return sha256Hex(
    stableStringify({
      v: 1,
      chainKey: p.chainKey,
      links: p.links,
      input: serializeOutcomeInput(p.input),
      out: {
        executionStatus: a.executionStatus,
        observationStatus: a.observationStatus,
        measurementResult: a.measurementResult,
        targetAttainment: a.targetAttainment,
        issueResolution: a.issueResolution,
        causalAttribution: a.causalAttribution,
        learningEligibility: a.learningEligibility,
        verificationStatus: a.verificationStatus,
        evidenceQuality: a.evidenceQuality,
        learningBlockers: a.learningBlockers,
        nextVerificationAction: a.nextVerificationAction,
      },
    })
  );
}

export function directionOrUnknown(d: "up" | "down" | null | undefined): OutcomeDirection {
  return d === "up" || d === "down" ? d : "unknown";
}
