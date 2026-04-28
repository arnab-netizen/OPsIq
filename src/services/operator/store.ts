import { OperatorItem } from "@/domain/operator/types";
import { CalibrationRecord } from "@/domain/calibration/types";
import { calculateDeviation } from "@/services/calibration/engine";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

const SYSTEM_USER_ID = "550e8400-e29b-41d4-a716-446655440000";

let calibrationStore: CalibrationRecord[] = [];

export async function addItems(items: OperatorItem[]): Promise<void> {
  for (const item of items) {
    await db.operatorItem.create({
      data: {
        id: item.id,
        problem: item.problem,
        action: item.action,
        impactExpected: item.impactExpected,
        impactLow: item.impactLow,
        impactHigh: item.impactHigh,
        confidence: item.confidence,
        priorityScore: item.priorityScore,
        status: item.status,
        dueAt: item.dueAt ? new Date(item.dueAt) : null,
        expectedOutcome: item.expectedOutcome,
        actualOutcome: item.actualOutcome,
        blockingDependencies: item.blockingDependencies && item.blockingDependencies.length > 0 ? item.blockingDependencies : null,
        createdBy: SYSTEM_USER_ID,
      },
    });
  }
}

export async function getItems(): Promise<OperatorItem[]> {
  const records: Prisma.OperatorItemGetPayload<{}>[] = await db.operatorItem.findMany();
  return records.map((r) => ({
    id: r.id,
    problem: r.problem,
    action: r.action,
    impactExpected: Number(r.impactExpected),
    impactLow: Number(r.impactLow),
    impactHigh: Number(r.impactHigh),
    confidence: Number(r.confidence),
    priorityScore: Number(r.priorityScore),
    status: r.status as "pending" | "in_progress" | "done",
    dueAt: r.dueAt ? r.dueAt.toISOString() : null,
    expectedOutcome: r.expectedOutcome,
    actualOutcome: r.actualOutcome,
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
  if (updates.expectedOutcome !== undefined) updateData.expectedOutcome = updates.expectedOutcome;
  if (updates.actualOutcome !== undefined) updateData.actualOutcome = updates.actualOutcome;
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
