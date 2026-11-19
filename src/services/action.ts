import { db } from "@/lib/db";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError, ConflictError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { triggerReEvaluation, ReEvaluationInProgressError } from "@/services/re-evaluation";
import { blockerReEvaluationEvent, enqueueActionBlockerReEvaluation } from "@/services/action-reevaluation-scheduling";
import { ACTION_STATUSES, type ActionStatus } from "@/domain/constants/statuses";
import { assertEngagementAccess } from "@/lib/visibility";
import { withIdempotency } from "@/infra/idempotency";
import { enforceActionRules, UNSATISFIABLE_ACTION_RULE_IDS } from "@/services/action-lifecycle";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import { requireServiceContext } from "@/lib/service-auth";
import { withCapabilityQuota, type CapabilityReservation, type CapabilityUsageMode } from "@/services/entitlement.service";
import { EventEmitterService } from "@/services/event-emitter";
import { randomUUID } from "crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { PrioritizedIntervention } from "@/domain/consulting-engine/types";
import { readActionBlockerReason, blockerReasonPatch, type ActionMetadataPatch } from "@/domain/execution/action-metadata";
import { compareAndSetAction, type ActionColumnChanges } from "@/services/action-store";

export interface CreateActionInput {
  engagementId: string;
  recommendationId: string;
  title: string;
  description?: string;
  assignedTo?: string;
  dueDate?: string;
  priority?: string;
}

export interface UpdateActionInput {
  title?: string;
  description?: string;
  dueDate?: string;
  priority?: string;
  status?: string;
  assignedTo?: string;
  completedAt?: string;
  verifiedAt?: string;
  blockageReason?: string;
  blockerReason?: string;
  notes?: string;
  version: number;
}

// State machine: allowed transitions per status
const ACTION_TRANSITIONS: Partial<Record<ActionStatus, readonly ActionStatus[]>> = {
  draft: ["assigned", "cancelled"],
  assigned: ["in_progress", "blocked", "cancelled"],
  in_progress: ["blocked", "completed", "assigned"],
  blocked: ["assigned", "cancelled"],
  completed: [],
  verified: [],
  cancelled: [],
  overdue: ["assigned", "blocked", "cancelled"],
};

function validateActionStatus(status: unknown): asserts status is ActionStatus {
  if (!ACTION_STATUSES.includes(status as ActionStatus)) {
    throw new ValidationError(
      `Invalid action status: ${status}. Must be one of: ${ACTION_STATUSES.join(", ")}`
    );
  }
}

export function validateActionTransition(fromStatus: ActionStatus, toStatus: ActionStatus): void {
  const allowed = ACTION_TRANSITIONS[fromStatus];
  if (!allowed || !allowed.includes(toStatus)) {
    throw new ValidationError(
      `Invalid action transition: ${fromStatus} → ${toStatus}. Allowed from ${fromStatus}: ${allowed?.join(", ") || "none"}`
    );
  }
}

export async function createAction(
  input: CreateActionInput,
  authContext: CanonicalAuthContext,
  workspaceId: string,
  idempotencyKey?: string,
  quotaMode: CapabilityUsageMode = { enforce: false }
) {
  // Plan quota: action_create usage is reserved atomically before the write and kept only by settling it
  // inside the action insert's transaction; a failed write or an idempotent replay settles nothing, so the
  // unit is returned. The action_create LIMIT (PlanLimitError 402) applies only when the caller enforces
  // it: POST /api/actions, the one path that was plan-gated before usage was recorded here. The execute
  // workflow and the consulting pipeline were never gated, so by default usage is recorded, never refused.
  // Auth and workspace context are verified first, before any database access.
  requireServiceContext(authContext, workspaceId);
  const outcome = await withCapabilityQuota(
    workspaceId,
    "action_create",
    (reservation) => persistAction(input, authContext, workspaceId, reservation, idempotencyKey),
    { enforce: quotaMode.enforce ?? false }
  );
  return outcome.action;
}

async function persistAction(
  input: CreateActionInput,
  authContext: CanonicalAuthContext,
  workspaceId: string,
  reservation: CapabilityReservation,
  idempotencyKey?: string
) {
  const [actorId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId, workspaceId: validatedWorkspaceId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  if (idempotencyKey) {
    const result = await withIdempotency(
      idempotencyKey,
      "action.create",
      async () => {
        return await db.$transaction(async (tx: Prisma.TransactionClient) => {
          const action = await tx.action.create({
            data: {
              id: randomUUID(),
              engagementId: input.engagementId,
              recommendationId: input.recommendationId,
              title: input.title,
              description: input.description || null,
              assignedTo: input.assignedTo || null,
              dueAt: input.dueDate ? new Date(input.dueDate) : null,
              status: "draft",
              updatedAt: new Date(),
            },
          });

          // Emit event sourcing event (non-blocking)
          try {
            await EventEmitterService.emit({
              aggregateId: action.id,
              aggregateType: "action",
              eventType: "action.created",
              eventVersion: 1,
              payload: {
                title: action.title,
                engagementId: input.engagementId,
              },
              actorId,
              workspaceId: validatedWorkspaceId,
            });
          } catch (error) {
            const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
            logger.error("Action event emission failed", {
              actionId: action.id,
              error: governed.operatorMessage,
            });
          }

          await emitAuditEvent({
            eventName: AUDIT_EVENTS.ACTION_CREATED,
            actorId,
            entityType: "action",
            entityId: action.id,
            workspaceId: validatedWorkspaceId,
            payload: {
              engagementId: input.engagementId,
              priority: input.priority,
            },
            visibility: "internal",
          }, tx);

          // Keep the reserved action_create unit atomically with the insert (last statement).
          await reservation.settle(tx);
          return action;
        }, { timeout: 30000 });
      },
      input,
      actorId
    );

    if (!result.isNew) {
      logger.info("Action creation - idempotency replay", {
        actionId: result.result.id,
        engagementId: input.engagementId,
      });
    } else {
      // Trigger re-evaluation only on first creation if critical
      if (input.priority === "critical") {
        await triggerReEvaluation({
          changeType: "unresolved_critical_blocker",
          entityType: "action",
          entityId: result.result.id,
          engagementId: input.engagementId,
          workspaceId: validatedWorkspaceId,
          severity: "critical",
          description: `Critical action created: ${input.title}`,
          triggeredBy: actorId,
        });
      }

      logger.info("Action created", {
        actionId: result.result.id,
        engagementId: input.engagementId,
      });
    }

    return { action: result.result, isNew: result.isNew };
  }

  // The insert and the kept action_create unit commit together.
  const action = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.action.create({
      data: {
        id: randomUUID(),
        engagementId: input.engagementId,
        recommendationId: input.recommendationId,
        title: input.title,
        description: input.description || null,
        assignedTo: input.assignedTo || null,
        dueAt: input.dueDate ? new Date(input.dueDate) : null,
        status: "draft",
        updatedAt: new Date(),
      },
    });
    await reservation.settle(tx);
    return created;
  });

  // Emit event sourcing event (non-blocking)
  try {
    await EventEmitterService.emit({
      aggregateId: action.id,
      aggregateType: "action",
      eventType: "action.created",
      eventVersion: 1,
      payload: {
        title: action.title,
        engagementId: input.engagementId,
      },
      actorId,
      workspaceId: validatedWorkspaceId,
    });
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    logger.error("Action event emission failed", {
      actionId: action.id,
      error: governed.operatorMessage,
    });
  }

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ACTION_CREATED,
    actorId,
    entityType: "action",
    entityId: action.id,
    workspaceId: validatedWorkspaceId,
    payload: {
      engagementId: input.engagementId,
      priority: input.priority,
    },
    visibility: "internal",
  });

  // Trigger re-evaluation due to new action if critical
  if (input.priority === "critical") {
    await triggerReEvaluation({
      changeType: "unresolved_critical_blocker",
      entityType: "action",
      entityId: action.id,
      engagementId: input.engagementId,
      workspaceId: validatedWorkspaceId,
      severity: "critical",
      description: `Critical action created: ${input.title}`,
      triggeredBy: actorId,
    });
  }

  logger.info("Action created", {
    actionId: action.id,
    engagementId: input.engagementId,
  });

  return { action, isNew: true };
}

export async function getActionsForEngagement(engagementId: string, userId: string, workspaceId: string) {
  enforceWorkspaceId(workspaceId, "getActionsForEngagement", "action");

  // Check engagement access
  await assertEngagementAccess(userId, engagementId, workspaceId);

  return db.action.findMany({
    where: { engagementId, engagement: { workspaceId } },
    orderBy: [{ dueAt: "asc" }],
  });
}

/**
 * Shared status-change rules for every Action writer that changes status (updateActionStatus,
 * updateAction): status vocabulary + transition map, the lifecycle enforcement rules (a blocked
 * action must carry a reason), and the blocker-reason metadata patch (kept while blocked,
 * cleared on leaving blocked). Pure — performs no write.
 */
async function prepareActionStatusChange(
  action: { status: string; metadata: unknown } & Record<string, unknown>,
  requested: { status?: string; blockerReason?: string | null },
  options?: { skipRuleIds?: readonly string[] }
): Promise<{ previousStatus: ActionStatus; newStatus: ActionStatus; blockerReason: string | null; metadataPatch: ActionMetadataPatch }> {
  const previousStatus = action.status as ActionStatus;
  const newStatus = (requested.status ?? action.status) as ActionStatus;
  validateActionStatus(newStatus);
  if (newStatus !== previousStatus) {
    validateActionTransition(previousStatus, newStatus);
  }
  const blockerReason =
    requested.blockerReason ?? (newStatus === previousStatus ? readActionBlockerReason(action.metadata) : null);
  const violations = await enforceActionRules({ ...action, status: newStatus, blockerReason }, options);
  if (violations.length > 0) {
    throw new ValidationError(`Action enforcement rules violated:\n${violations.join("\n")}`);
  }
  return { previousStatus, newStatus, blockerReason, metadataPatch: blockerReasonPatch(newStatus, blockerReason) };
}

/**
 * A newly blocked action is an unresolved blocker: route it into governed re-evaluation. Runs AFTER
 * the write committed, so a re-evaluation of the same engagement already in progress must not fail
 * the request (the row is written; the client must get its new version). That running evaluation
 * may already have read the pre-block state, so the event is deferred through the scheduler
 * instead of being dropped (services/action-reevaluation-scheduling.ts).
 */
async function reEvaluateIfNewlyBlocked(args: {
  actionId: string;
  engagementId: string;
  workspaceId: string;
  actorId: string;
  title: string;
  previousStatus: string;
  newStatus: string;
  committedVersion: number;
}): Promise<void> {
  if (args.newStatus !== "blocked" || args.previousStatus === "blocked") return;
  try {
    await triggerReEvaluation(blockerReEvaluationEvent(args));
  } catch (error) {
    if (!(error instanceof ReEvaluationInProgressError)) throw error;
    await enqueueActionBlockerReEvaluation({
      actionId: args.actionId,
      workspaceId: args.workspaceId,
      actorId: args.actorId,
      version: args.committedVersion,
    });
  }
}

export async function updateActionStatus(
  actionId: string,
  input: UpdateActionInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
) {
  const [actorId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  // Scope the pre-read to the caller's workspace (owned via the engagement) so the version and
  // transition checks below never run against — and never describe — another workspace's row.
  const action = await db.action.findFirst({
    where: { id: actionId, engagement: { workspaceId: validatedWorkspaceId } },
  });
  if (!action) throw new NotFoundError("Action", actionId);

  // Validate version for optimistic locking
  if (action.version !== input.version) {
    throw new ConflictError(
      "Action has been modified by another process. Current version: " + action.version,
      { code: "STALE_VERSION" }
    );
  }

  const { previousStatus, newStatus, metadataPatch } = await prepareActionStatusChange(action, {
    status: input.status,
    blockerReason: input.blockerReason ?? input.blockageReason,
  });

  // One statement: status + blocker-reason metadata key + version, conditional on the version.
  const updated = await compareAndSetAction(db, {
    actionId,
    workspaceId: validatedWorkspaceId,
    expectedVersion: input.version,
    columns: { status: newStatus },
    metadata: metadataPatch,
  });
  if (!updated) {
    throw new ConflictError(
      "Action has been modified by another process",
      { code: "OPTIMISTIC_LOCK_FAILED" }
    );
  }

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ACTION_UPDATED,
    actorId,
    entityType: "action",
    entityId: actionId,
    workspaceId: validatedWorkspaceId,
    payload: {
      previousStatus,
      newStatus,
      blockerReason: readActionBlockerReason(updated.metadata),
    },
    visibility: "internal",
  });

  await reEvaluateIfNewlyBlocked({
    actionId,
    engagementId: action.engagementId,
    workspaceId: validatedWorkspaceId,
    actorId,
    title: action.title,
    previousStatus,
    newStatus,
    committedVersion: updated.version,
  });

  logger.info("Action status updated", {
    actionId,
    previousStatus,
    newStatus,
    updatedBy: actorId,
  });

  return { ...updated, blockerReason: readActionBlockerReason(updated.metadata) };
}

export async function detectOverdueActions(engagementId: string, authContext: CanonicalAuthContext, workspaceId: string) {
  const actorId = authContext.session?.user?.id;
  enforceWorkspaceId(workspaceId, "detectOverdueActions", "action");

  const now = new Date();

  const overdueActions = await db.action.findMany({
    where: {
      engagementId,
      engagement: { workspaceId },
      dueAt: { lt: now },
      status: { notIn: ["completed", "verified", "cancelled"] },
    },
  });

  const results = [];

  for (const action of overdueActions) {
    // Emit overdue event. The Action model has no `priority` column, so an action's priority cannot be raised
    // here (the earlier `db.action.update({ data: { priority } })` referenced a phantom field and threw at
    // runtime). Priority lives on the linked Recommendation; auto-escalating that shared record because one of
    // its actions is overdue is a product decision (see the Wave 6 decision memo), not a mechanical fix. This
    // function performs honest overdue detection + the ACTION_OVERDUE audit event.
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ACTION_OVERDUE,
      actorId,
      entityType: "action",
      entityId: action.id,
      workspaceId,
      payload: {
        engagementId,
        dueAt: action.dueAt,
        currentStatus: action.status,
      },
      visibility: "internal",
    });

    results.push({
      actionId: action.id,
      overdue: true,
    });
  }

  if (overdueActions.length > 0) {
    logger.warn("Overdue actions detected", {
      engagementId,
      count: overdueActions.length,
      actions: results,
    });
  }

  return results;
}

export async function getActionById(actionId: string, workspaceId: string) {
  enforceWorkspaceId(workspaceId, "getActionById", "action");

  // Action has no workspaceId column; scope via the engagement relation so a caller in one workspace
  // cannot read another workspace's action (the previous findUnique-by-id ignored workspaceId entirely).
  const action = await db.action.findFirst({
    where: { id: actionId, engagement: { workspaceId } },
  });
  if (!action) throw new NotFoundError("Action", actionId);
  return action;
}

export async function updateAction(
  actionId: string,
  input: UpdateActionInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
) {
  const [actorId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  // Scope the pre-read to the caller's workspace (Action has no workspaceId column; it is owned via
  // its engagement). The version and transition checks below must never run against a foreign row,
  // or their distinct errors disclose that row's existence, version and status.
  const action = await db.action.findFirst({
    where: { id: actionId, engagement: { workspaceId: validatedWorkspaceId } },
  });
  if (!action) throw new NotFoundError("Action", actionId);

  if (action.version !== input.version) {
    throw new ConflictError("Action was modified. Please refresh and try again.");
  }

  // A status change (or a new blocker reason) goes through the same rules as updateActionStatus.
  const statusChange =
    input.status !== undefined || input.blockerReason !== undefined
      ? await prepareActionStatusChange(
          action,
          { status: input.status, blockerReason: input.blockerReason },
          // The Action Center path never enforced the evidence rule, which reads a non-existent
          // column and would make every completion fail; keep completion working here. The
          // blocked-needs-reason rule, status vocabulary and transition map still apply.
          { skipRuleIds: UNSATISFIABLE_ACTION_RULE_IDS }
        )
      : null;

  // The exact column values this call writes (also what it audits).
  const applied: ActionColumnChanges = {};
  if (statusChange && statusChange.newStatus !== statusChange.previousStatus) applied.status = statusChange.newStatus;
  if (input.title !== undefined) applied.title = input.title;
  if (input.description !== undefined) applied.description = input.description;
  if (input.dueDate !== undefined) applied.dueAt = input.dueDate ? new Date(input.dueDate) : null;
  if (input.assignedTo !== undefined) applied.assignedTo = input.assignedTo;
  if (input.completedAt !== undefined) applied.completedAt = input.completedAt ? new Date(input.completedAt) : null;
  if (input.verifiedAt !== undefined) applied.verifiedAt = input.verifiedAt ? new Date(input.verifiedAt) : null;

  // One statement: columns + blocker-reason metadata key + version, conditional on the version the
  // checks above ran against; RETURNING is exactly the row this call committed.
  const updated = await compareAndSetAction(db, {
    actionId,
    workspaceId: validatedWorkspaceId,
    expectedVersion: input.version,
    columns: applied,
    metadata: statusChange?.metadataPatch,
  });
  if (!updated) {
    throw new ConflictError("Action has been modified by another process", { code: "OPTIMISTIC_LOCK_FAILED" });
  }

  // Every meaningful edit is audited, with each changed field's previous and new value.
  const previous = action as unknown as Record<string, unknown>;
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [field, to] of Object.entries(applied)) {
    const from = previous[field] ?? null;
    const same = from instanceof Date && to instanceof Date ? from.getTime() === to.getTime() : from === to;
    if (!same) changes[field] = { from, to };
  }
  const previousReason = readActionBlockerReason(action.metadata);
  const nextReason = readActionBlockerReason(updated.metadata);
  if (previousReason !== nextReason) changes.blockerReason = { from: previousReason, to: nextReason };
  if (Object.keys(changes).length > 0) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ACTION_UPDATED,
      actorId,
      entityType: "action",
      entityId: actionId,
      workspaceId: validatedWorkspaceId,
      payload: {
        ...(changes.status ? { fromStatus: action.status, toStatus: updated.status } : {}),
        changes,
        previousVersion: action.version,
        version: updated.version,
      },
      visibility: "internal",
    });
  }

  if (statusChange) {
    await reEvaluateIfNewlyBlocked({
      actionId,
      engagementId: action.engagementId,
      workspaceId: validatedWorkspaceId,
      actorId,
      title: updated.title,
      previousStatus: statusChange.previousStatus,
      newStatus: statusChange.newStatus,
      committedVersion: updated.version,
    });
  }

  return updated;
}

export interface ListActionsParams {
  engagementId?: string;
  status?: string;
  assignedTo?: string;
  limit?: number;
  offset?: number;
}

export async function listActions(workspaceId: string, params: ListActionsParams) {
  enforceWorkspaceId(workspaceId, "listActions", "action");

  const where: Prisma.ActionWhereInput = {};
  if (params.engagementId) {
    where.engagementId = params.engagementId;
    where.engagement = { workspaceId };
  } else {
    // If no engagementId, action model has no way to filter by workspaceId directly
    // This requires the caller to provide engagementId for workspace scoping
    throw new ValidationError("engagementId is required to list actions");
  }
  if (params.status) where.status = params.status;
  if (params.assignedTo) where.assignedTo = params.assignedTo;

  const total = await db.action.count({ where });
  const actions = await db.action.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: params.limit || 50,
    skip: params.offset || 0,
  });

  return {
    items: actions,
    pagination: {
      limit: params.limit || 50,
      offset: params.offset || 0,
      total,
      hasMore: (params.offset || 0) + (params.limit || 50) < total,
    },
  };
}

export async function createActionsFromInterventions(
  engagementId: string,
  interventions: PrioritizedIntervention[],
  authContext: CanonicalAuthContext,
  workspaceId: string
) {
  enforceWorkspaceId(workspaceId, "createActionsFromInterventions", "action");
  const actorId = authContext.session?.user?.id;

  if (!interventions || interventions.length === 0) {
    return [];
  }

  const actions = [];

  // Find or create a placeholder recommendation for consulting engine results
  const existingRec = await db.recommendation.findFirst({
    where: { engagementId, workspaceId, title: { contains: "Consulting Engine" } },
  });

  let recommendationId: string;
  if (existingRec) {
    recommendationId = existingRec.id;
  } else {
    // Create a synthetic recommendation to hold consulting engine actions
    const synthRec = await db.recommendation.create({
      data: {
        engagementId,
        title: "Consulting Engine Recommendations",
        description: "Actions generated from consulting engine analysis",
        priority: "high",
        workspaceId,
      },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.RECOMMENDATION_CREATED,
      actorId,
      entityType: "recommendation",
      entityId: synthRec.id,
      workspaceId,
      payload: {
        engagementId,
        title: "Consulting Engine Recommendations",
      },
      visibility: "internal",
    });

    recommendationId = synthRec.id;
  }

  for (const priIntervention of interventions) {
    const intervention = priIntervention.intervention;

    // Map ownerRole to assignedTo: we don't have user IDs, so we'll leave unassigned
    // In Phase 2B, this can be enhanced to map roles to actual users

    // Calculate due date based on estimated days
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + intervention.estimatedTotalDays);

    // Create one action per intervention (not per step, as steps are more granular)
    const input: CreateActionInput = {
      engagementId,
      recommendationId,
      title: intervention.title,
      description: `Objective: ${intervention.objective}\n\nSteps: ${intervention.steps.length}\n\nOwner role: ${intervention.ownerRole}`,
      dueDate: dueDate.toISOString().split("T")[0],
      priority: mapPriorityScore(priIntervention.priorityScore),
    };

    const action = await createAction(input, authContext, workspaceId);
    actions.push(action);
  }

  return actions;
}

function mapPriorityScore(score: number): string {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}
