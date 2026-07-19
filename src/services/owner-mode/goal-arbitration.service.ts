/**
 * Phase 4 — Goal Arbitration service.
 *
 * Fetches active BusinessObjectives for a workspace, invokes the pure
 * `arbitrateObjectives()` domain function, persists the GoalArbitrationRecord,
 * and builds + persists an ExplainabilityRecord.
 *
 * Workspace isolation enforced. Audit event emitted atomically.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { Prisma } from "@/generated/prisma/client";
import {
  arbitrateObjectives,
  type ObjectiveCandidate,
  type TimeHorizon,
  type ObjectiveType,
} from "@/domain/owner-mode/objective-arbitration";
import { explainGoalArbitration } from "@/domain/owner-mode/explainability";
import { persistExplainabilityRecord } from "./explainability.service";

function deadlineDaysRemaining(deadline: Date | null): number | null {
  if (!deadline) return null;
  const ms = deadline.getTime() - Date.now();
  return Math.round(ms / 86_400_000);
}

function timeHorizonFromDays(days: number | null): TimeHorizon {
  if (days === null) return "LONG_TERM";
  if (days <= 14) return "IMMEDIATE";
  if (days <= 60) return "SHORT_TERM";
  if (days <= 180) return "MEDIUM_TERM";
  return "LONG_TERM";
}

export interface RunGoalArbitrationResult {
  arbitrationRecordId: string;
  winnerObjectiveId: string | null;
  dominantConstraint: string | null;
  resourceConflict: { objectiveId: string; reason: string }[] | null;
  totalCandidates: number;
}

export async function runGoalArbitration(
  workspaceId: string,
  actorId: string,
): Promise<RunGoalArbitrationResult> {
  // Fetch all ACTIVE objectives for this workspace with their allocation usage
  const objectives = await db.businessObjective.findMany({
    where: { workspaceId, status: "ACTIVE" },
    include: {
      blockedBy: { select: { id: true } },
      _count: { select: { children: true } },
    },
  });

  // Fetch resource allocation totals per objective
  const allocations = await db.resourceAllocation.groupBy({
    by: ["objectiveId"],
    where: { workspaceId, status: "ALLOCATED" },
    _sum: { allocationAmount: true },
  });

  // Fetch resource pool totals
  const pools = await db.resourcePool.findMany({
    where: { workspaceId, isActive: true },
    select: { totalCapacity: true },
  });

  const totalCapacity = pools.reduce((s: number, p: (typeof pools)[number]) => s + p.totalCapacity, 0);
  const allocationByObjective = new Map(
    allocations.map((a: (typeof allocations)[number]): [string, number] => [a.objectiveId, a._sum.allocationAmount ?? 0]),
  );

  const candidates: ObjectiveCandidate[] = objectives.map((obj: (typeof objectives)[number]) => {
    const daysLeft = deadlineDaysRemaining(obj.deadline);
    const allocated: number = (allocationByObjective.get(obj.id) ?? 0) as number;
    const resourceBudgetUsedPct =
      totalCapacity > 0 ? Math.min(100, Math.round((allocated / totalCapacity) * 100)) : 0;

    // Progress from metric if available, else 0
    const progressPct =
      obj.targetValue && obj.currentValue !== null
        ? Math.min(100, Math.round(((obj.currentValue ?? 0) / obj.targetValue) * 100))
        : 0;

    return {
      objectiveId: obj.id,
      objectiveType: obj.objectiveType as ObjectiveType,
      status: "ACTIVE",
      priorityScore: obj.priorityScore,
      progressPct,
      resourceBudgetUsedPct,
      hasBlockingDependencies: obj.blockedBy.length > 0,
      linkedGoalAligned: obj.linkedGoalId !== null,
      timeHorizon: timeHorizonFromDays(daysLeft),
      deadlineDaysRemaining: daysLeft,
      confidence: 0.7, // default; can be enriched from DecisionConfidenceRecord
      reversible: obj.objectiveType !== "COMPLIANCE",
    };
  });

  const result = arbitrateObjectives(candidates);

  const explanation = explainGoalArbitration({
    winnerObjectiveId: result.winnerObjectiveId,
    dominantConstraint: result.dominantConstraint,
    totalCandidates: candidates.length,
    confidence: result.winnerObjectiveId ? 0.75 : 0.4,
  });

  const record = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const arbitrationRecord = await tx.goalArbitrationRecord.create({
      data: {
        workspaceId,
        candidateIds: candidates.map((c) => c.objectiveId) as Prisma.InputJsonValue,
        winnerObjectiveId: result.winnerObjectiveId ?? null,
        arbitrationResult: result.arbitrationResult as unknown as Prisma.InputJsonValue,
        dominantConstraint: result.dominantConstraint ?? null,
        resourceConflict: result.resourceConflict !== null
            ? result.resourceConflict as unknown as Prisma.InputJsonValue
            : Prisma.JsonNull,
        actorId,
      },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_GOAL_ARBITRATION_RECORDED,
        workspaceId,
        actorId,
        entityType: "GoalArbitrationRecord",
        entityId: arbitrationRecord.id,
        payload: {
          winnerObjectiveId: result.winnerObjectiveId,
          candidateCount: candidates.length,
          dominantConstraint: result.dominantConstraint,
        },
      },
      tx,
    );

    return arbitrationRecord;
  });

  // Persist explainability record (best-effort after transaction)
  await persistExplainabilityRecord(
    workspaceId,
    actorId,
    explanation,
  ).catch(() => null);

  return {
    arbitrationRecordId: record.id,
    winnerObjectiveId: result.winnerObjectiveId,
    dominantConstraint: result.dominantConstraint,
    resourceConflict: result.resourceConflict,
    totalCandidates: candidates.length,
  };
}

export async function getLatestArbitrationRecord(workspaceId: string) {
  return db.goalArbitrationRecord.findFirst({
    where: { workspaceId },
    orderBy: { arbitratedAt: "desc" },
  });
}
