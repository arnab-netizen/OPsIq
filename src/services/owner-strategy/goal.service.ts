/**
 * Owner Goal service — business-scoped goals.
 *
 * Scope contract (prisma/schema.prisma OwnerGoal.businessId):
 * - New goals always belong to exactly one active, real business in the caller's workspace. The
 *   business is the explicit `businessId` in the request — never inferred from a selected business.
 * - `businessId = null` is an EXPLICIT legacy workspace goal (created before goals were business-
 *   scoped). Legacy goals stay readable; an owner may assign one to a business, which REVISES it and
 *   creates a successor. No new workspace goals are created: without consolidated reporting and FX
 *   conversion a multi-business financial target cannot be tracked.
 * - At most one ACTIVE goal per business and one ACTIVE legacy goal per workspace, enforced by the
 *   database (partial unique indexes). A concurrent duplicate surfaces as a ConflictError (409).
 * - A replaced goal is never mutated in scope: it becomes REVISED with `supersededById` pointing at
 *   its successor, and OWNER_GOAL_REVISED records old goal, new goal, both scopes and the reason.
 * - Currency is the business's currency (not an owner choice); values in any other currency are
 *   excluded from the trajectory and reported, never converted or combined.
 */

import { completedSnapshotWhere } from "@/services/owner-spine/current-diagnosis-cycle";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";
import type { Prisma } from "@/generated/prisma/client";
import { hasAnyRealBusiness, hasExactlyOneRealBusiness } from "@/services/founder-recovery/business.service";
import { computeGoalTrajectory } from "./goal-trajectory.service";
import type { GoalTrajectoryResult, TrailingPeriod } from "./goal-trajectory.service";

export type GoalTargetType = "PROFIT" | "REVENUE" | "NET_WORTH" | "MULTIPLE";
/** Target types a NEW goal may use: the metrics OpsIQ actually records per business. */
export const NEW_GOAL_TARGET_TYPES = ["REVENUE", "PROFIT"] as const;
export type NewGoalTargetType = (typeof NEW_GOAL_TARGET_TYPES)[number];
export type GoalScope = "business" | "workspace";

const GOAL_CONFLICT_MESSAGE = "Another goal was saved for this business at the same time. Refresh and try again.";

export interface CreateGoalInput {
  workspaceId: string;
  actorId: string;
  businessId: string;
  targetType: NewGoalTargetType;
  targetAmount: number;
  /** Optional echo of the business currency; any other value is rejected (currency is not an owner choice). */
  targetCurrency?: string;
  targetDate: Date;
  baselineAmount?: number | null;
  baselineDate?: Date | null;
}

export interface AssignLegacyGoalInput {
  workspaceId: string;
  actorId: string;
  legacyGoalId: string;
  businessId: string;
}

export interface GoalSummary {
  id: string;
  workspaceId: string;
  /** null = explicit legacy workspace goal. */
  businessId: string | null;
  scope: GoalScope;
  businessName: string | null;
  /** false = the goal's business is archived; null for workspace goals. */
  businessActive: boolean | null;
  targetType: string;
  targetAmount: number;
  targetCurrency: string;
  targetDate: Date;
  baselineAmount: number | null;
  status: string;
  /** Read-time derivation: an ACTIVE goal whose target date has passed. The stored status is not mutated. */
  isOverdue: boolean;
  supersededById: string | null;
  createdAt: Date;
}

type GoalRow = {
  id: string;
  workspaceId: string;
  businessId: string | null;
  targetType: string;
  targetAmount: number;
  targetCurrency: string;
  targetDate: Date;
  baselineAmount: number | null;
  status: string;
  supersededById: string | null;
  createdAt: Date;
  business?: { name: string; isActive: boolean } | null;
};

const GOAL_SELECT = {
  id: true,
  workspaceId: true,
  businessId: true,
  targetType: true,
  targetAmount: true,
  targetCurrency: true,
  targetDate: true,
  baselineAmount: true,
  status: true,
  supersededById: true,
  createdAt: true,
  business: { select: { name: true, isActive: true } },
} as const;

function toSummary(goal: GoalRow): GoalSummary {
  return {
    id: goal.id,
    workspaceId: goal.workspaceId,
    businessId: goal.businessId,
    scope: goal.businessId ? "business" : "workspace",
    businessName: goal.business?.name ?? null,
    businessActive: goal.businessId ? (goal.business?.isActive ?? null) : null,
    targetType: goal.targetType,
    targetAmount: goal.targetAmount,
    targetCurrency: goal.targetCurrency,
    targetDate: goal.targetDate,
    baselineAmount: goal.baselineAmount ?? null,
    status: goal.status,
    isOverdue: goal.status === "ACTIVE" && goal.targetDate.getTime() < Date.now(),
    supersededById: goal.supersededById ?? null,
    createdAt: goal.createdAt,
  };
}

/** Prisma unique-constraint violation (P2002), including via the pg driver adapter. */
function isUniqueViolation(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { code?: unknown; cause?: { code?: unknown; originalCode?: unknown }; meta?: { driverAdapterError?: { cause?: { originalCode?: unknown; kind?: unknown } } } };
  if (err.code === "P2002") return true;
  if (err.cause?.code === "23505" || err.cause?.originalCode === "23505") return true;
  const adapterCause = err.meta?.driverAdapterError?.cause;
  return adapterCause?.originalCode === "23505" || adapterCause?.kind === "UniqueConstraintViolation";
}

export interface EligibleBusiness {
  id: string;
  name: string;
  currency: string;
}

/**
 * The business a goal is written for: must exist in the caller's workspace (else 404 — a foreign
 * id is indistinguishable from a missing one), be active (not archived) and be a real business.
 */
export async function requireGoalEligibleBusiness(workspaceId: string, businessId: string): Promise<EligibleBusiness> {
  const business = (await db.ownerBusiness.findFirst({
    where: { id: businessId, workspaceId },
    select: { id: true, name: true, currency: true, isActive: true, isFixtureBusiness: true },
  })) as { id: string; name: string; currency: string; isActive: boolean; isFixtureBusiness: boolean } | null;
  if (!business) throw new NotFoundError("OwnerBusiness", businessId);
  if (!business.isActive) {
    throw new ValidationError(`${business.name} is archived — goals can't be set for an archived business.`, {
      fieldErrors: [{ path: "businessId", message: "Business is archived" }],
    });
  }
  if (business.isFixtureBusiness) {
    throw new ValidationError("Goals can't be set for a test business.", {
      fieldErrors: [{ path: "businessId", message: "Test businesses can't have goals" }],
    });
  }
  const currency = business.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ValidationError(`Set a valid currency for ${business.name} before adding a goal.`, {
      fieldErrors: [{ path: "businessId", message: "Business currency is not set" }],
    });
  }
  return { id: business.id, name: business.name, currency };
}

function assertNewTargetType(targetType: string): asserts targetType is NewGoalTargetType {
  if (!(NEW_GOAL_TARGET_TYPES as readonly string[]).includes(targetType)) {
    throw new ValidationError("New goals can track Revenue or Net profit — the results OpsIQ records for each business.", {
      fieldErrors: [{ path: "targetType", message: "Choose Revenue or Net profit" }],
    });
  }
}

function assertFutureDate(targetDate: Date): void {
  if (!Number.isFinite(targetDate.getTime()) || targetDate.getTime() <= Date.now()) {
    throw new ValidationError("Target date must be in the future.", {
      fieldErrors: [{ path: "targetDate", message: "Target date must be in the future" }],
    });
  }
}

interface Predecessor {
  id: string;
  scope: GoalScope;
  reason: string;
}

/**
 * Revise predecessors (REVISED + supersededById → successor) then create the successor, with an
 * audit event per transition, in the caller's transaction. A predecessor that is no longer ACTIVE
 * means a concurrent writer got there first → ConflictError.
 */
async function reviseAndCreate(
  tx: Prisma.TransactionClient,
  args: {
    goalId: string;
    workspaceId: string;
    actorId: string;
    businessId: string;
    predecessors: Predecessor[];
    data: {
      targetType: string;
      targetAmount: number;
      targetCurrency: string;
      targetDate: Date;
      baselineAmount: number | null;
      baselineDate: Date | null;
    };
    via: "create" | "legacy_assignment";
  }
): Promise<void> {
  const now = new Date();
  for (const p of args.predecessors) {
    const revised = await tx.ownerGoal.updateMany({
      where: { id: p.id, workspaceId: args.workspaceId, status: "ACTIVE" },
      data: { status: "REVISED", supersededById: args.goalId, updatedAt: now },
    });
    if (revised.count !== 1) throw new ConflictError(GOAL_CONFLICT_MESSAGE);
  }

  await tx.ownerGoal.create({
    data: {
      id: args.goalId,
      workspaceId: args.workspaceId,
      businessId: args.businessId,
      actorId: args.actorId,
      ...args.data,
      status: "ACTIVE",
      updatedAt: now,
    },
  });

  // Audit inside the transaction: a failed audit rolls the goal change back.
  await emitAuditEvent(
    {
      eventName: AUDIT_EVENTS.OWNER_GOAL_CREATED,
      actorId: args.actorId,
      workspaceId: args.workspaceId,
      entityType: "OwnerGoal",
      entityId: args.goalId,
      payload: {
        scope: "business",
        businessId: args.businessId,
        targetType: args.data.targetType,
        targetAmount: args.data.targetAmount,
        targetCurrency: args.data.targetCurrency,
        targetDate: args.data.targetDate,
        via: args.via,
        supersedesGoalIds: args.predecessors.map((p) => p.id),
      },
    },
    tx
  );
  for (const p of args.predecessors) {
    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_GOAL_REVISED,
        actorId: args.actorId,
        workspaceId: args.workspaceId,
        entityType: "OwnerGoal",
        entityId: p.id,
        payload: {
          oldGoalId: p.id,
          newGoalId: args.goalId,
          previousScope: p.scope,
          previousBusinessId: p.scope === "business" ? args.businessId : null,
          newScope: "business",
          businessId: args.businessId,
          reason: p.reason,
        },
      },
      tx
    );
  }
}

/**
 * Create a new ACTIVE goal for one business. Revises that business's current ACTIVE goal only —
 * never another business's goal. Single-business exception: when the workspace has exactly one
 * real active business (this one), an ACTIVE legacy workspace goal is revised too, so two competing
 * "current" goals never remain.
 */
export async function createGoal(input: CreateGoalInput): Promise<string> {
  assertNewTargetType(input.targetType);
  assertFutureDate(input.targetDate);
  if (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0) {
    throw new ValidationError("Target amount must be a positive number.", {
      fieldErrors: [{ path: "targetAmount", message: "Enter a positive amount" }],
    });
  }
  const business = await requireGoalEligibleBusiness(input.workspaceId, input.businessId);
  if (input.targetCurrency && input.targetCurrency.trim().toUpperCase() !== business.currency) {
    throw new ValidationError(`Goal currency is ${business.name}'s currency (${business.currency}).`, {
      fieldErrors: [{ path: "targetCurrency", message: `Must be ${business.currency}` }],
    });
  }
  const soleRealBusiness = await hasExactlyOneRealBusiness(input.workspaceId);
  const goalId = randomUUID();

  try {
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const predecessors: Predecessor[] = [];
      const current = await tx.ownerGoal.findFirst({
        where: { workspaceId: input.workspaceId, businessId: business.id, status: "ACTIVE" },
        select: { id: true },
      });
      if (current) predecessors.push({ id: current.id, scope: "business", reason: "replaced_by_new_business_goal" });
      if (soleRealBusiness) {
        const legacy = await tx.ownerGoal.findFirst({
          where: { workspaceId: input.workspaceId, businessId: null, status: "ACTIVE" },
          select: { id: true },
        });
        if (legacy) {
          predecessors.push({ id: legacy.id, scope: "workspace", reason: "legacy_workspace_goal_replaced_by_sole_business_goal" });
        }
      }
      await reviseAndCreate(tx, {
        goalId,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        businessId: business.id,
        predecessors,
        data: {
          targetType: input.targetType,
          targetAmount: input.targetAmount,
          targetCurrency: business.currency,
          targetDate: input.targetDate,
          baselineAmount: input.baselineAmount ?? null,
          baselineDate: input.baselineDate ?? null,
        },
        via: "create",
      });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictError(GOAL_CONFLICT_MESSAGE);
    throw e;
  }
  return goalId;
}

/**
 * Owner-confirmed assignment of an ACTIVE legacy workspace goal to one business. The legacy row is
 * never re-scoped in place: it becomes REVISED (supersededById → successor) and a business goal with
 * the same target is created. Refused (never converted) when the goal cannot be carried over as-is.
 */
export async function assignLegacyGoalToBusiness(input: AssignLegacyGoalInput): Promise<string> {
  const legacy = (await db.ownerGoal.findFirst({
    where: { id: input.legacyGoalId, workspaceId: input.workspaceId, businessId: null },
  })) as (GoalRow & { baselineDate: Date | null }) | null;
  if (!legacy) throw new NotFoundError("OwnerGoal", input.legacyGoalId);
  if (legacy.status !== "ACTIVE") throw new ConflictError("This workspace goal is no longer active.");
  const business = await requireGoalEligibleBusiness(input.workspaceId, input.businessId);
  if (!(NEW_GOAL_TARGET_TYPES as readonly string[]).includes(legacy.targetType)) {
    throw new ValidationError(
      `This goal tracks ${legacy.targetType === "NET_WORTH" ? "net worth" : "a business multiple"}, which OpsIQ doesn't record for a business. Create a new Revenue or Net profit goal for ${business.name} instead.`,
      { fieldErrors: [{ path: "legacyGoalId", message: "Target type can't be carried over" }] }
    );
  }
  if (legacy.targetCurrency.trim().toUpperCase() !== business.currency) {
    throw new ValidationError(
      `This goal is in ${legacy.targetCurrency} but ${business.name} reports in ${business.currency}. OpsIQ doesn't convert currencies — create a new goal for ${business.name} instead.`,
      { fieldErrors: [{ path: "businessId", message: "Currency differs from the goal" }] }
    );
  }
  if (legacy.targetDate.getTime() <= Date.now()) {
    throw new ValidationError(`This goal's target date has passed. Create a new goal for ${business.name} instead.`, {
      fieldErrors: [{ path: "legacyGoalId", message: "Target date has passed" }],
    });
  }

  const goalId = randomUUID();
  try {
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.ownerGoal.findFirst({
        where: { workspaceId: input.workspaceId, businessId: business.id, status: "ACTIVE" },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictError(`${business.name} already has an active goal. Keep it, or replace it by creating a new goal.`);
      }
      await reviseAndCreate(tx, {
        goalId,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        businessId: business.id,
        predecessors: [{ id: legacy.id, scope: "workspace", reason: "legacy_workspace_goal_assigned_to_business" }],
        data: {
          targetType: legacy.targetType,
          targetAmount: legacy.targetAmount,
          targetCurrency: business.currency,
          targetDate: legacy.targetDate,
          baselineAmount: legacy.baselineAmount ?? null,
          baselineDate: legacy.baselineDate ?? null,
        },
        via: "legacy_assignment",
      });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictError(GOAL_CONFLICT_MESSAGE);
    throw e;
  }
  return goalId;
}

/** Mark an ACTIVE goal as achieved (a REVISED or already-ACHIEVED goal is never changed). */
export async function markGoalAchieved(goalId: string, workspaceId: string, actorId: string): Promise<void> {
  const goal = await db.ownerGoal.findFirst({ where: { id: goalId, workspaceId } });
  if (!goal) throw new NotFoundError("OwnerGoal", goalId);

  // Atomic: guarded update + audit in one transaction (fail-closed).
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const achieved = await tx.ownerGoal.updateMany({
      where: { id: goalId, workspaceId, status: "ACTIVE" },
      data: { status: "ACHIEVED", updatedAt: new Date() },
    });
    if (achieved.count !== 1) throw new ConflictError("Only an active goal can be marked achieved.");

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_GOAL_ACHIEVED,
        actorId,
        workspaceId,
        entityType: "OwnerGoal",
        entityId: goalId,
        payload: { scope: goal.businessId ? "business" : "workspace", businessId: goal.businessId ?? null, previousStatus: "ACTIVE" },
      },
      tx
    );
  });
}

/** The ACTIVE goal of one business (never another business's, never the legacy workspace goal). */
export async function getActiveBusinessGoal(workspaceId: string, businessId: string): Promise<GoalSummary | null> {
  const goal = (await db.ownerGoal.findFirst({
    where: { workspaceId, businessId, status: "ACTIVE" },
    select: GOAL_SELECT,
  })) as GoalRow | null;
  return goal ? toSummary(goal) : null;
}

/** The ACTIVE explicit legacy workspace goal (businessId = null), if any. */
export async function getActiveLegacyGoal(workspaceId: string): Promise<GoalSummary | null> {
  const goal = (await db.ownerGoal.findFirst({
    where: { workspaceId, businessId: null, status: "ACTIVE" },
    select: GOAL_SELECT,
  })) as GoalRow | null;
  return goal ? toSummary(goal) : null;
}

/** Past (non-ACTIVE) goals of one business, newest first — history stays inspectable, incl. archived businesses. */
export async function listBusinessGoalHistory(workspaceId: string, businessId: string, take = 10): Promise<GoalSummary[]> {
  const rows = (await db.ownerGoal.findMany({
    where: { workspaceId, businessId, status: { not: "ACTIVE" } },
    select: GOAL_SELECT,
    orderBy: { createdAt: "desc" },
    take,
  })) as GoalRow[];
  return rows.map(toSummary);
}

// ─── Trajectory ──────────────────────────────────────────────────────────────

/** What a goal's progress is measured on. NET_WORTH / MULTIPLE are not measured by OpsIQ at all. */
export type GoalMetricBasis = "revenue" | "net_profit" | "not_measured";

export function goalMetricBasis(targetType: string): GoalMetricBasis {
  if (targetType === "REVENUE") return "revenue";
  if (targetType === "PROFIT") return "net_profit";
  return "not_measured";
}

export interface GoalTrajectoryView {
  goal: GoalSummary;
  trajectory: GoalTrajectoryResult;
  metricBasis: GoalMetricBasis;
  /** Set when no projection is shown and why (never a guessed number). */
  unavailableReason: string | null;
  /** The periods the trajectory actually used. */
  dataWindow: { from: Date; to: Date; periods: number } | null;
  /** Recorded results left out because they are in a different currency than the goal. */
  excludedSnapshotCount: number;
  excludedReason: string | null;
}

type SnapshotRow = { businessId: string; periodStart: Date; periodEnd: Date; revenue: number | null; netProfit: number | null };

function emptyTrajectory(goal: GoalSummary): GoalTrajectoryResult {
  return computeGoalTrajectory({
    targetType: goal.targetType as GoalTargetType,
    targetAmount: goal.targetAmount,
    targetDate: goal.targetDate,
    baselineAmount: goal.baselineAmount,
    periods: [],
  });
}

/**
 * Trajectory for one goal. A business goal uses only that business's snapshots in the goal's
 * currency; a legacy workspace goal uses the workspace's snapshots in its currency and is not
 * projected when they span more than one business (no consolidation exists). Values in another
 * currency are counted as excluded, never converted.
 */
export async function computeGoalTrajectoryView(goal: GoalSummary): Promise<GoalTrajectoryView> {
  const metricBasis = goalMetricBasis(goal.targetType);
  const scopeWhere = goal.businessId
    ? { workspaceId: goal.workspaceId, businessId: goal.businessId }
    : { workspaceId: goal.workspaceId, business: { isActive: true, isFixtureBusiness: false } };
  const currencyMatch = { equals: goal.targetCurrency, mode: "insensitive" as const };

  const excludedSnapshotCount = (await db.ownerMetricSnapshot.count({
    where: { ...scopeWhere, NOT: { currency: currencyMatch } },
  })) as number;
  const excludedReason =
    excludedSnapshotCount > 0
      ? `${excludedSnapshotCount} recorded result${excludedSnapshotCount === 1 ? " is" : "s are"} in a different currency than this ${goal.targetCurrency} goal and ${excludedSnapshotCount === 1 ? "is" : "are"} not included (OpsIQ does not convert currencies).`
      : null;

  if (metricBasis === "not_measured") {
    return {
      goal,
      trajectory: emptyTrajectory(goal),
      metricBasis,
      unavailableReason: `OpsIQ does not measure ${goal.targetType === "NET_WORTH" ? "net worth" : "a business multiple"}, so this goal is not projected. Recorded revenue or profit is not the same measure.`,
      dataWindow: null,
      excludedSnapshotCount,
      excludedReason,
    };
  }

  // A legacy workspace goal describes one business only when the workspace has exactly one real
  // business. Decided on the business count, never on which snapshots happen to match: filtering
  // by currency (or a business without results yet) must not turn one business's results into the
  // workspace's (hostile-review P1).
  if (!goal.businessId && !(await hasExactlyOneRealBusiness(goal.workspaceId))) {
    return {
      goal,
      trajectory: emptyTrajectory(goal),
      metricBasis,
      unavailableReason: (await hasAnyRealBusiness(goal.workspaceId))
        ? "Your workspace has several businesses. A workspace goal can't be tracked without consolidated reporting, which OpsIQ does not have yet — assign this goal to one business to track it."
        : "Your workspace has no active business, so this workspace goal can't be tracked. Add or reactivate a business, then assign the goal to it.",
      dataWindow: null,
      excludedSnapshotCount,
      excludedReason,
    };
  }

  // Newest 12 periods in the goal's currency (then oldest-first for the engine).
  // Completed periods only (current-diagnosis-cycle.ts): an in-progress partial period is never a trajectory
  // point, and a period that has not started never counts.
  const newestFirst = (await db.ownerMetricSnapshot.findMany({
    where: { ...scopeWhere, currency: currencyMatch, ...completedSnapshotWhere(new Date()) },
    select: { businessId: true, periodStart: true, periodEnd: true, revenue: true, netProfit: true },
    orderBy: { periodStart: "desc" },
    take: 12,
  })) as SnapshotRow[];
  const snapshots = [...newestFirst].reverse();

  const periods: TrailingPeriod[] = snapshots.map((s) => ({
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    revenue: s.revenue,
    netProfit: s.netProfit,
  }));
  const trajectory = computeGoalTrajectory({
    targetType: goal.targetType as GoalTargetType,
    targetAmount: goal.targetAmount,
    targetDate: goal.targetDate,
    baselineAmount: goal.baselineAmount,
    periods,
  });
  return {
    goal,
    trajectory,
    metricBasis,
    unavailableReason: null,
    dataWindow:
      snapshots.length > 0
        ? { from: snapshots[0].periodStart, to: snapshots[snapshots.length - 1].periodEnd, periods: snapshots.length }
        : null,
    excludedSnapshotCount,
    excludedReason,
  };
}

export interface HomeGoalResolution {
  /** The goal Home shows for the selected business, with its trajectory; null = none applies. */
  view: GoalTrajectoryView | null;
  /** "Business goal · <name>" | "Workspace goal" | "No goal set for <name>". */
  scopeLabel: string;
}

/**
 * Which goal belongs on a business-specific Home. The selected business's own ACTIVE goal; else a
 * legacy workspace goal only when the workspace has exactly one real business (then workspace and
 * business are the same set) — in a multi-business workspace a legacy goal is never shown as if it
 * belonged to the selected business (same rule as workspace-wide risks on Home).
 */
export async function resolveHomeGoal(workspaceId: string, selectedBusinessId: string | null): Promise<HomeGoalResolution> {
  let selectedName: string | null = null;
  if (selectedBusinessId) {
    const selected = (await db.ownerBusiness.findFirst({
      where: { id: selectedBusinessId, workspaceId },
      select: { name: true, isActive: true, isFixtureBusiness: true },
    })) as { name: string; isActive: boolean; isFixtureBusiness: boolean } | null;
    if (!selected) return { view: null, scopeLabel: "No goal set" };
    selectedName = selected.name;
    const own = await getActiveBusinessGoal(workspaceId, selectedBusinessId);
    if (own) {
      const archived = selected.isActive ? "" : " (archived business)";
      return { view: await computeGoalTrajectoryView(own), scopeLabel: `Business goal · ${selected.name}${archived}` };
    }
    if (!selected.isActive || selected.isFixtureBusiness) {
      return { view: null, scopeLabel: `No goal set for ${selected.name}` };
    }
  }
  const legacy = await getActiveLegacyGoal(workspaceId);
  if (legacy && (await hasExactlyOneRealBusiness(workspaceId))) {
    return { view: await computeGoalTrajectoryView(legacy), scopeLabel: "Workspace goal" };
  }
  return { view: null, scopeLabel: selectedName ? `No goal set for ${selectedName}` : "No goal set" };
}

// ─── Objective ↔ goal links ──────────────────────────────────────────────────

/**
 * Validate a BusinessObjective.linkedGoalId on write: the goal must be in the same workspace, ACTIVE
 * (a replaced goal is refused and its current successor named), and in the objective's scope — a
 * business objective links only its own business's goal; a workspace objective only the legacy
 * workspace goal.
 */
/** Minimal read surface: the global client or the caller's transaction client. */
type GoalReadClient = Pick<Prisma.TransactionClient, "ownerGoal">;

export async function assertObjectiveGoalLink(
  workspaceId: string,
  objectiveBusinessId: string | null,
  linkedGoalId: string,
  // Inside a caller's transaction, pass its client: with a single-connection pool a read through
  // the global client would wait on the transaction's own connection (self-deadlock).
  client: GoalReadClient = db
): Promise<void> {
  const goal = (await client.ownerGoal.findFirst({
    where: { id: linkedGoalId, workspaceId },
    select: { id: true, businessId: true, status: true, supersededById: true },
  })) as { id: string; businessId: string | null; status: string; supersededById: string | null } | null;
  if (!goal) throw new NotFoundError("OwnerGoal", linkedGoalId);
  if (goal.status !== "ACTIVE") {
    const successor = goal.status === "REVISED" ? await resolveCurrentGoalId(workspaceId, goal.id, client) : null;
    throw new ValidationError(
      successor ? "That goal has been replaced. Link its current goal instead." : "Only an active goal can be linked.",
      { fieldErrors: [{ path: "linkedGoalId", message: successor ? `Replaced by goal ${successor}` : "Goal is not active" }] }
    );
  }
  if ((goal.businessId ?? null) !== (objectiveBusinessId ?? null)) {
    throw new ValidationError(
      objectiveBusinessId
        ? "An objective can only be linked to its own business's goal."
        : "A workspace objective can only be linked to the workspace goal.",
      { fieldErrors: [{ path: "linkedGoalId", message: "Goal belongs to a different scope" }] }
    );
  }
}

/** Follow supersededById from a goal to the current head of its chain (bounded, cycle-safe). */
export async function resolveCurrentGoalId(workspaceId: string, goalId: string, client: GoalReadClient = db): Promise<string | null> {
  const seen = new Set<string>();
  let id: string | null = goalId;
  while (id && !seen.has(id)) {
    seen.add(id);
    const row = (await client.ownerGoal.findFirst({
      where: { id, workspaceId },
      select: { id: true, supersededById: true },
    })) as { id: string; supersededById: string | null } | null;
    if (!row) return null;
    if (!row.supersededById) return row.id;
    id = row.supersededById;
  }
  return null;
}

/**
 * Read-time alignment for objective links (goal arbitration, Home): a link counts as aligned only
 * when it resolves — following successors of replaced goals — to an ACTIVE goal in a compatible
 * scope: the objective's own business; or the legacy workspace goal for a workspace objective, or
 * for a business objective only when the workspace has exactly one real business (the same rule
 * Home uses — in a multi-business workspace a legacy goal describes no single business).
 * Returns the set of objective ids whose link is aligned.
 */
export async function resolveAlignedObjectiveLinks(
  workspaceId: string,
  links: Array<{ objectiveId: string; objectiveBusinessId: string | null; linkedGoalId: string | null }>
): Promise<Set<string>> {
  const aligned = new Set<string>();
  const withLinks = links.filter((l) => l.linkedGoalId);
  if (withLinks.length === 0) return aligned;
  const goals = (await db.ownerGoal.findMany({
    where: { workspaceId },
    select: { id: true, businessId: true, status: true, supersededById: true },
  })) as Array<{ id: string; businessId: string | null; status: string; supersededById: string | null }>;
  const byId = new Map(goals.map((g) => [g.id, g]));
  const legacyDescribesSoleBusiness = await hasExactlyOneRealBusiness(workspaceId);
  for (const link of withLinks) {
    const seen = new Set<string>();
    let goal = byId.get(link.linkedGoalId!);
    while (goal && goal.supersededById && !seen.has(goal.id)) {
      seen.add(goal.id);
      goal = byId.get(goal.supersededById);
    }
    if (!goal || goal.status !== "ACTIVE") continue;
    const sameScope = goal.businessId === link.objectiveBusinessId;
    const legacyCompatible = goal.businessId === null && (link.objectiveBusinessId === null || legacyDescribesSoleBusiness);
    if (sameScope || legacyCompatible) aligned.add(link.objectiveId);
  }
  return aligned;
}

// ─── Goals page overview ─────────────────────────────────────────────────────

export interface GoalsOverview {
  /** The business in scope (null when none was requested). */
  business: { id: string; name: string; currency: string; isActive: boolean; isFixtureBusiness: boolean } | null;
  /** The ACTIVE goal of the business in scope, with its trajectory. */
  goal: GoalTrajectoryView | null;
  /** The ACTIVE legacy workspace goal, if one exists. */
  legacyGoal: GoalTrajectoryView | null;
  /** True only when the workspace has exactly one real business (the legacy goal then describes it). */
  legacyAttributable: boolean;
  /** Past goals of the business in scope, newest first. */
  history: GoalSummary[];
  newGoalTargetTypes: readonly NewGoalTargetType[];
  /** Portfolio/group financial goals need consolidated reporting + FX, which OpsIQ does not have. */
  consolidationSupported: false;
}

export async function getGoalsOverview(workspaceId: string, businessId: string | null): Promise<GoalsOverview> {
  let business: GoalsOverview["business"] = null;
  if (businessId) {
    business = (await db.ownerBusiness.findFirst({
      where: { id: businessId, workspaceId },
      select: { id: true, name: true, currency: true, isActive: true, isFixtureBusiness: true },
    })) as GoalsOverview["business"];
    if (!business) throw new NotFoundError("OwnerBusiness", businessId);
  }
  const own = business ? await getActiveBusinessGoal(workspaceId, business.id) : null;
  const legacy = await getActiveLegacyGoal(workspaceId);
  return {
    business,
    goal: own ? await computeGoalTrajectoryView(own) : null,
    legacyGoal: legacy ? await computeGoalTrajectoryView(legacy) : null,
    legacyAttributable: await hasExactlyOneRealBusiness(workspaceId),
    history: business ? await listBusinessGoalHistory(workspaceId, business.id) : [],
    newGoalTargetTypes: NEW_GOAL_TARGET_TYPES,
    consolidationSupported: false,
  };
}
