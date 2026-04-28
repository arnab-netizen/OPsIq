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
    blockingDependencies: [],
  }));
}

export async function updateItem(
  id: string,
  updates: Partial<OperatorItem>
): Promise<void> {
  await db.operatorItem.update({
    where: { id },
    data: {
      problem: updates.problem,
      action: updates.action,
      impactExpected: updates.impactExpected,
      impactLow: updates.impactLow,
      impactHigh: updates.impactHigh,
      confidence: updates.confidence,
      priorityScore: updates.priorityScore,
      status: updates.status,
      dueAt: updates.dueAt ? new Date(updates.dueAt) : undefined,
      expectedOutcome: updates.expectedOutcome,
      actualOutcome: updates.actualOutcome,
    },
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
