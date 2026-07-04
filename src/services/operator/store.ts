import { classifyOperatorError } from "@/lib/operator-error-governance";
import { OperatorItem } from "@/domain/operator/types";
import { CalibrationRecord } from "@/domain/calibration/types";
import { calculateDeviation } from "@/services/calibration/engine";
import { isFirstWinConditionMet } from "@/services/firstwin/detector";
import { requireWorkspaceContext, validateWorkspaceAccess } from "@/services/workspace/context";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { logger } from "@/infra/logger";
import type { Prisma } from "@/generated/prisma/client";

const SYSTEM_USER_ID = "550e8400-e29b-41d4-a716-446655440000";

let calibrationStore: CalibrationRecord[] = [];

export async function addItems(items: OperatorItem[]): Promise<void> {
  // Workspace isolation: fail closed if no workspace context
  const workspace = await requireWorkspaceContext();

  for (const item of items) {
    // Fail closed: require workspaceId on item and verify it matches current workspace
    if (!item.workspaceId) {
      throw new Error("OperatorItem workspaceId is required for workspace isolation");
    }
    await validateWorkspaceAccess(item.workspaceId);

    // Fail closed: require ownership fields
    if (!item.ownerUserId) {
      throw new Error("OperatorItem ownerUserId is required for decision ownership");
    }
    if (!item.createdBy) {
      throw new Error("OperatorItem createdBy is required for audit trail");
    }

    // SCHEMA fix: the domain OperatorItem uses `createdBy`/`lastUpdatedBy` and carries
    // `decisionType`/`problemType`/`baselineValue`/`projectedWithoutAction`, but the Prisma
    // model has NO such columns (the id fields are `createdByUserId`/`lastUpdatedByUserId`).
    // The previous mapping wrote those non-existent fields, so `create` threw a
    // PrismaClientValidationError on every addItems call. Map to the real columns and drop
    // the fields with no column.
    const data: any = {
      id: item.id,
      workspaceId: item.workspaceId,
      ownerUserId: item.ownerUserId,
      createdByUserId: item.createdBy,
      lastUpdatedByUserId: item.lastUpdatedBy || null,
      problem: item.problem,
      action: item.action,
      impactExpected: item.impactExpected,
      impactLow: item.impactLow,
      impactHigh: item.impactHigh,
      confidence: item.confidence,
      priorityScore: item.priorityScore,
      status: item.status,
      dueAt: item.dueAt ? new Date(item.dueAt) : null,
      expectedOutcome: item.expectedOutcome ?? null,
      actualOutcome: item.actualOutcome ?? null,
      blockingDependencies: item.blockingDependencies && item.blockingDependencies.length > 0 ? item.blockingDependencies : null,
      updatedAt: new Date(),
    };

    if (item.explanation) {
      data.explanation = JSON.stringify(item.explanation);
    }
    if (item.inputsSnapshot) {
      data.inputsSnapshot = JSON.stringify(item.inputsSnapshot);
    }
    if (item.decisionHash) {
      data.decisionHash = item.decisionHash;
    }
    if (item.signedHash) {
      data.signedHash = item.signedHash;
    }
    if (item.signature) {
      data.signature = item.signature;
    }
    if (item.signatureAlgo) {
      data.signatureAlgo = item.signatureAlgo;
    }
    if (item.publicKeyId) {
      data.publicKeyId = item.publicKeyId;
    }
    if (item.engineVersion) {
      data.engineVersion = item.engineVersion;
    }

    // GAP-AUDIT-02: create the governed decision and its audit event ATOMICALLY. Previously
    // the create committed and the audit was best-effort (.catch → warn), so a decision could
    // persist with the audit trail silently lost. Now a failed audit rolls back the create.
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.operatorItem.create({ data });
      await emitAuditEvent(
        {
          eventName: AUDIT_EVENTS.OPERATOR_ITEM_CREATED,
          actorId: item.createdBy,
          entityType: "operator_item",
          entityId: created.id,
          workspaceId: item.workspaceId,
          payload: {
            problem: item.problem,
            action: item.action,
            priority: item.priorityScore,
          },
          visibility: "internal",
        },
        tx
      );
    });
  }
}

export async function getItems(): Promise<OperatorItem[]> {
  // Workspace isolation: fail closed if no workspace context
  const workspace = await requireWorkspaceContext();

  // Filter by workspaceId to prevent cross-workspace access
  const records: Prisma.OperatorItemGetPayload<{}>[] = await db.operatorItem.findMany({
    where: { workspaceId: workspace.workspaceId },
  });
  return records.map((r: any) => ({
    id: r.id,
    workspaceId: r.workspaceId,
    ownerUserId: r.ownerUserId,
    createdBy: r.createdBy,
    lastUpdatedBy: r.lastUpdatedBy,
    problem: r.problem,
    action: r.action,
    impactExpected: Number(r.impactExpected),
    impactLow: Number(r.impactLow),
    impactHigh: Number(r.impactHigh),
    confidence: Number(r.confidence),
    priorityScore: Number(r.priorityScore),
    status: r.status as "pending" | "in_progress" | "done",
    dueAt: r.dueAt ? r.dueAt.toISOString() : null,
    decisionType: r.decisionType || "general",
    problemType: r.problemType || undefined,
    baselineValue: r.baselineValue ? Number(r.baselineValue) : undefined,
    projectedWithoutAction: r.projectedWithoutAction ? Number(r.projectedWithoutAction) : undefined,
    expectedOutcome: r.expectedOutcome,
    actualOutcome: r.actualOutcome,
    actualOutcomeValue: r.actualOutcomeValue ? Number(r.actualOutcomeValue) : undefined,
    outcomeDelta: r.outcomeDelta ? Number(r.outcomeDelta) : undefined,
    decisionAccuracy: r.decisionAccuracy ? Number(r.decisionAccuracy) : undefined,
    decisionError: r.decisionError ? Number(r.decisionError) : undefined,
    explanation: r.explanation ? JSON.parse(String(r.explanation)) : undefined,
    inputsSnapshot: r.inputsSnapshot
      ? JSON.parse(String(r.inputsSnapshot))
      : undefined,
    decisionHash: r.decisionHash || undefined,
    signedHash: r.signedHash || undefined,
    signature: r.signature || undefined,
    signatureAlgo: r.signatureAlgo || undefined,
    publicKeyId: r.publicKeyId || undefined,
    engineVersion: r.engineVersion || "v1.0.0",
    createdAt: r.createdAt.toISOString(),
    blockingDependencies: Array.isArray(r.blockingDependencies) ? (r.blockingDependencies as string[]) : [],
  }));
}

export async function updateItem(
  id: string,
  updates: Partial<OperatorItem>,
  workspaceId: string
): Promise<void> {
  // SEC-02: workspace scope is mandatory. A missing/empty workspaceId previously
  // caused the findFirst below to match by id alone and the update to run unscoped,
  // allowing cross-tenant writes. Fail closed.
  if (!workspaceId) {
    throw new Error("updateItem requires a workspaceId for tenant isolation");
  }
  const updateData: Record<string, any> = {};

  if (updates.problem !== undefined) updateData.problem = updates.problem;
  if (updates.action !== undefined) updateData.action = updates.action;
  if (updates.impactExpected !== undefined) updateData.impactExpected = updates.impactExpected;
  if (updates.impactLow !== undefined) updateData.impactLow = updates.impactLow;
  if (updates.impactHigh !== undefined) updateData.impactHigh = updates.impactHigh;
  if (updates.confidence !== undefined) updateData.confidence = updates.confidence;
  if (updates.priorityScore !== undefined) updateData.priorityScore = updates.priorityScore;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.dueAt !== undefined) updateData.dueAt = updates.dueAt ? new Date(updates.dueAt) : null;
  if (updates.decisionType !== undefined) updateData.decisionType = updates.decisionType;
  if (updates.expectedOutcome !== undefined) updateData.expectedOutcome = updates.expectedOutcome;
  if (updates.actualOutcome !== undefined) updateData.actualOutcome = updates.actualOutcome;
  if (updates.actualOutcomeValue !== undefined) updateData.actualOutcomeValue = updates.actualOutcomeValue;
  if (updates.outcomeNotes !== undefined) updateData.outcomeNotes = updates.outcomeNotes;
  if (updates.startedAt !== undefined) updateData.startedAt = updates.startedAt ? new Date(updates.startedAt) : null;
  if (updates.completedAt !== undefined) updateData.completedAt = updates.completedAt ? new Date(updates.completedAt) : null;
  if (updates.executionStatus !== undefined) updateData.executionStatus = updates.executionStatus;
  if (updates.completedBy !== undefined) {
    if (updates.completedBy === null) {
      updateData.completedByUser = null;
    } else {
      updateData.completedByUser = { connect: { id: updates.completedBy } };
    }
  }
  if (updates.verificationStatus !== undefined) updateData.verificationStatus = updates.verificationStatus;
  if (updates.verificationMethod !== undefined) updateData.verificationMethod = updates.verificationMethod;
  if (updates.verificationConfidence !== undefined) updateData.verificationConfidence = updates.verificationConfidence;
  if (updates.verificationEvidence !== undefined) updateData.verificationEvidence = updates.verificationEvidence;
  if (updates.auditTrail !== undefined) updateData.auditTrail = updates.auditTrail;
  if (updates.blockingDependencies !== undefined) updateData.blockingDependencies = updates.blockingDependencies && updates.blockingDependencies.length > 0 ? updates.blockingDependencies : null;

  // Fetch current item first to verify workspace and capture state.
  // Always scoped by workspaceId (now mandatory) — a foreign item resolves to null.
  const item = await db.operatorItem.findFirst({
    where: { id, workspaceId }
  });
  if (!item) throw new NotFoundError("OperatorItem", id);

  // Emit audit event for operator item update
  const payloadFields: Record<string, unknown> = {};
  Object.keys(updateData)
    .slice(0, 5)
    .forEach((key) => {
      payloadFields[key] = updateData[key];
    });

  // AUDIT-01: high-risk governed mutation — the update and its audit event are written
  // in ONE transaction. If the audit write fails, the mutation rolls back (fail-closed),
  // so a decision can never change state with the audit trail silently lost.
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.operatorItem.update({
      where: { id },
      data: updateData,
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OPERATOR_ITEM_UPDATED,
        actorId: item.lastUpdatedByUserId || item.createdByUserId || "system",
        entityType: "operator_item",
        entityId: id,
        workspaceId: item.workspaceId,
        payload: payloadFields,
        visibility: "internal",
      },
      tx
    );
  });

  // NOTE (M7): the former `recordOperatorItemLearning(...)` call here targeted a Prisma model
  // (`learning_records`) that does not exist in the schema, so it threw on every completion and was
  // swallowed — it never persisted anything. The live decision-path learning read-back now reads the real
  // persisted `OperatorItem` outcome history (see recommendation.ts, blocker B6), so this dead writer is removed.
}

export function addCalibrationRecord(
  operatorItemId: string,
  predictedImpact: number,
  actualImpact: number,
  confidence: number
): void {
  const deviation = calculateDeviation(predictedImpact, actualImpact);

  calibrationStore.push({
    id: Date.now().toString(),
    operatorItemId,
    predictedImpact,
    actualImpact,
    confidence,
    deviation,
    createdAt: new Date().toISOString(),
  });
}

export function getCalibrationRecords(): CalibrationRecord[] {
  return calibrationStore;
}

export async function applyOverride(
  id: string,
  newAction: string,
  workspaceId: string,
  actorId?: string
): Promise<void> {
  // SEC-02/SEC-05: workspace scope is mandatory — reject unscoped override writes.
  if (!workspaceId) {
    throw new Error("applyOverride requires a workspaceId for tenant isolation");
  }
  // Fetch item scoped to the caller's workspace; a foreign item resolves to null.
  const item = await db.operatorItem.findFirst({
    where: { id, workspaceId },
    select: { id: true, workspaceId: true, action: true, createdByUserId: true },
  });

  if (!item) throw new NotFoundError("OperatorItem", id);

  const resolvedWorkspaceId = workspaceId || item.workspaceId;
  const resolvedActorId = actorId || item.createdByUserId || "system";

  // AUDIT-01: high-risk governed mutation — override write + audit are atomic.
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.operatorItem.update({
      where: { id },
      data: { action: newAction },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OPERATOR_ITEM_OVERRIDDEN,
        actorId: resolvedActorId,
        entityType: "operator_item",
        entityId: id,
        workspaceId: resolvedWorkspaceId,
        payload: {
          previousAction: item.action,
          newAction,
        },
        visibility: "internal",
      },
      tx
    );
  });
}

export async function getQueuedItems(
  statusFilter?: string,
  limit: number = 20
): Promise<OperatorItem[]> {
  // Workspace isolation: fail closed if no workspace context
  const workspace = await requireWorkspaceContext();

  const statuses = statusFilter
    ? [statusFilter]
    : ["pending", "in_progress"];

  // Filter by workspaceId to prevent cross-workspace access
  const records: Prisma.OperatorItemGetPayload<{}>[] = await db.operatorItem.findMany({
    where: {
      workspaceId: workspace.workspaceId,
      status: {
        in: statuses,
      },
    },
    orderBy: [
      { priorityScore: "desc" },
      { dueAt: "asc" },
    ],
    take: limit,
  });

  return records.map((r: any) => ({
    id: r.id,
    workspaceId: r.workspaceId,
    ownerUserId: r.ownerUserId,
    createdBy: r.createdBy,
    lastUpdatedBy: r.lastUpdatedBy,
    problem: r.problem,
    action: r.action,
    impactExpected: Number(r.impactExpected),
    impactLow: Number(r.impactLow),
    impactHigh: Number(r.impactHigh),
    confidence: Number(r.confidence),
    priorityScore: Number(r.priorityScore),
    status: r.status as "pending" | "in_progress" | "done" | "failed",
    dueAt: r.dueAt ? r.dueAt.toISOString() : null,
    decisionType: r.decisionType || "general",
    problemType: r.problemType || undefined,
    baselineValue: r.baselineValue ? Number(r.baselineValue) : undefined,
    projectedWithoutAction: r.projectedWithoutAction ? Number(r.projectedWithoutAction) : undefined,
    expectedOutcome: r.expectedOutcome,
    actualOutcome: r.actualOutcome,
    actualOutcomeValue: r.actualOutcomeValue ? Number(r.actualOutcomeValue) : undefined,
    outcomeDelta: r.outcomeDelta ? Number(r.outcomeDelta) : undefined,
    decisionAccuracy: r.decisionAccuracy ? Number(r.decisionAccuracy) : undefined,
    decisionError: r.decisionError ? Number(r.decisionError) : undefined,
    outcomeNotes: r.outcomeNotes || undefined,
    startedAt: r.startedAt ? r.startedAt.toISOString() : undefined,
    completedAt: r.completedAt ? r.completedAt.toISOString() : undefined,
    executionStatus: r.executionStatus || undefined,
    firstCompletedAt: r.firstCompletedAt ? r.firstCompletedAt.toISOString() : undefined,
    firstPositiveOutcomeAt: r.firstPositiveOutcomeAt ? r.firstPositiveOutcomeAt.toISOString() : undefined,
    firstWinAchieved: r.firstWinAchieved || undefined,
    explanation: r.explanation ? JSON.parse(String(r.explanation)) : undefined,
    inputsSnapshot: r.inputsSnapshot
      ? JSON.parse(String(r.inputsSnapshot))
      : undefined,
    decisionHash: r.decisionHash || undefined,
    signedHash: r.signedHash || undefined,
    signature: r.signature || undefined,
    signatureAlgo: r.signatureAlgo || undefined,
    publicKeyId: r.publicKeyId || undefined,
    engineVersion: r.engineVersion || "v1.0.0",
    createdAt: r.createdAt.toISOString(),
    blockingDependencies: Array.isArray(r.blockingDependencies) ? (r.blockingDependencies as string[]) : [],
  }));
}

/**
 * Add a blocked decision to the database for audit and analytics.
 * Called when /api/run decision is blocked by control layer.
 *
 * FAIL-CLOSED: Requires all mandatory fields for proper auditing.
 */
export async function addBlockedDecision(params: {
  workspaceId: string;
  createdBy: string;
  ownerUserId: string;
  problem: string;
  action: string;
  blockStage: "dependency_validation" | "decision_gate" | "guardrails";
  blockReason: string;
  expectedImpact: number;
  confidence: number;
  inputsSnapshot?: Record<string, unknown>;
  controlLayerViolations?: Record<string, unknown>;
  gateResult?: Record<string, unknown>;
  guardrailResult?: Record<string, unknown>;
  problemType?: string;
}): Promise<string> {
  const workspace = await requireWorkspaceContext();
  await validateWorkspaceAccess(params.workspaceId);

  // FAIL-CLOSED: Verify all required blocking information is present
  if (!params.blockStage || !params.blockReason) {
    throw new Error("blockStage and blockReason are required for blocked decision records");
  }

  // SCHEMA fix (as in addItems): map to real columns and set required updatedAt.
  const data: any = {
    id: require("crypto").randomUUID(),
    workspaceId: params.workspaceId,
    ownerUserId: params.ownerUserId,
    createdByUserId: params.createdBy,
    problem: params.problem,
    action: params.action,
    impactExpected: params.expectedImpact,
    impactLow: params.expectedImpact * 0.8, // Conservative estimate
    impactHigh: params.expectedImpact * 1.2, // Optimistic estimate
    confidence: params.confidence,
    priorityScore: 0, // Blocked decisions have no priority
    status: "blocked",
    blockStage: params.blockStage,
    blockReason: params.blockReason,
    updatedAt: new Date(),
  };

  // Add optional blocking details
  if (params.inputsSnapshot) {
    data.inputsSnapshot = JSON.stringify(params.inputsSnapshot);
  }
  if (params.controlLayerViolations) {
    data.controlLayerViolations = JSON.stringify(params.controlLayerViolations);
  }
  if (params.gateResult) {
    data.gateResult = JSON.stringify(params.gateResult);
  }
  if (params.guardrailResult) {
    data.guardrailResult = JSON.stringify(params.guardrailResult);
  }

  // GAP-AUDIT-01: blocked-decision record + its audit event are written ATOMICALLY.
  const createdId: string = data.id;
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.operatorItem.create({ data });
    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OPERATOR_ITEM_BLOCKED,
        actorId: params.createdBy,
        entityType: "operator_item",
        entityId: created.id,
        workspaceId: params.workspaceId,
        payload: {
          blockStage: params.blockStage,
          blockReason: params.blockReason,
          problem: params.problem,
        },
        visibility: "internal",
      },
      tx
    );
  });

  return createdId;
}
