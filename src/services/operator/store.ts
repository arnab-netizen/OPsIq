import { OperatorItem } from "@/domain/operator/types";
import { CalibrationRecord } from "@/domain/calibration/types";
import { calculateDeviation } from "@/services/calibration/engine";
import { isFirstWinConditionMet } from "@/services/firstwin/detector";
import { requireWorkspaceContext, validateWorkspaceAccess } from "@/services/workspace/context";
import { recordOperatorItemLearning } from "@/services/learning/store";
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
      logger.warn("Failed to emit audit event for operator item creation", {
        itemId: created.id,
        error: error instanceof Error ? error.message : String(error),
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
  if (updates.outcomeDelta !== undefined) updateData.outcomeDelta = updates.outcomeDelta;
  if (updates.decisionAccuracy !== undefined) updateData.decisionAccuracy = updates.decisionAccuracy;
  if (updates.decisionError !== undefined) updateData.decisionError = updates.decisionError;
  if (updates.outcomeNotes !== undefined) updateData.outcomeNotes = updates.outcomeNotes;
  if (updates.startedAt !== undefined) updateData.startedAt = updates.startedAt ? new Date(updates.startedAt) : null;
  if (updates.completedAt !== undefined) updateData.completedAt = updates.completedAt ? new Date(updates.completedAt) : null;
  if (updates.executionStatus !== undefined) updateData.executionStatus = updates.executionStatus;
  if (updates.blockingDependencies !== undefined) updateData.blockingDependencies = updates.blockingDependencies && updates.blockingDependencies.length > 0 ? updates.blockingDependencies : null;

  // Fetch current item first to verify workspace and capture state
  const item = await db.operatorItem.findFirst({
    where: { id, ...(workspaceId && { workspaceId }) }
  });
  if (!item) throw new NotFoundError("OperatorItem", id);

  // Auto-capture firstCompletedAt on first completion
  if (updates.status === "done" && updates.completedAt) {
    if (item && !item.firstCompletedAt) {
      updateData.firstCompletedAt = new Date(updates.completedAt);
    }
  }

  // Auto-capture firstPositiveOutcomeAt when positive outcome first detected
  if (updates.actualOutcomeValue !== undefined && updates.actualOutcomeValue !== null && updates.actualOutcomeValue > 0) {
    if (item && !item.firstPositiveOutcomeAt) {
      updateData.firstPositiveOutcomeAt = new Date();
    }
  }

  // Auto-detect first win achievement
  if ((updates.actualOutcomeValue !== undefined || updates.outcomeDelta !== undefined) && !updateData.firstWinAchieved) {
    if (item && !item.firstWinAchieved) {
      const isFirstWin = isFirstWinConditionMet({
        expectedImpact: updates.actualOutcomeValue ?? updates.outcomeDelta ?? item.actualOutcomeValue ?? 0,
        actualOutcomeValue: updates.actualOutcomeValue ?? item.actualOutcomeValue,
        outcomeDelta: updates.outcomeDelta ?? item.outcomeDelta,
        impactExpected: item.impactExpected,
      });
      if (isFirstWin) {
        updateData.firstWinAchieved = true;
      }
    }
  }

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
    logger.warn("Failed to emit audit event for operator item update", {
      itemId: id,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  // Record learning when decision is completed with outcome data
  if ((updates.status === "done" || updates.actualOutcomeValue !== undefined) && updates.problemType) {
    if (item && item.status === "done") {
      // Silently record learning if conditions are met
      // Don't throw if learning recording fails
      try {
        await recordOperatorItemLearning({
          id: item.id,
          workspaceId: item.workspaceId,
          ownerUserId: item.ownerUserId,
          createdBy: item.createdBy,
          lastUpdatedBy: item.lastUpdatedBy,
          problem: item.problem,
          action: item.action,
          impactExpected: Number(item.impactExpected),
          impactLow: Number(item.impactLow),
          impactHigh: Number(item.impactHigh),
          confidence: Number(item.confidence),
          priorityScore: Number(item.priorityScore),
          status: item.status as "pending" | "in_progress" | "done" | "failed",
          dueAt: item.dueAt ? item.dueAt.toISOString() : null,
          decisionType: item.decisionType || "general",
          problemType: item.problemType || undefined,
          baselineValue: item.baselineValue ? Number(item.baselineValue) : undefined,
          projectedWithoutAction: item.projectedWithoutAction ? Number(item.projectedWithoutAction) : undefined,
          expectedOutcome: item.expectedOutcome,
          actualOutcome: item.actualOutcome,
          actualOutcomeValue: item.actualOutcomeValue ? Number(item.actualOutcomeValue) : undefined,
          outcomeDelta: item.outcomeDelta ? Number(item.outcomeDelta) : undefined,
          decisionAccuracy: item.decisionAccuracy ? Number(item.decisionAccuracy) : undefined,
          decisionError: item.decisionError ? Number(item.decisionError) : undefined,
          outcomeNotes: item.outcomeNotes || undefined,
          startedAt: item.startedAt ? item.startedAt.toISOString() : undefined,
          completedAt: item.completedAt ? item.completedAt.toISOString() : undefined,
          executionStatus: item.executionStatus || undefined,
          firstCompletedAt: item.firstCompletedAt ? item.firstCompletedAt.toISOString() : undefined,
          firstPositiveOutcomeAt: item.firstPositiveOutcomeAt ? item.firstPositiveOutcomeAt.toISOString() : undefined,
          firstWinAchieved: item.firstWinAchieved || undefined,
          explanation: item.explanation ? JSON.parse(String(item.explanation)) : undefined,
          inputsSnapshot: item.inputsSnapshot ? JSON.parse(String(item.inputsSnapshot)) : undefined,
          decisionHash: item.decisionHash || undefined,
          signedHash: item.signedHash || undefined,
          signature: item.signature || undefined,
          signatureAlgo: item.signatureAlgo || undefined,
          publicKeyId: item.publicKeyId || undefined,
          engineVersion: item.engineVersion || "v1.0.0",
          createdAt: item.createdAt.toISOString(),
          blockingDependencies: Array.isArray(item.blockingDependencies)
            ? (item.blockingDependencies as string[])
            : [],
        });
      } catch {
        // Silently fail learning recording to not block decision updates
      }
    }
  }
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
    logger.warn("Failed to emit audit event for operator item override", {
      itemId: id,
      error: error instanceof Error ? error.message : String(error),
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

  const created = await db.operatorItem.create({ data });

  // Emit audit event for blocked decision
  await emitAuditEvent({
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
  }).catch((error) => {
    logger.warn("Failed to emit audit event for blocked decision", {
      itemId: created.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return created.id;
}
