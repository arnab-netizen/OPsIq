/**
 * Jarvis 360 Slice 13 — self-evaluation service (DI).
 *
 * On recommendation/action completion or verification, classifies the outcome and
 * persists a self-evaluation; failed outcomes set reassessmentRequired + a recheck
 * date so the loop continues. Reuses the pure classifier. Audited.
 */

import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { classifyOutcome, type OutcomeSignals, type EvaluationVerdict, type FailureReason } from "@/domain/owner-mode/self-evaluation";
import { recordDoNotRepeat, type RecordDoNotRepeatInput } from "@/services/owner-mode/do-not-repeat.service";
import { consultingScopeKey } from "@/domain/owner-mode/do-not-repeat-scope";
import { deriveTrainingFromObservedFailure, type DeriveTrainingInput, type RuntimeFailureSignal } from "@/services/owner-mode/staff-training.service";
import { triggerProcessReviewOnRepeatedFailure } from "@/services/owner-mode/process-review.service";

interface SelfEvalDb {
  ownerSelfEvaluation: { create(args: { data: Record<string, unknown> }): Promise<{ id: string }> };
}
export interface SelfEvalDeps {
  db: SelfEvalDb;
  now?: () => Date;
  /** Injectable for tests; defaults to the real do-not-repeat recorder. */
  recordCaution?: (input: RecordDoNotRepeatInput) => Promise<string>;
  /** Injectable for tests; defaults to the real training/process triggers. */
  deriveTraining?: (input: DeriveTrainingInput) => Promise<string | null>;
  triggerProcessReview?: (id: string, input: { workspaceId: string; failureCount: number; actorId?: string }) => Promise<unknown>;
}

/** A failure attributed to execution/proof maps to an observed training signal. */
const FAILURE_TO_TRAINING_SIGNAL: Partial<Record<FailureReason, RuntimeFailureSignal>> = {
  insufficient_proof: "proof_failure",
  poor_execution: "rework",
};
async function resolveDefaultDeps(): Promise<SelfEvalDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as SelfEvalDb };
}

export interface RecordSelfEvaluationInput {
  workspaceId: string;
  recommendationId?: string | null;
  actionId?: string | null;
  expectedOutcome: string;
  actualOutcome?: string | null;
  signals: OutcomeSignals;
  ownerWorkloadImpact?: string | null;
  /** Days until the failed recommendation is reassessed (default 14). */
  reassessmentDays?: number;
  actorId?: string;
  /**
   * Closes the self-eval loop (G16): when set and the outcome FAILED, OpsIQ records a
   * do-not-repeat caution keyed here (the finding code or "scope:<area>"), so the next
   * matching recommendation is blocked (bad recommendation) or cautioned (other cause).
   */
  businessId?: string | null;
  memoryKey?: string | null;
  /**
   * Owner domain (M1): a FAILED outcome with a domain auto-writes a scope:<domain>
   * do-not-repeat memory, so the owner-action gate blocks repeating that decision class.
   */
  domain?: string | null;
  /**
   * Live training/process triggers (EH-07/EH-08): when a FAILED outcome is attributed to
   * execution/proof and these are supplied, OpsIQ auto-derives an evidence-backed training
   * need and (when a process is given) escalates to a process review on repeated failure.
   */
  staffRef?: string | null;
  processAffected?: string | null;
  expectedMetric?: string | null;
  processId?: string | null;
  /** Prior consecutive failures for this process (the new failure is added to it). */
  priorFailureCount?: number;
}

export interface RecordSelfEvaluationResult extends EvaluationVerdict {
  id: string;
  /** True when a do-not-repeat/caution memory was created from a failed outcome. */
  cautionRecorded: boolean;
  cautionBlocks: boolean;
  /** True when an evidence-backed training need was auto-derived. */
  trainingTriggered: boolean;
  /** True when repeated failure escalated to a process review. */
  processReviewTriggered: boolean;
}

/** Classify + persist a self-evaluation; failed → reassessment scheduled + caution memory. */
export async function recordSelfEvaluation(input: RecordSelfEvaluationInput, injected?: SelfEvalDeps): Promise<RecordSelfEvaluationResult> {
  const verdict = classifyOutcome(input.signals);
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  const nextReassessmentAt = verdict.reassessmentRequired
    ? new Date(now.getTime() + (input.reassessmentDays ?? 14) * 24 * 60 * 60 * 1000)
    : null;
  const created = await deps.db.ownerSelfEvaluation.create({
    data: {
      workspaceId: input.workspaceId,
      recommendationId: input.recommendationId ?? null,
      actionId: input.actionId ?? null,
      expectedOutcome: input.expectedOutcome,
      actualOutcome: input.actualOutcome ?? null,
      result: verdict.result,
      failureReason: verdict.failureReason,
      ownerWorkloadImpact: input.ownerWorkloadImpact ?? null,
      reassessmentRequired: verdict.reassessmentRequired,
      nextReassessmentAt,
    },
  });
  await emitAuditEvent({
    workspaceId: input.workspaceId,
    eventName: AUDIT_EVENTS.OWNER_SELF_EVALUATION_RECORDED,
    actorId: input.actorId ?? undefined,
    actorType: input.actorId ? "user" : "system",
    entityType: "owner_self_evaluation",
    entityId: created.id,
    payload: { result: verdict.result, failureReason: verdict.failureReason },
  });

  // Close the loop: a FAILED outcome feeds business memory. A failure attributed to the
  // recommendation itself hard-blocks repeats; other failure causes record a non-blocking
  // caution (the rec may be fine; execution/data/externalities were the problem).
  let cautionRecorded = false;
  let cautionBlocks = false;
  if (verdict.result === "failed" && input.memoryKey && input.businessId) {
    const blocks = verdict.failureReason === "bad_recommendation";
    const record = deps.recordCaution ?? recordDoNotRepeat;
    await record({
      workspaceId: input.workspaceId,
      businessId: input.businessId,
      memoryKey: input.memoryKey,
      summary: `Self-evaluation failed (${verdict.failureReason ?? "unknown"}).`,
      reason: `Outcome did not meet expectation: ${input.expectedOutcome}`,
      recommendationId: input.recommendationId ?? null,
      blocksRepetition: blocks,
      actorId: input.actorId ?? null,
    });
    cautionRecorded = true;
    cautionBlocks = blocks;
  }

  // M1 — a FAILED outcome with a domain writes a scope:<domain> do-not-repeat memory, giving
  // the owner-action gate's scope check a real writer (block = the rec itself was bad).
  if (verdict.result === "failed" && input.domain && input.businessId) {
    // The key exactly as recorded before (consultingScopeKey — Formal Consulting Mode's promotion check
    // matches it unchanged). Owner-mode readers resolve every spelling of an owner area through the one
    // scope taxonomy (ownerScopeLookupKeys: scope:cash and scope:cashflow are the same Cash flow area).
    const scopeKey = consultingScopeKey(input.domain);
    if (scopeKey) {
      const record = deps.recordCaution ?? recordDoNotRepeat;
      await record({
        workspaceId: input.workspaceId,
        businessId: input.businessId,
        memoryKey: scopeKey,
        summary: `Self-evaluation failed for ${input.domain} (${verdict.failureReason ?? "unknown"}).`,
        reason: `Outcome did not meet expectation: ${input.expectedOutcome}`,
        recommendationId: input.recommendationId ?? null,
        blocksRepetition: verdict.failureReason === "bad_recommendation",
        actorId: input.actorId ?? null,
      });
      cautionRecorded = true;
      if (verdict.failureReason === "bad_recommendation") cautionBlocks = true;
    }
  }

  // EH-07 — a FAILED outcome attributed to execution/proof auto-derives evidence-backed
  // training (linked to staff + process + metric + recheck). Only when the caller supplies
  // the staff/process context and an acting user (training mutations are user-audited).
  let trainingTriggered = false;
  const trainingSignal = verdict.failureReason ? FAILURE_TO_TRAINING_SIGNAL[verdict.failureReason] : undefined;
  if (verdict.result === "failed" && trainingSignal && input.staffRef && input.processAffected && input.actorId) {
    const derive = deps.deriveTraining ?? deriveTrainingFromObservedFailure;
    const recheck = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const id = await derive({
      workspaceId: input.workspaceId,
      staffRef: input.staffRef,
      signal: trainingSignal,
      occurrences: (input.priorFailureCount ?? 0) + 1,
      evidenceRef: input.recommendationId ?? input.actionId ?? undefined,
      processAffected: input.processAffected,
      metric: input.expectedMetric ?? input.expectedOutcome,
      expectedImprovement: `Resolve: ${input.expectedOutcome}`,
      recheckDate: recheck,
      actorId: input.actorId,
    });
    trainingTriggered = id != null;
  }

  // EH-08 — repeated failure on a process escalates to a process review (threshold inside
  // the process-review service); a single failure is noise and does not trigger.
  let processReviewTriggered = false;
  if (verdict.result === "failed" && input.processId) {
    const trigger = deps.triggerProcessReview ?? triggerProcessReviewOnRepeatedFailure;
    const decision = (await trigger(input.processId, {
      workspaceId: input.workspaceId,
      failureCount: (input.priorFailureCount ?? 0) + 1,
      actorId: input.actorId ?? undefined,
    })) as { due?: boolean };
    processReviewTriggered = decision?.due === true;
  }

  return { ...verdict, id: created.id, cautionRecorded, cautionBlocks, trainingTriggered, processReviewTriggered };
}
