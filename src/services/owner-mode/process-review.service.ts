/**
 * Jarvis 360 Slice 8 — process inventory + review service (DI).
 *
 * Registers processes (owner role + SOP + metric + cadence) and triggers a review
 * on schedule or on a failure signal, advancing the next review date. Reuses the
 * pure review rules. Material updates are flagged as owner-approval-required.
 */

import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  evaluateProcessReview,
  nextReviewDate,
  processUpdateRequiresOwnerApproval,
  type ProcessReviewSignals,
  type ProcessUpdateKind,
  type ReviewDecision,
} from "@/domain/owner-mode/process-review";

interface ProcessRow {
  id: string;
  workspaceId: string;
  reviewFrequencyDays: number;
  nextReviewAt: Date | null;
}

interface ProcessDb {
  ownerProcess: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    findFirst(args: { where: { id: string; workspaceId: string } }): Promise<ProcessRow | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface ProcessDeps {
  db: ProcessDb;
  now?: () => Date;
}

async function resolveDefaultDeps(): Promise<ProcessDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as ProcessDb };
}

export class ProcessNotFoundError extends Error {
  constructor(id: string) {
    super(`Process ${id} not found in workspace.`);
    this.name = "ProcessNotFoundError";
  }
}

export interface RegisterProcessInput {
  workspaceId: string;
  businessId?: string | null;
  name: string;
  processType: string;
  ownerRole: string;
  sopId?: string | null;
  metric: string;
  target?: string | null;
  reviewFrequencyDays?: number;
  actorId: string;
}

export async function registerProcess(input: RegisterProcessInput, injected?: ProcessDeps): Promise<string> {
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  const freq = input.reviewFrequencyDays ?? 30;
  const created = await deps.db.ownerProcess.create({
    data: {
      workspaceId: input.workspaceId,
      businessId: input.businessId ?? null,
      name: input.name,
      processType: input.processType,
      ownerRole: input.ownerRole,
      sopId: input.sopId ?? null,
      metric: input.metric,
      target: input.target ?? null,
      reviewFrequencyDays: freq,
      nextReviewAt: nextReviewDate(now, freq),
      status: "active",
      createdByUserId: input.actorId,
      updatedAt: now,
    },
  });
  return created.id;
}

/**
 * Evaluate whether a process needs review (schedule or failure signal). When due,
 * advance the next review date and emit an audit event. Returns the decision.
 */
export async function triggerProcessReviewIfDue(
  id: string,
  input: { workspaceId: string; signals: ProcessReviewSignals; actorId?: string },
  injected?: ProcessDeps
): Promise<ReviewDecision> {
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  const row = await deps.db.ownerProcess.findFirst({ where: { id, workspaceId: input.workspaceId } });
  if (!row) throw new ProcessNotFoundError(id);
  const decision = evaluateProcessReview({ nextReviewAt: row.nextReviewAt }, input.signals, now);
  if (decision.due) {
    await deps.db.ownerProcess.update({
      where: { id },
      data: { lastReviewAt: now, nextReviewAt: nextReviewDate(now, row.reviewFrequencyDays), updatedAt: now },
    });
    await emitAuditEvent({
      workspaceId: input.workspaceId,
      eventName: AUDIT_EVENTS.OWNER_PROCESS_REVIEW_TRIGGERED,
      actorId: input.actorId ?? undefined,
      actorType: input.actorId ? "user" : "system",
      entityType: "owner_process",
      entityId: id,
      payload: { triggers: decision.triggers },
    });
  }
  return decision;
}

/** Whether a proposed process update is material (owner approval required). */
export function updateNeedsOwnerApproval(kind: ProcessUpdateKind): boolean {
  return processUpdateRequiresOwnerApproval(kind);
}
