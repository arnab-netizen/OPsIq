/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy rows are untyped at the persistence boundary */
/**
 * Deep Action-System Linkage — persist budget plan advisory actions as owner
 * execution tasks, reusing the SHARED owner action lifecycle FSM
 * (`@/domain/founder-recovery/action-status`), the hash-chained audit ledger, and
 * the budget learning recorder. No parallel action engine is created.
 *
 * Idempotent: each generated action has a stable sourceKey; repeated reassessment
 * upserts/links the existing OPEN task instead of duplicating it. Completed/cancelled
 * tasks are never reopened. All reads/writes are workspace-scoped.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import {
  canTransition,
  isValidRecoveryStatus,
  requiresCompletionEvidence,
  type RecoveryActionStatus,
} from "@/domain/founder-recovery/action-status";
import { mapPlanActionToRow, OPEN_BUDGET_ACTION_STATUSES, classifyBudgetOutcome } from "@/domain/owner-budget";
import type { UpdatedOwnerPlan } from "@/domain/owner-budget";

export interface SyncBudgetActionsInput {
  plan: UpdatedOwnerPlan;
  reassessmentId?: string | null;
  planSnapshotId?: string | null;
  periodId?: string | null;
  actorId: string;
}

export interface SyncBudgetActionsResult {
  created: number;
  linked: number;
  skipped: number;
}

/**
 * Persist/link the plan's generated actions as owner execution tasks. Upsert by
 * (workspaceId, businessId, sourceKey): create if new, refresh if an OPEN task
 * already exists, skip if it is already completed/cancelled.
 */
export async function syncBudgetActions(
  businessId: string,
  workspaceId: string,
  input: SyncBudgetActionsInput
): Promise<SyncBudgetActionsResult> {
  const actions = input.plan.generatedActions ?? [];
  let created = 0, linked = 0, skipped = 0;
  const auditQueue: Array<{ eventName: (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS]; entityId: string; payload: Record<string, unknown> }> = [];

  await db.$transaction(async (tx: any) => {
    for (const a of actions) {
      const m = mapPlanActionToRow(a);
      const dueAt = new Date(Date.now() + m.reviewInDays * 86400000);
      const existing = await tx.ownerBudgetAction.findFirst({
        where: { workspaceId, businessId, sourceKey: m.sourceKey },
      });

      if (existing) {
        if (!OPEN_BUDGET_ACTION_STATUSES.has(existing.status)) {
          skipped++;
          continue;
        }
        // Refresh the live recommendation fields; preserve status/assignment/idempotency.
        await tx.ownerBudgetAction.update({
          where: { id: existing.id },
          data: {
            decisionType: m.decisionType,
            accountableRole: m.accountableRole,
            requiredProof: m.requiredProof,
            expectedFinancialImpact: m.expectedFinancialImpact,
            verificationMethod: m.verificationMethod,
            escalationPath: m.escalationPath,
            killRule: m.killRule,
            reviewInDays: m.reviewInDays,
            dueAt,
            reassessmentId: input.reassessmentId ?? existing.reassessmentId,
            planSnapshotId: input.planSnapshotId ?? existing.planSnapshotId,
            periodId: input.periodId ?? existing.periodId,
            updatedAt: new Date(),
          },
        });
        linked++;
        auditQueue.push({ eventName: AUDIT_EVENTS.OWNER_BUDGET_ACTION_LINKED, entityId: existing.id, payload: { businessId, sourceKey: m.sourceKey } });
      } else {
        const id = randomUUID();
        await tx.ownerBudgetAction.create({
          data: {
            id, workspaceId, businessId,
            periodId: input.periodId ?? null,
            reassessmentId: input.reassessmentId ?? null,
            planSnapshotId: input.planSnapshotId ?? null,
            sourceKey: m.sourceKey,
            title: m.title,
            decisionType: m.decisionType,
            accountableRole: m.accountableRole,
            dueAt,
            reviewInDays: m.reviewInDays,
            requiredProof: m.requiredProof,
            expectedFinancialImpact: m.expectedFinancialImpact,
            verificationMethod: m.verificationMethod,
            escalationPath: m.escalationPath,
            killRule: m.killRule,
            status: "proposed",
            createdBy: input.actorId,
            updatedAt: new Date(),
          },
        });
        created++;
        auditQueue.push({ eventName: AUDIT_EVENTS.OWNER_BUDGET_ACTION_CREATED, entityId: id, payload: { businessId, sourceKey: m.sourceKey, decisionType: m.decisionType } });
      }
    }
  });

  for (const ev of auditQueue) {
    await emitAuditEvent({ eventName: ev.eventName, actorId: input.actorId, workspaceId, entityType: "OwnerBudgetAction", entityId: ev.entityId, payload: ev.payload });
  }

  return { created, linked, skipped };
}

export interface UpdateBudgetActionInput {
  status?: string;
  assignedTo?: string | null;
  completionNotes?: string | null;
  completionEvidence?: string[] | null;
  /** Outcome-learning inputs (recorded on completion). */
  expectedImpact?: number | null;
  actualImpact?: number | null;
  externalFactor?: boolean | null;
  ownerOverridden?: boolean | null;
}

/**
 * Update a persisted budget action through the shared owner FSM (workspace-scoped).
 * Completion requires evidence and feeds the budget learning/outcome recorder.
 */
export async function updateBudgetAction(
  actionId: string,
  input: UpdateBudgetActionInput,
  actorId: string,
  workspaceId: string
) {
  const action = await db.ownerBudgetAction.findFirst({ where: { id: actionId, workspaceId } });
  if (!action) throw new NotFoundError("OwnerBudgetAction", actionId);

  const data: Record<string, unknown> = {};
  const now = new Date();
  let completedNow = false;

  if (input.status !== undefined) {
    if (!isValidRecoveryStatus(input.status)) throw new ValidationError(`Invalid budget action status: ${input.status}`);
    const from = action.status as RecoveryActionStatus;
    const to = input.status as RecoveryActionStatus;
    if (!canTransition(from, to)) throw new ValidationError(`Invalid budget action transition: ${from} → ${to}`);
    if (requiresCompletionEvidence(to)) {
      const notes = input.completionNotes ?? action.completionNotes;
      const evidence = input.completionEvidence ?? (Array.isArray(action.completionEvidence) ? action.completionEvidence : null);
      if (!notes || !evidence || evidence.length === 0) {
        throw new ValidationError("Completing a budget action requires completionNotes and completionEvidence.");
      }
      data.completedAt = now;
      completedNow = true;
    }
    data.status = to;
  }
  if (input.assignedTo !== undefined) data.assignedTo = input.assignedTo;
  if (input.completionNotes !== undefined) data.completionNotes = input.completionNotes;
  if (input.completionEvidence !== undefined) data.completionEvidence = input.completionEvidence;

  let updated = await db.ownerBudgetAction.update({ where: { id: actionId }, data });

  // Feed the budget OUTCOME LEARNING LOOP on completion: compare expected vs actual,
  // classify outcome + cause + disposition + confidence impact (pure), persist a
  // FundedInitiativeOutcome (same store), stamp the action, and audit. A recommendation
  // that has failed before is escalated/blocked, not blindly repeated.
  if (completedNow) {
    const label = `budget-action:${action.title}`;
    const priorFailures = await db.fundedInitiativeOutcome.count({
      where: { workspaceId, businessId: action.businessId, initiativeLabel: label, outcome: "FAILED" },
    });
    const expectedImpact = typeof input.expectedImpact === "number" ? input.expectedImpact : null;
    const actualImpact = typeof input.actualImpact === "number" ? input.actualImpact : null;
    const learning = classifyBudgetOutcome({
      outcomeVerified: actualImpact !== null,
      expectedImpact,
      actualImpact,
      overridden: input.ownerOverridden === true,
      externalFactor: input.externalFactor === true,
      priorFailures,
    });
    await db.fundedInitiativeOutcome.create({
      data: {
        id: randomUUID(), workspaceId, businessId: action.businessId,
        initiativeLabel: label,
        outcome: learning.outcome, nextStep: learning.nextStep,
        safeForLearning: learning.safeForLearning,
        expectedImpact, actualImpact,
        note: JSON.stringify({ disposition: learning.disposition, confidenceImpact: learning.confidenceImpact, priorFailures, reason: learning.reason, completionNotes: input.completionNotes ?? null }),
        createdBy: actorId, updatedAt: new Date(),
      },
    });
    updated = await db.ownerBudgetAction.update({ where: { id: actionId }, data: { outcomeClass: learning.outcome } });
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OWNER_BUDGET_INITIATIVE_CLOSED,
      actorId, workspaceId, entityType: "OwnerBudgetAction", entityId: actionId,
      payload: { businessId: action.businessId, outcome: learning.outcome, disposition: learning.disposition, confidenceImpact: learning.confidenceImpact },
    });
  }

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUDGET_ACTION_UPDATED,
    actorId, workspaceId, entityType: "OwnerBudgetAction", entityId: actionId,
    payload: { businessId: action.businessId, status: data.status ?? action.status },
  });

  return updated;
}

export async function listBudgetActions(workspaceId: string, businessId: string) {
  await getBusiness(businessId, workspaceId);
  return db.ownerBudgetAction.findMany({ where: { workspaceId, businessId }, orderBy: { createdAt: "desc" } });
}
