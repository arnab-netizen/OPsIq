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

    const data: any = {
      id: item.id,
      workspaceId: item.workspaceId,
      ownerUserId: item.ownerUserId,
      createdBy: item.createdBy,
      lastUpdatedBy: item.lastUpdatedBy || null,
      problem: item.problem,
      action: item.action,
      impactExpected: item.impactExpected,
      impactLow: item.impactLow,
      impactHigh: item.impactHigh,
      confidence: item.confidence,
      priorityScore: item.priorityScore,
      status: item.status,
      dueAt: item.dueAt ? new Date(item.dueAt) : null,
      decisionType: item.decisionType || "general",
      expectedOutcome: item.expectedOutcome,
      actualOutcome: item.actualOutcome,
      blockingDependencies: item.blockingDependencies && item.blockingDependencies.length > 0 ? item.blockingDependencies : null,
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
    if (item.problemType) {
      data.problemType = item.problemType;
    }
    if (item.baselineValue !== null && item.baselineValue !== undefined) {
      data.baselineValue = item.baselineValue;
    }
    if (item.projectedWithoutAction !== null && item.projectedWithoutAction !== undefined) {
      data.projectedWithoutAction = item.projectedWithoutAction;
    }

    const created = await db.operatorItem.create({ data });

    // Emit audit event for operator item creation
    await emitAuditEvent({
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
    }).catch((error) => {
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
      logger.warn("Failed to emit audit event for operator item creation", {
        itemId: created.id,
        error: governed.operatorMessage,
      });
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
  workspaceId?: string
): Promise<void> {
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

  // Fetch current item first to verify workspace and capture state
  const item = await db.operatorItem.findFirst({
    where: { id, ...(workspaceId && { workspaceId }) }
  });
  if (!item) throw new NotFoundError("OperatorItem", id);

  await db.operatorItem.update({
    where: { id },
    data: updateData,
  });

  // Emit audit event for operator item update
  const payloadFields: Record<string, unknown> = {};
  Object.keys(updateData)
    .slice(0, 5)
    .forEach((key) => {
      payloadFields[key] = updateData[key];
    });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OPERATOR_ITEM_UPDATED,
    actorId: item.lastUpdatedBy || item.createdBy || "system",
    entityType: "operator_item",
    entityId: id,
    workspaceId: item.workspaceId,
    payload: payloadFields,
    visibility: "internal",
  }).catch((error) => {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    logger.warn("Failed to emit audit event for operator item update", {
      itemId: id,
      error: governed.operatorMessage,
    });
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
  workspaceId?: string,
  actorId?: string
): Promise<void> {
  // Fetch item to get workspaceId if not provided
  const item = await db.operatorItem.findFirst({
    where: { id, ...(workspaceId && { workspaceId }) },
    select: { id: true, workspaceId: true, action: true, createdBy: true },
  });

  if (!item) throw new NotFoundError("OperatorItem", id);

  const resolvedWorkspaceId = workspaceId || item.workspaceId;
  const resolvedActorId = actorId || item.createdBy || "system";

  await db.operatorItem.update({
    where: { id },
    data: { action: newAction },
  });

  // Emit audit event for operator item override
  await emitAuditEvent({
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
  }).catch((error) => {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    logger.warn("Failed to emit audit event for operator item override", {
      itemId: id,
      error: governed.operatorMessage,
    });
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

  const data: any = {
    id: require("crypto").randomUUID(),
    workspaceId: params.workspaceId,
    ownerUserId: params.ownerUserId,
    createdBy: params.createdBy,
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
    decisionType: "general",
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
  if (params.problemType) {
    data.problemType = params.problemType;
  }

  // AUDIT DURABILITY (GAP-AUDIT-01): a blocked-decision record and its audit
  // event must land together or not at all — a lost block record is a
  // governance hole. Write both inside one transaction (fail-closed): if the
  // audit write fails, the blocked-decision row rolls back.
  const created = await db.$transaction(async (tx: typeof db) => {
    const row = await tx.operatorItem.create({ data });
    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OPERATOR_ITEM_BLOCKED,
        actorId: params.createdBy,
        entityType: "operator_item",
        entityId: row.id,
        workspaceId: params.workspaceId,
        payload: {
          blockStage: params.blockStage,
          blockReason: params.blockReason,
          problem: params.problem,
        },
        visibility: "internal",
      },
      tx,
    );
    return row;
  });

  return created.id;
}
