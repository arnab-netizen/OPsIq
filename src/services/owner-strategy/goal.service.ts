/**
 * Phase 5: Owner Goal Persistence Service
 *
 * Owner declares a financial target. Only ACTIVE goals per workspace are used
 * for trajectory computation. Owner must approve goal changes (no silent mutation
 * of an active goal — revision creates a new goal and marks the old one REVISED).
 * Workspace isolation enforced at every query.
 */

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import type { Prisma } from "@/generated/prisma/client";
import { computeGoalTrajectory } from "./goal-trajectory.service";
import type { TrailingPeriod } from "./goal-trajectory.service";

export interface CreateGoalInput {
  workspaceId: string;
  actorId: string;
  targetType: "PROFIT" | "REVENUE" | "NET_WORTH" | "MULTIPLE";
  targetAmount: number;
  targetCurrency?: string;
  targetDate: Date;
  baselineAmount?: number | null;
  baselineDate?: Date | null;
}

export interface GoalSummary {
  id: string;
  workspaceId: string;
  targetType: string;
  targetAmount: number;
  targetCurrency: string;
  targetDate: Date;
  status: string;
  createdAt: Date;
}

/** Create a new ACTIVE goal. Marks any existing ACTIVE goal for this workspace as REVISED. */
export async function createGoal(input: CreateGoalInput): Promise<string> {
  const goalId = randomUUID();

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Mark any current active goal as REVISED
    await tx.ownerGoal.updateMany({
      where: { workspaceId: input.workspaceId, status: "ACTIVE" },
      data: { status: "REVISED", updatedAt: new Date() },
    });

    await tx.ownerGoal.create({
      data: {
        id: goalId,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        targetType: input.targetType,
        targetAmount: input.targetAmount,
        targetCurrency: input.targetCurrency ?? "USD",
        targetDate: input.targetDate,
        baselineAmount: input.baselineAmount ?? null,
        baselineDate: input.baselineDate ?? null,
        status: "ACTIVE",
        updatedAt: new Date(),
      },
    });
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_GOAL_CREATED,
    actorId: input.actorId,
    workspaceId: input.workspaceId,
    entityType: "OwnerGoal",
    entityId: goalId,
    payload: { targetType: input.targetType, targetAmount: input.targetAmount, targetDate: input.targetDate },
  });

  return goalId;
}

/** Mark a goal as achieved. */
export async function markGoalAchieved(goalId: string, workspaceId: string, actorId: string): Promise<void> {
  const goal = await db.ownerGoal.findFirst({ where: { id: goalId, workspaceId } });
  if (!goal) throw new NotFoundError("OwnerGoal", goalId);

  await db.ownerGoal.update({
    where: { id: goalId },
    data: { status: "ACHIEVED", updatedAt: new Date() },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_GOAL_ACHIEVED,
    actorId,
    workspaceId,
    entityType: "OwnerGoal",
    entityId: goalId,
    payload: {},
  });
}

/** Get the active goal for a workspace, or null if none. */
export async function getActiveGoal(workspaceId: string): Promise<GoalSummary | null> {
  const goal = await db.ownerGoal.findFirst({
    where: { workspaceId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (!goal) return null;

  return {
    id: goal.id,
    workspaceId: goal.workspaceId,
    targetType: goal.targetType,
    targetAmount: goal.targetAmount,
    targetCurrency: goal.targetCurrency,
    targetDate: goal.targetDate,
    status: goal.status,
    createdAt: goal.createdAt,
  };
}

/** Compute trajectory for the active goal using trailing OwnerMetricSnapshots. */
export async function computeActiveGoalTrajectory(workspaceId: string) {
  const goal = await getActiveGoal(workspaceId);
  if (!goal) return null;

  type SnapshotRow = {
    periodStart: Date;
    periodEnd: Date;
    revenue: number | null;
    netProfit: number | null;
  };

  const snapshots = (await db.ownerMetricSnapshot.findMany({
    where: { workspaceId },
    select: { periodStart: true, periodEnd: true, revenue: true, netProfit: true },
    orderBy: { periodStart: "asc" },
    take: 12,
  })) as SnapshotRow[];

  const periods: TrailingPeriod[] = snapshots.map((s) => ({
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    revenue: s.revenue,
    netProfit: s.netProfit,
  }));

  const trajectory = computeGoalTrajectory({
    targetType: goal.targetType as "PROFIT" | "REVENUE" | "NET_WORTH" | "MULTIPLE",
    targetAmount: goal.targetAmount,
    targetDate: goal.targetDate,
    periods,
  });

  return { goal, trajectory };
}
