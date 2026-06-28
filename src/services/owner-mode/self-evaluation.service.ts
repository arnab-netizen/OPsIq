/**
 * Jarvis 360 Slice 13 — self-evaluation service (DI).
 *
 * On recommendation/action completion or verification, classifies the outcome and
 * persists a self-evaluation; failed outcomes set reassessmentRequired + a recheck
 * date so the loop continues. Reuses the pure classifier. Audited.
 */

import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { classifyOutcome, type OutcomeSignals, type EvaluationVerdict } from "@/domain/owner-mode/self-evaluation";

interface SelfEvalDb {
  ownerSelfEvaluation: { create(args: { data: Record<string, unknown> }): Promise<{ id: string }> };
}
export interface SelfEvalDeps {
  db: SelfEvalDb;
  now?: () => Date;
}
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
}

export interface RecordSelfEvaluationResult extends EvaluationVerdict {
  id: string;
}

/** Classify + persist a self-evaluation; failed → reassessment scheduled. */
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
  return { ...verdict, id: created.id };
}
