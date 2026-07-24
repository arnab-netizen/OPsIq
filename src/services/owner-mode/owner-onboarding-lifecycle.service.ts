/**
 * Bundle 3.8 — Owner Onboarding and Archetype Seeding lifecycle service.
 *
 * Lifecycle: startOnboarding (idempotent create) → completeOnboarding (archetype + action queue;
 * idempotent via completionKey) → triggerReOnboarding (abbreviated re-run on major change).
 *
 * Onboarding gate (assertOnboardingComplete) is used by other owner-mode routes to enforce
 * that onboarding is COMPLETED before allowing owner-mode operations.
 *
 * archetypeScore, completionKey, createdBy, updatedBy are internal only — excluded from DTO.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";

// ─── Status machine ──────────────────────────────────────────────────────────

type OnboardingStatus = "IN_PROGRESS" | "COMPLETED" | "RE_ONBOARDING";
type Archetype = "SURVIVAL_MODE" | "TURNAROUND" | "STABILIZATION" | "GROWTH_READY";

const REVENUE_TRENDS = ["DECLINING", "STABLE", "GROWING"] as const;
const PROFITABILITY_VALUES = ["NEGATIVE", "BREAKEVEN", "POSITIVE"] as const;
const MUTABLE_STATUSES: OnboardingStatus[] = ["IN_PROGRESS", "RE_ONBOARDING"];

function assertRevenueTrend(v: string): asserts v is (typeof REVENUE_TRENDS)[number] {
  if (!(REVENUE_TRENDS as readonly string[]).includes(v)) {
    throw new ValidationError(`Invalid revenueTrend: ${v}. Must be DECLINING | STABLE | GROWING`);
  }
}

function assertProfitability(v: string): asserts v is (typeof PROFITABILITY_VALUES)[number] {
  if (!(PROFITABILITY_VALUES as readonly string[]).includes(v)) {
    throw new ValidationError(`Invalid profitability: ${v}. Must be NEGATIVE | BREAKEVEN | POSITIVE`);
  }
}

// ─── Archetype classification (deterministic, no ML) ─────────────────────────

export function classifyArchetype(
  revenueTrend: string,
  profitability: string,
  cashRunwayWeeks: number | null | undefined,
): { archetype: Archetype; archetypeScore: number } {
  const runway = cashRunwayWeeks ?? 52;

  // Immediate survival threat: negative profitability AND runway < 8 weeks
  if (profitability === "NEGATIVE" && runway < 8) {
    return { archetype: "SURVIVAL_MODE", archetypeScore: 0.1 };
  }

  // Turnaround needed: declining revenue OR ongoing negative profitability with some runway
  if (revenueTrend === "DECLINING" || profitability === "NEGATIVE") {
    return { archetype: "TURNAROUND", archetypeScore: 0.35 };
  }

  // Growth ready: positive momentum and profitability
  if (revenueTrend === "GROWING" && profitability === "POSITIVE") {
    return { archetype: "GROWTH_READY", archetypeScore: 0.9 };
  }

  // Stable, not yet growing — most businesses in this range
  return { archetype: "STABILIZATION", archetypeScore: 0.65 };
}

// ─── Initial action queue (top 5, morale-safe, achievable scope) ─────────────

export function buildInitialActionQueue(archetype: Archetype): string[] {
  switch (archetype) {
    case "SURVIVAL_MODE":
      return [
        "Map all cash outflows and freeze non-essential spend immediately",
        "Contact top 3 customers to protect revenue this week",
        "Negotiate extended payment terms with critical suppliers",
        "Identify one revenue recovery action executable within 7 days",
        "Brief team on stabilization priority and immediate focus",
      ];
    case "TURNAROUND":
      return [
        "Identify and fix the top revenue leakage point",
        "Reduce controllable costs by 10% within 30 days",
        "Rebuild customer confidence with one visible quick win",
        "Align team on turnaround priorities and near-term goals",
        "Review pricing against current cost structure",
      ];
    case "STABILIZATION":
      return [
        "Document and enforce the top 3 operational SOPs",
        "Build an 8-week cash reserve buffer",
        "Identify one recurring process bottleneck causing errors",
        "Establish a weekly performance check-in rhythm",
        "Define the owner delegation path for daily operations",
      ];
    case "GROWTH_READY":
      return [
        "Identify the highest-margin growth opportunity this quarter",
        "Build scalable capacity for projected demand increase",
        "Establish a repeatable customer acquisition process",
        "Assess team capability gaps for the next growth phase",
        "Create a 90-day growth execution plan",
      ];
  }
}

// ─── Public DTO ───────────────────────────────────────────────────────────────

export interface PublicOnboardingDTO {
  id: string;
  workspaceId: string;
  businessId: string;
  ownerId: string;
  status: string;
  businessName: string;
  businessType: string;
  revenueRange: string;
  revenueTrend: string;
  cashRunwayWeeks: number | null;
  profitability: string;
  ownerHoursPerWeek: number | null;
  teamSize: number | null;
  archetype: string | null;
  initialActionQueue: unknown;
  completedAt: string | null;
  reOnboardingReason: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Row type ─────────────────────────────────────────────────────────────────

type OnboardingRow = {
  id: string;
  workspaceId: string;
  businessId: string;
  ownerId: string;
  status: string;
  businessName: string;
  businessType: string;
  revenueRange: string;
  revenueTrend: string;
  cashRunwayWeeks: number | null;
  profitability: string;
  ownerHoursPerWeek: number | null;
  teamSize: number | null;
  archetype: string | null;
  archetypeScore: number | null;
  initialActionQueue: unknown;
  completionKey: string | null;
  completedAt: Date | null;
  reOnboardingReason: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const onboardingSelect = {
  id: true,
  workspaceId: true,
  businessId: true,
  ownerId: true,
  status: true,
  businessName: true,
  businessType: true,
  revenueRange: true,
  revenueTrend: true,
  cashRunwayWeeks: true,
  profitability: true,
  ownerHoursPerWeek: true,
  teamSize: true,
  archetype: true,
  archetypeScore: true,
  initialActionQueue: true,
  completionKey: true,
  completedAt: true,
  reOnboardingReason: true,
  createdBy: true,
  updatedBy: true,
  createdAt: true,
  updatedAt: true,
};

function toPublicDTO(row: OnboardingRow): PublicOnboardingDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    businessId: row.businessId,
    ownerId: row.ownerId,
    status: row.status,
    businessName: row.businessName,
    businessType: row.businessType,
    revenueRange: row.revenueRange,
    revenueTrend: row.revenueTrend,
    cashRunwayWeeks: row.cashRunwayWeeks,
    profitability: row.profitability,
    ownerHoursPerWeek: row.ownerHoursPerWeek,
    teamSize: row.teamSize,
    archetype: row.archetype,
    initialActionQueue: row.initialActionQueue,
    completedAt: row.completedAt?.toISOString() ?? null,
    reOnboardingReason: row.reOnboardingReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    // Excluded: archetypeScore, completionKey, createdBy, updatedBy
  };
}

async function loadOnboarding(workspaceId: string): Promise<OnboardingRow> {
  const row = await db.ownerOnboarding.findFirst({
    where: { workspaceId },
    select: onboardingSelect,
  });
  if (!row) throw new NotFoundError("OwnerOnboarding", workspaceId);
  return row as OnboardingRow;
}

// ─── Start Onboarding ────────────────────────────────────────────────────────

export interface StartOnboardingInput {
  workspaceId: string;
  actorId: string;
  businessId: string;
  ownerId: string;
  businessName: string;
  businessType: string;
  revenueRange: string;
  revenueTrend: string;
  profitability: string;
  cashRunwayWeeks?: number;
  ownerHoursPerWeek?: number;
  teamSize?: number;
}

export async function startOnboarding(input: StartOnboardingInput): Promise<PublicOnboardingDTO> {
  const {
    workspaceId, actorId, businessId, ownerId,
    businessName, businessType, revenueRange, revenueTrend, profitability,
    cashRunwayWeeks, ownerHoursPerWeek, teamSize,
  } = input;

  assertRevenueTrend(revenueTrend);
  assertProfitability(profitability);

  if (!businessName.trim()) throw new ValidationError("businessName is required");
  if (!businessType.trim()) throw new ValidationError("businessType is required");
  if (!revenueRange.trim()) throw new ValidationError("revenueRange is required");

  // Idempotent: one onboarding record per workspace (@@unique workspaceId)
  const existing = await db.ownerOnboarding.findFirst({
    where: { workspaceId },
    select: onboardingSelect,
  });
  if (existing) return toPublicDTO(existing as OnboardingRow);

  const row = await db.ownerOnboarding.create({
    data: {
      workspaceId,
      businessId,
      ownerId,
      businessName,
      businessType,
      revenueRange,
      revenueTrend,
      profitability,
      cashRunwayWeeks: cashRunwayWeeks ?? null,
      ownerHoursPerWeek: ownerHoursPerWeek ?? null,
      teamSize: teamSize ?? null,
      status: "IN_PROGRESS",
      createdBy: actorId,
    },
    select: onboardingSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.ONBOARDING_STARTED,
    entityType: "OwnerOnboarding",
    entityId: row.id,
    payload: { businessId, ownerId, businessType, revenueTrend, profitability },
  });

  return toPublicDTO(row as OnboardingRow);
}

// ─── Complete Onboarding ─────────────────────────────────────────────────────

export interface CompleteOnboardingInput {
  workspaceId: string;
  actorId: string;
  completionKey: string;
}

export async function completeOnboarding(input: CompleteOnboardingInput): Promise<PublicOnboardingDTO> {
  const { workspaceId, actorId, completionKey } = input;

  const onboarding = await loadOnboarding(workspaceId);

  // Idempotent: same completionKey → return current state
  if (onboarding.completionKey === completionKey && onboarding.status === "COMPLETED") {
    return toPublicDTO(onboarding);
  }

  if (!MUTABLE_STATUSES.includes(onboarding.status as OnboardingStatus)) {
    throw new ValidationError(
      `Cannot complete onboarding in status ${onboarding.status}. Must be IN_PROGRESS or RE_ONBOARDING.`
    );
  }

  const { archetype, archetypeScore } = classifyArchetype(
    onboarding.revenueTrend,
    onboarding.profitability,
    onboarding.cashRunwayWeeks,
  );

  const initialActionQueue = buildInitialActionQueue(archetype);

  const updated = await db.ownerOnboarding.update({
    where: { id: onboarding.id },
    data: {
      status: "COMPLETED",
      archetype,
      archetypeScore,
      initialActionQueue,
      completionKey,
      completedAt: new Date(),
      updatedBy: actorId,
    },
    select: onboardingSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.ONBOARDING_COMPLETED,
    entityType: "OwnerOnboarding",
    entityId: onboarding.id,
    payload: { archetype, businessId: onboarding.businessId },
  });

  return toPublicDTO(updated as OnboardingRow);
}

// ─── Trigger Re-Onboarding ───────────────────────────────────────────────────

export interface TriggerReOnboardingInput {
  workspaceId: string;
  actorId: string;
  reOnboardingReason: string;
}

export async function triggerReOnboarding(input: TriggerReOnboardingInput): Promise<PublicOnboardingDTO> {
  const { workspaceId, actorId, reOnboardingReason } = input;

  if (!reOnboardingReason.trim()) {
    throw new ValidationError("reOnboardingReason is required for re-onboarding");
  }

  const onboarding = await loadOnboarding(workspaceId);

  if (onboarding.status !== "COMPLETED") {
    throw new ValidationError(
      `Re-onboarding can only be triggered from COMPLETED status. Current: ${onboarding.status}`
    );
  }

  const updated = await db.ownerOnboarding.update({
    where: { id: onboarding.id },
    data: {
      status: "RE_ONBOARDING",
      reOnboardingReason,
      completionKey: null,
      completedAt: null,
      updatedBy: actorId,
    },
    select: onboardingSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.ONBOARDING_RE_TRIGGERED,
    entityType: "OwnerOnboarding",
    entityId: onboarding.id,
    payload: { reOnboardingReason, priorArchetype: onboarding.archetype },
  });

  return toPublicDTO(updated as OnboardingRow);
}

// ─── Get Onboarding ───────────────────────────────────────────────────────────

export async function getOnboarding(input: {
  workspaceId: string;
}): Promise<PublicOnboardingDTO> {
  const row = await loadOnboarding(input.workspaceId);
  return toPublicDTO(row);
}

// ─── Gate: Assert Onboarding Complete ────────────────────────────────────────

export async function assertOnboardingComplete(workspaceId: string): Promise<void> {
  const row = await db.ownerOnboarding.findFirst({
    where: { workspaceId },
    select: { status: true },
  });
  if (!row || row.status !== "COMPLETED") {
    throw new ValidationError(
      "Owner onboarding must be completed before accessing owner mode operations."
    );
  }
}
