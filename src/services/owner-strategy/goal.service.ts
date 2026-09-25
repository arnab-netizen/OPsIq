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
import { NotFoundError, ValidationError } from "@/infra/errors";
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
  baselineAmount: number | null;
  status: string;
  /** Read-time derivation: an ACTIVE goal whose target date has passed. The stored status is not mutated. */
  isOverdue: boolean;
  createdAt: Date;
}

/**
 * Resolve the currency of a workspace-level goal: the explicit record currency
 * when supplied, otherwise the single currency shared by the workspace's active
 * businesses. Never falls back to a hard-coded currency — when the businesses
 * use more than one currency (or none exist) the owner must choose explicitly.
 */
export async function resolveGoalCurrency(workspaceId: string, requested?: string): Promise<string> {
  if (requested) return requested.toUpperCase();
  const businesses = (await db.ownerBusiness.findMany({
    where: { workspaceId, isActive: true, isFixtureBusiness: false },
    select: { currency: true },
  })) as Array<{ currency: string }>;
  const currencies = Array.from(new Set(businesses.map((b) => b.currency.trim().toUpperCase())));
  // Only a valid 3-letter code may be inherited (the same rule the route applies to an explicit code).
  if (currencies.length === 1 && /^[A-Z]{3}$/.test(currencies[0])) return currencies[0];
  throw new ValidationError(
    currencies.length === 0
      ? "Choose the goal currency — add a business first or enter a currency code."
      : "Choose the goal currency — your businesses use more than one currency.",
    { fieldErrors: [{ path: "targetCurrency", message: "Currency is required" }] }
  );
}

/** Create a new ACTIVE goal. Marks any existing ACTIVE goal for this workspace as REVISED. */
export async function createGoal(input: CreateGoalInput): Promise<string> {
  const goalId = randomUUID();
  // A newly declared goal is a forward commitment. Past targets are rejected
  // here (service boundary) as well as in the route schema.
  if (input.targetDate.getTime() <= Date.now()) {
    throw new ValidationError("Target date must be in the future.", {
      fieldErrors: [{ path: "targetDate", message: "Target date must be in the future" }],
    });
  }
  const targetCurrency = await resolveGoalCurrency(input.workspaceId, input.targetCurrency);

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
        targetCurrency,
        targetDate: input.targetDate,
        baselineAmount: input.baselineAmount ?? null,
        baselineDate: input.baselineDate ?? null,
        status: "ACTIVE",
        updatedAt: new Date(),
      },
    });

    // Audit inside transaction: a failed audit rolls back the goal creation (CAT 2 fix).
    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_GOAL_CREATED,
        actorId: input.actorId,
        workspaceId: input.workspaceId,
        entityType: "OwnerGoal",
        entityId: goalId,
        payload: { targetType: input.targetType, targetAmount: input.targetAmount, targetCurrency, targetDate: input.targetDate },
      },
      tx
    );
  });

  return goalId;
}

/** Mark a goal as achieved. */
export async function markGoalAchieved(goalId: string, workspaceId: string, actorId: string): Promise<void> {
  const goal = await db.ownerGoal.findFirst({ where: { id: goalId, workspaceId } });
  if (!goal) throw new NotFoundError("OwnerGoal", goalId);

  // Atomic: update + audit in one transaction (fail-closed).
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.ownerGoal.update({
      where: { id: goalId },
      data: { status: "ACHIEVED", updatedAt: new Date() },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_GOAL_ACHIEVED,
        actorId,
        workspaceId,
        entityType: "OwnerGoal",
        entityId: goalId,
        payload: {},
      },
      tx
    );
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
    baselineAmount: goal.baselineAmount ?? null,
    status: goal.status,
    isOverdue: goal.status === "ACTIVE" && goal.targetDate.getTime() < Date.now(),
    createdAt: goal.createdAt,
  };
}

/** Compute trajectory for the active goal using trailing OwnerMetricSnapshots. */
export async function computeActiveGoalTrajectory(workspaceId: string) {
  const goal = await getActiveGoal(workspaceId);
  if (!goal) return null;

  type SnapshotRow = {
    businessId: string;
    periodStart: Date;
    periodEnd: Date;
    revenue: number | null;
    netProfit: number | null;
  };

  // Newest 12 periods in the goal's currency (then oldest-first for the engine).
  // Values recorded in another currency are never mixed into the series.
  const newestFirst = (await db.ownerMetricSnapshot.findMany({
    // Case-insensitive: snapshot currency is stored as entered. Only active, non-fixture businesses.
    where: {
      workspaceId,
      currency: { equals: goal.targetCurrency, mode: "insensitive" },
      business: { isActive: true, isFixtureBusiness: false },
    },
    select: { businessId: true, periodStart: true, periodEnd: true, revenue: true, netProfit: true },
    orderBy: { periodStart: "desc" },
    take: 12,
  })) as SnapshotRow[];
  const snapshots = [...newestFirst].reverse();

  // The goal is workspace-level. Per-business snapshots cannot be combined into
  // one series without per-period workspace totals, so a series spanning more
  // than one business is not projected (reported as insufficient data).
  const businessCount = new Set(snapshots.map((s) => s.businessId)).size;
  const periods: TrailingPeriod[] =
    businessCount > 1
      ? []
      : snapshots.map((s) => ({
          periodStart: s.periodStart,
          periodEnd: s.periodEnd,
          revenue: s.revenue,
          netProfit: s.netProfit,
        }));

  const trajectory = computeGoalTrajectory({
    targetType: goal.targetType as "PROFIT" | "REVENUE" | "NET_WORTH" | "MULTIPLE",
    targetAmount: goal.targetAmount,
    targetDate: goal.targetDate,
    baselineAmount: goal.baselineAmount,
    periods,
  });

  if (businessCount > 1) {
    trajectory.confidenceRationale = [
      trajectory.confidenceRationale,
      `recorded results come from ${businessCount} businesses — a workspace goal needs one combined series`,
    ]
      .filter(Boolean)
      .join("; ");
  }

  return { goal, trajectory };
}
