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
import { toAuditActor } from "@/domain/owner-budget/system-actor";
import { NotFoundError, ValidationError } from "@/infra/errors";
import {
  canTransition,
  isValidRecoveryStatus,
  requiresCompletionEvidence,
  type RecoveryActionStatus,
} from "@/domain/founder-recovery/action-status";
import { mapPlanActionToRow, OPEN_BUDGET_ACTION_STATUSES, classifyBudgetOutcome, budgetActionIntent } from "@/domain/owner-budget";
import type { UpdatedOwnerPlan } from "@/domain/owner-budget";
import { enforceOwnerActionGates, type OwnerGateAssessment } from "@/services/owner-mode/owner-action-gate.service";
import { applyGuardedActionTransition, classifyActionRequest } from "@/services/owner-mode/owner-action-transition";

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
    await emitAuditEvent({ eventName: ev.eventName, ...toAuditActor(input.actorId), workspaceId, entityType: "OwnerBudgetAction", entityId: ev.entityId, payload: ev.payload });
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

  // The request's own fields — the action's, and the outcome inputs recorded beside it on completion. An
  // exact replay of what is recorded is a no-op; a completed or cancelled action's record (its outcome
  // included) is never rewritten (owner-action-transition.ts).
  const label = `budget-action:${action.title}`;
  const request = {
    status: input.status, assignedTo: input.assignedTo, completionNotes: input.completionNotes, completionEvidence: input.completionEvidence,
    expectedImpact: input.expectedImpact, actualImpact: input.actualImpact, externalFactor: input.externalFactor, ownerOverridden: input.ownerOverridden,
  };
  const recordedState = async (client: { fundedInitiativeOutcome: { findMany(a: unknown): Promise<Array<{ expectedImpact: number | null; actualImpact: number | null; note: string | null }>> } }, row: Record<string, unknown>) => {
    const outcomes = await client.fundedInitiativeOutcome.findMany({
      where: { workspaceId, businessId: action.businessId, initiativeLabel: label },
      select: { expectedImpact: true, actualImpact: true, note: true },
    });
    const mine = outcomes.map((o) => ({ o, n: parseOutcomeNote(o.note) })).find((x) => x.n?.actionId === actionId) ?? null;
    return {
      ...row,
      expectedImpact: mine?.o.expectedImpact ?? null,
      actualImpact: mine?.o.actualImpact ?? null,
      externalFactor: mine ? mine.n?.externalFactor ?? null : null,
      ownerOverridden: mine ? mine.n?.ownerOverridden ?? null : null,
    };
  };
  if (classifyActionRequest((await recordedState(db, action)) as typeof action & Record<string, unknown>, request) === "replay") return action;

  const data: Record<string, unknown> = {};
  const now = new Date();
  let completedNow = false;
  let gateAssessment: OwnerGateAssessment | null = null;

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

    // GAP-BUDGET-01 — a budget action is a material owner-domain (finance/spend) decision.
    // It MUST pass the centralized owner-action safety gate before a material transition
    // (in_progress/completed): cash safety, cashflow, compliance/professional-review and
    // do-not-repeat. Without this a budget action could be completed while the Jarvis gate
    // would 409-block the same transition on the owner-finance service. Registered in
    // material-gate-registry.ts so dropping this call fails CI.
    // Its intent comes from its business purpose, then its plan decision type (budgetActionIntent):
    // repricing a loss-making contract, protecting cash (freeze, defer, reduce) and collecting evidence are
    // never held back by the danger they respond to.
    gateAssessment = await enforceOwnerActionGates({
      workspaceId,
      businessId: action.businessId,
      actionId,
      domain: "finance",
      toStatus: to,
      intent: budgetActionIntent({ decisionType: action.decisionType, title: action.title }),
    });
    data.status = to;
  }
  if (input.assignedTo !== undefined) data.assignedTo = input.assignedTo;
  if (input.completionNotes !== undefined) data.completionNotes = input.completionNotes;
  if (input.completionEvidence !== undefined) data.completionEvidence = input.completionEvidence;

  // Compare-and-set on the status the transition was validated against, atomically with its audit events,
  // the accepted gate assessment and — on completion — the outcome record and its INITIATIVE_CLOSED audit: a
  // double-submitted completion never records a second outcome (which would skew priorFailures), a partial
  // failure never leaves a completed action without its outcome, and a lost race with different outcome
  // inputs is a conflict, never reported as applied.
  const guarded = await applyGuardedActionTransition<typeof action>({
    model: "ownerBudgetAction", entity: "OwnerBudgetAction", actionId, workspaceId, expectedStatus: action.status, data, request,
    gateAssessment,
    audits: (row) => [{
      eventName: AUDIT_EVENTS.OWNER_BUDGET_ACTION_UPDATED,
      actorId, workspaceId, entityType: "OwnerBudgetAction", entityId: actionId,
      payload: { businessId: action.businessId, status: row.status, previousStatus: action.status, changedFields: Object.keys(data) },
    }],
    compareRow: (tx, row) => recordedState(tx as never, row as unknown as Record<string, unknown>),
    // Feed the budget OUTCOME LEARNING LOOP on completion: compare expected vs actual, classify outcome +
    // cause + disposition + confidence impact (pure), persist a FundedInitiativeOutcome (same store), stamp
    // the action, and audit. A recommendation that has failed before is escalated/blocked, not blindly repeated.
    inTransaction: completedNow
      ? async (tx) => {
          const priorFailures = await tx.fundedInitiativeOutcome.count({
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
          await tx.fundedInitiativeOutcome.create({
            data: {
              id: randomUUID(), workspaceId, businessId: action.businessId,
              initiativeLabel: label,
              outcome: learning.outcome, nextStep: learning.nextStep,
              safeForLearning: learning.safeForLearning,
              expectedImpact, actualImpact,
              note: JSON.stringify({
                actionId, disposition: learning.disposition, confidenceImpact: learning.confidenceImpact, priorFailures, reason: learning.reason,
                completionNotes: input.completionNotes ?? null, externalFactor: input.externalFactor ?? null, ownerOverridden: input.ownerOverridden ?? null,
              }),
              createdBy: actorId, updatedAt: new Date(),
            },
          });
          const stamped = await tx.ownerBudgetAction.update({ where: { id: actionId }, data: { outcomeClass: learning.outcome } });
          await emitAuditEvent({
            eventName: AUDIT_EVENTS.OWNER_BUDGET_INITIATIVE_CLOSED,
            actorId, workspaceId, entityType: "OwnerBudgetAction", entityId: actionId,
            payload: { businessId: action.businessId, outcome: learning.outcome, disposition: learning.disposition, confidenceImpact: learning.confidenceImpact },
          }, tx);
          return stamped as typeof action;
        }
      : undefined,
  });
  const updated = guarded.row;
  return updated;
}

/** The fields of a budget outcome record's note this service reads back (null when unparseable). */
function parseOutcomeNote(note: string | null): { actionId?: string; externalFactor?: boolean | null; ownerOverridden?: boolean | null } | null {
  if (!note) return null;
  try {
    const v = JSON.parse(note) as Record<string, unknown>;
    return {
      actionId: typeof v.actionId === "string" ? v.actionId : undefined,
      externalFactor: typeof v.externalFactor === "boolean" ? v.externalFactor : null,
      ownerOverridden: typeof v.ownerOverridden === "boolean" ? v.ownerOverridden : null,
    };
  } catch {
    return null;
  }
}

export async function listBudgetActions(workspaceId: string, businessId: string) {
  await getBusiness(businessId, workspaceId);
  return db.ownerBudgetAction.findMany({ where: { workspaceId, businessId }, orderBy: { createdAt: "desc" } });
}
