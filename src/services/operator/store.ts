import { OperatorItem } from "@/domain/operator/types";
import { CalibrationRecord } from "@/domain/calibration/types";
import { calculateDeviation } from "@/services/calibration/engine";
import { requireWorkspaceContext, validateWorkspaceAccess } from "@/services/workspace/context";
import { db } from "@/lib/db";
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

    const data: any = {
      id: item.id,
      workspaceId: item.workspaceId,
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
      createdBy: SYSTEM_USER_ID,
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

    await db.operatorItem.create({ data });
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
  updates: Partial<OperatorItem>
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

  await db.operatorItem.update({
    where: { id },
    data: updateData,
  });
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
  newAction: string
): Promise<void> {
  await db.operatorItem.update({
    where: { id },
    data: { action: newAction },
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
