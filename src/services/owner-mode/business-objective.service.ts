/**
 * Phase 4 — Business Objective service.
 *
 * CRUD + hierarchy queries for BusinessObjective.
 * Workspace isolation enforced on all operations.
 * All mutations emit atomic audit events.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import type { AuditEventName } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { assertObjectiveGoalLink } from "@/services/owner-strategy/goal.service";
import { Prisma } from "@/generated/prisma/client";

export type ObjectiveType =
  | "REVENUE"
  | "COST_REDUCTION"
  | "QUALITY"
  | "COMPLIANCE"
  | "GROWTH"
  | "RESILIENCE"
  | "STRATEGIC";

const VALID_OBJECTIVE_TYPES: ObjectiveType[] = [
  "REVENUE", "COST_REDUCTION", "QUALITY", "COMPLIANCE", "GROWTH", "RESILIENCE", "STRATEGIC",
];

export type ObjectiveStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "ABANDONED";
const VALID_STATUSES: ObjectiveStatus[] = ["ACTIVE", "PAUSED", "COMPLETED", "ABANDONED"];

export interface CreateObjectiveInput {
  workspaceId: string;
  actorId: string;
  /**
   * null means an EXPLICIT workspace/portfolio-level objective, not tied to any one business.
   * Callers creating a business-specific objective must pass the business's id — this is never
   * inferred server-side from a caller's "currently selected" business. See
   * owner-now-view.service.ts's buildBusinessOperatingSystem() for the read-side contract this
   * enforces.
   */
  businessId?: string | null;
  parentId?: string | null;
  title: string;
  description?: string | null;
  objectiveType: ObjectiveType;
  targetMetricName?: string | null;
  targetValue?: number | null;
  currentValue?: number | null;
  unit?: string | null;
  deadline?: Date | null;
  priorityScore?: number;
  resourceBudget?: Record<string, unknown>;
  constraints?: unknown[];
  ownerId?: string | null;
  linkedGoalId?: string | null;
}

export interface UpdateObjectiveInput {
  workspaceId: string;
  objectiveId: string;
  actorId: string;
  title?: string;
  description?: string | null;
  objectiveType?: ObjectiveType;
  status?: ObjectiveStatus;
  targetValue?: number | null;
  currentValue?: number | null;
  deadline?: Date | null;
  priorityScore?: number;
  resourceBudget?: Record<string, unknown>;
  constraints?: unknown[];
  ownerId?: string | null;
  linkedGoalId?: string | null;
}

function validateObjectiveType(t: string): asserts t is ObjectiveType {
  if (!VALID_OBJECTIVE_TYPES.includes(t as ObjectiveType)) {
    throw new ValidationError(`Invalid objectiveType: ${t}`);
  }
}

function validateStatus(s: string): asserts s is ObjectiveStatus {
  if (!VALID_STATUSES.includes(s as ObjectiveStatus)) {
    throw new ValidationError(`Invalid status: ${s}`);
  }
}

/**
 * Ownership guard for the soft-FK BusinessObjective.businessId: proves, inside the same
 * transaction as the insert, that the business belongs to this exact workspace and is not an
 * acceptance/QA fixture, before any row is written. Without this, an explicit businessId in the
 * request body could attach a workspace's objective to a business belonging to a DIFFERENT
 * workspace (or to a fixture business, which must never be a real owner's create target) — a
 * tenant-isolation break the soft-FK's lack of a DB-level foreign key cannot catch on its own.
 * Lives on the shared core so every caller (the HTTP route AND createBlueprint's in-transaction
 * path) is protected identically, not just the route layer.
 *
 * Deliberately a plain NotFoundError, identical whether businessId belongs to another workspace,
 * is a fixture business, or does not exist at all — never distinguishes those cases in the
 * response, so a caller cannot use this check to probe for the existence of another workspace's
 * business ids.
 */
async function assertBusinessOwnership(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  businessId: string,
): Promise<void> {
  const business = await tx.ownerBusiness.findFirst({
    where: { id: businessId, workspaceId, isFixtureBusiness: false },
    select: { id: true },
  });
  if (!business) {
    throw new NotFoundError("OwnerBusiness", businessId);
  }
}

async function _createObjectiveCore(tx: Prisma.TransactionClient, input: CreateObjectiveInput) {
  if (input.businessId != null) {
    await assertBusinessOwnership(tx, input.workspaceId, input.businessId);
  }
  if (input.linkedGoalId) {
    // Same workspace, ACTIVE, and the objective's own scope (goal.service.ts).
    await assertObjectiveGoalLink(input.workspaceId, input.businessId ?? null, input.linkedGoalId, tx);
  }

  const objective = await tx.businessObjective.create({
    data: {
      workspaceId: input.workspaceId,
      businessId: input.businessId ?? null,
      parentId: input.parentId ?? null,
      title: input.title.trim(),
      description: input.description ?? null,
      objectiveType: input.objectiveType,
      targetMetricName: input.targetMetricName ?? null,
      targetValue: input.targetValue ?? null,
      currentValue: input.currentValue ?? null,
      unit: input.unit ?? null,
      deadline: input.deadline ?? null,
      priorityScore: input.priorityScore ?? 50,
      resourceBudget: (input.resourceBudget ?? {}) as Prisma.InputJsonValue,
      constraints: (input.constraints ?? []) as Prisma.InputJsonValue,
      ownerId: input.ownerId ?? null,
      linkedGoalId: input.linkedGoalId ?? null,
    },
  });

  await emitAuditEvent(
    {
      eventName: AUDIT_EVENTS.OWNER_OBJECTIVE_CREATED,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      entityType: "BusinessObjective",
      entityId: objective.id,
      payload: { objectiveType: input.objectiveType, title: input.title },
    },
    tx,
  );

  return objective;
}

export async function createObjective(input: CreateObjectiveInput) {
  validateObjectiveType(input.objectiveType);

  if (input.title.trim().length === 0) {
    throw new ValidationError("Objective title cannot be empty");
  }

  if (input.priorityScore !== undefined && (input.priorityScore < 0 || input.priorityScore > 100)) {
    throw new ValidationError("priorityScore must be between 0 and 100");
  }

  return db.$transaction((tx: Prisma.TransactionClient) => _createObjectiveCore(tx, input));
}

/** Use inside an existing Prisma transaction. Validates inputs before delegating to core. */
export async function createObjectiveInTx(tx: Prisma.TransactionClient, input: CreateObjectiveInput) {
  validateObjectiveType(input.objectiveType);
  if (input.title.trim().length === 0) throw new ValidationError("Objective title cannot be empty");
  if (input.priorityScore !== undefined && (input.priorityScore < 0 || input.priorityScore > 100)) {
    throw new ValidationError("priorityScore must be between 0 and 100");
  }
  return _createObjectiveCore(tx, input);
}

export async function updateObjective(input: UpdateObjectiveInput) {
  if (input.objectiveType) validateObjectiveType(input.objectiveType);
  if (input.status) validateStatus(input.status);

  const existing = await db.businessObjective.findFirst({
    where: { id: input.objectiveId, workspaceId: input.workspaceId },
  });

  if (!existing) throw new NotFoundError("BusinessObjective", input.objectiveId);

  const terminalStatuses: ObjectiveStatus[] = ["COMPLETED", "ABANDONED"];
  if (terminalStatuses.includes(existing.status as ObjectiveStatus) && input.status === undefined) {
    throw new ValidationError(`Cannot update a ${existing.status} objective without providing new status`);
  }

  const updateData: Prisma.BusinessObjectiveUpdateInput = {};
  if (input.title !== undefined) updateData.title = input.title.trim();
  if (input.description !== undefined) updateData.description = input.description;
  if (input.objectiveType !== undefined) updateData.objectiveType = input.objectiveType;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.targetValue !== undefined) updateData.targetValue = input.targetValue;
  if (input.currentValue !== undefined) updateData.currentValue = input.currentValue;
  if (input.deadline !== undefined) updateData.deadline = input.deadline;
  if (input.priorityScore !== undefined) updateData.priorityScore = input.priorityScore;
  if (input.resourceBudget !== undefined) updateData.resourceBudget = input.resourceBudget as Prisma.InputJsonValue;
  if (input.constraints !== undefined) updateData.constraints = input.constraints as Prisma.InputJsonValue;
  if (input.ownerId !== undefined) updateData.ownerId = input.ownerId;
  if (input.linkedGoalId !== undefined) {
    if (input.linkedGoalId) {
      await assertObjectiveGoalLink(input.workspaceId, existing.businessId ?? null, input.linkedGoalId);
    }
    updateData.linkedGoalId = input.linkedGoalId;
  }

  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.businessObjective.update({
      where: { id: input.objectiveId },
      data: updateData,
    });

    let eventName: AuditEventName = AUDIT_EVENTS.OWNER_OBJECTIVE_UPDATED;
    if (input.status === "COMPLETED") eventName = AUDIT_EVENTS.OWNER_OBJECTIVE_ACHIEVED;
    if (input.status === "ABANDONED") eventName = AUDIT_EVENTS.OWNER_OBJECTIVE_ABANDONED;

    await emitAuditEvent(
      {
        eventName,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        entityType: "BusinessObjective",
        entityId: input.objectiveId,
        payload: { changes: Object.keys(updateData) },
      },
      tx,
    );

    return updated;
  });

  return result;
}

export async function getObjective(workspaceId: string, objectiveId: string) {
  const obj = await db.businessObjective.findFirst({
    where: { id: objectiveId, workspaceId },
    include: {
      children: { select: { id: true, title: true, status: true, priorityScore: true } },
      parent: { select: { id: true, title: true } },
      blockedBy: { include: { blocking: { select: { id: true, title: true, status: true } } } },
    },
  });
  if (!obj) throw new NotFoundError("BusinessObjective", objectiveId);
  return obj;
}

export async function listObjectives(
  workspaceId: string,
  opts: {
    status?: ObjectiveStatus;
    objectiveType?: ObjectiveType;
    parentId?: string | null;
    /**
     * Omit to list every objective in the workspace regardless of business (the pre-existing,
     * unscoped behavior). Pass a business id to scope strictly to that business's objectives, or
     * pass `null` explicitly to list only workspace/portfolio-level objectives (businessId IS NULL).
     */
    businessId?: string | null;
  } = {},
) {
  return db.businessObjective.findMany({
    where: {
      workspaceId,
      // Excludes acceptance/QA fixture objectives (see ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md) — an
      // ordinary owner's goals list must never include a goal a QA blueprint run created.
      isFixtureRecord: false,
      ...(opts.businessId !== undefined ? { businessId: opts.businessId } : {}),
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.objectiveType ? { objectiveType: opts.objectiveType } : {}),
      ...(opts.parentId !== undefined ? { parentId: opts.parentId } : {}),
    },
    orderBy: [{ priorityScore: "desc" }, { createdAt: "desc" }],
  });
}

/** Detect if adding edge blockingId→blockedId would introduce a cycle via DFS.
 *  Must be called inside a Serializable transaction to prevent concurrent insertions
 *  from racing past the cycle check on a stale graph snapshot. */
async function wouldCreateCycle(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  blockingId: string,
  blockedId: string,
): Promise<boolean> {
  // Starting from blockedId, check if blockingId is reachable (i.e. blockedId already depends on blockingId)
  const visited = new Set<string>();
  const queue: string[] = [blockedId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === blockingId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const outgoing = await tx.businessObjectiveDependency.findMany({
      where: { workspaceId, blockingId: current },
      select: { blockedId: true },
    });
    for (const edge of outgoing) queue.push(edge.blockedId);
  }
  return false;
}

const VALID_DEP_TYPES = ["DEPENDS_ON", "BLOCKS", "ENABLES", "PARALLEL", "MUTUALLY_EXCLUSIVE", "PREREQUISITE"] as const;

export async function addDependency(
  workspaceId: string,
  actorId: string,
  blockingId: string,
  blockedId: string,
  depType: string = "DEPENDS_ON",
  note?: string,
) {
  if (blockingId === blockedId) {
    throw new ValidationError("An objective cannot depend on itself");
  }

  if (!VALID_DEP_TYPES.includes(depType as (typeof VALID_DEP_TYPES)[number])) {
    throw new ValidationError(`Invalid depType: ${depType}. Must be one of ${VALID_DEP_TYPES.join(", ")}`);
  }

  // Verify both objectives belong to this workspace
  const [blocking, blocked] = await Promise.all([
    db.businessObjective.findFirst({ where: { id: blockingId, workspaceId } }),
    db.businessObjective.findFirst({ where: { id: blockedId, workspaceId } }),
  ]);

  if (!blocking) throw new NotFoundError("BusinessObjective", blockingId);
  if (!blocked) throw new NotFoundError("BusinessObjective", blockedId);

  // Cycle detection inside a Serializable transaction — prevents concurrent insertions
  // from racing past the DFS on a stale snapshot of the dependency graph.
  return db.$transaction(
    async (tx: Prisma.TransactionClient) => {
      if (await wouldCreateCycle(tx, workspaceId, blockingId, blockedId)) {
        throw new ValidationError(
          `Adding dependency ${blockingId}→${blockedId} would create a cycle in the dependency graph`,
        );
      }

      return tx.businessObjectiveDependency.upsert({
        where: { workspaceId_blockingId_blockedId: { workspaceId, blockingId, blockedId } },
        create: { workspaceId, blockingId, blockedId, depType, note: note ?? null },
        update: { depType, note: note ?? null },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function removeDependency(
  workspaceId: string,
  blockingId: string,
  blockedId: string,
) {
  const existing = await db.businessObjectiveDependency.findFirst({
    where: { workspaceId, blockingId, blockedId },
  });
  if (!existing) return null;
  return db.businessObjectiveDependency.delete({ where: { id: existing.id } });
}
