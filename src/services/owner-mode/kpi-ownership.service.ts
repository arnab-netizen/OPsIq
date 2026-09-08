/**
 * Phase 4 — KPI Ownership service.
 *
 * CRUD for KPIOwnershipRecord (workspace-scoped, unique on metricName).
 * Distinct from engagement-scoped KPI model.
 * Workspace isolation enforced. Audit events emitted atomically.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import type { Prisma } from "@/generated/prisma/client";

export type ReviewCadence = "DAILY" | "WEEKLY" | "FORTNIGHTLY" | "MONTHLY" | "QUARTERLY";
const VALID_CADENCES: ReviewCadence[] = ["DAILY", "WEEKLY", "FORTNIGHTLY", "MONTHLY", "QUARTERLY"];

export type KPIDirection = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
export type KPITrend = "IMPROVING" | "STABLE" | "DECLINING";
export type KPIConfidenceLevel = "very_high" | "high" | "moderate" | "low" | "very_low";

const VALID_DIRECTIONS: KPIDirection[] = ["HIGHER_IS_BETTER", "LOWER_IS_BETTER"];
const VALID_TRENDS: KPITrend[] = ["IMPROVING", "STABLE", "DECLINING"];
const VALID_CONFIDENCE_LEVELS: KPIConfidenceLevel[] = ["very_high", "high", "moderate", "low", "very_low"];

function validateCadence(c: string): asserts c is ReviewCadence {
  if (!VALID_CADENCES.includes(c as ReviewCadence)) {
    throw new ValidationError(`Invalid reviewCadence: ${c}. Must be one of ${VALID_CADENCES.join(", ")}`);
  }
}

function validateDirection(d: string): asserts d is KPIDirection {
  if (!VALID_DIRECTIONS.includes(d as KPIDirection)) {
    throw new ValidationError(`Invalid direction: ${d}. Must be one of ${VALID_DIRECTIONS.join(", ")}`);
  }
}

function validateTrend(t: string): asserts t is KPITrend {
  if (!VALID_TRENDS.includes(t as KPITrend)) {
    throw new ValidationError(`Invalid trend: ${t}. Must be one of ${VALID_TRENDS.join(", ")}`);
  }
}

function validateConfidenceLevel(c: string): asserts c is KPIConfidenceLevel {
  if (!VALID_CONFIDENCE_LEVELS.includes(c as KPIConfidenceLevel)) {
    throw new ValidationError(`Invalid confidenceLevel: ${c}. Must be one of ${VALID_CONFIDENCE_LEVELS.join(", ")}`);
  }
}

export interface CreateKPIOwnershipInput {
  workspaceId: string;
  actorId: string;
  metricName: string;
  metricLabel: string;
  ownerUserId: string;
  reviewCadence: ReviewCadence;
  targetValue?: number | null;
  currentValue?: number | null;
  baselineValue?: number | null;
  unit?: string | null;
  direction?: KPIDirection | null;
  trend?: KPITrend | null;
  confidenceLevel?: KPIConfidenceLevel | null;
  linkedObjectiveId?: string | null;
}

export interface UpdateKPIOwnershipInput {
  workspaceId: string;
  recordId: string;
  actorId: string;
  metricLabel?: string;
  ownerUserId?: string;
  reviewCadence?: ReviewCadence;
  targetValue?: number | null;
  currentValue?: number | null;
  baselineValue?: number | null;
  unit?: string | null;
  direction?: KPIDirection | null;
  trend?: KPITrend | null;
  confidenceLevel?: KPIConfidenceLevel | null;
  linkedObjectiveId?: string | null;
  lastReviewedAt?: Date | null;
}

export async function createKPIOwnership(input: CreateKPIOwnershipInput) {
  validateCadence(input.reviewCadence);
  if (input.direction) validateDirection(input.direction);
  if (input.trend) validateTrend(input.trend);
  if (input.confidenceLevel) validateConfidenceLevel(input.confidenceLevel);

  if (input.metricName.trim().length === 0) {
    throw new ValidationError("metricName cannot be empty");
  }
  if (input.metricLabel.trim().length === 0) {
    throw new ValidationError("metricLabel cannot be empty");
  }

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const record = await tx.kPIOwnershipRecord.upsert({
      where: { workspaceId_metricName: { workspaceId: input.workspaceId, metricName: input.metricName.trim() } },
      create: {
        workspaceId: input.workspaceId,
        metricName: input.metricName.trim(),
        metricLabel: input.metricLabel.trim(),
        ownerUserId: input.ownerUserId,
        reviewCadence: input.reviewCadence,
        targetValue: input.targetValue ?? null,
        currentValue: input.currentValue ?? null,
        baselineValue: input.baselineValue ?? null,
        unit: input.unit ?? null,
        direction: input.direction ?? null,
        trend: input.trend ?? null,
        confidenceLevel: input.confidenceLevel ?? null,
        linkedObjectiveId: input.linkedObjectiveId ?? null,
      },
      update: {
        metricLabel: input.metricLabel.trim(),
        ownerUserId: input.ownerUserId,
        reviewCadence: input.reviewCadence,
        targetValue: input.targetValue ?? null,
        currentValue: input.currentValue ?? null,
        baselineValue: input.baselineValue ?? null,
        unit: input.unit ?? null,
        direction: input.direction ?? null,
        trend: input.trend ?? null,
        confidenceLevel: input.confidenceLevel ?? null,
        linkedObjectiveId: input.linkedObjectiveId ?? null,
      },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_KPI_OWNERSHIP_ASSIGNED,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        entityType: "KPIOwnershipRecord",
        entityId: record.id,
        payload: { metricName: input.metricName, ownerUserId: input.ownerUserId, reviewCadence: input.reviewCadence },
      },
      tx,
    );

    return record;
  });
}

export async function updateKPIOwnership(input: UpdateKPIOwnershipInput) {
  if (input.reviewCadence) validateCadence(input.reviewCadence);
  if (input.direction) validateDirection(input.direction);
  if (input.trend) validateTrend(input.trend);
  if (input.confidenceLevel) validateConfidenceLevel(input.confidenceLevel);

  const existing = await db.kPIOwnershipRecord.findFirst({
    where: { id: input.recordId, workspaceId: input.workspaceId },
  });
  if (!existing) throw new NotFoundError("KPIOwnershipRecord", input.recordId);

  const isReview = input.lastReviewedAt !== undefined && input.currentValue !== undefined;

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.kPIOwnershipRecord.update({
      where: { id: input.recordId },
      data: {
        ...(input.metricLabel !== undefined ? { metricLabel: input.metricLabel } : {}),
        ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
        ...(input.reviewCadence !== undefined ? { reviewCadence: input.reviewCadence } : {}),
        ...(input.targetValue !== undefined ? { targetValue: input.targetValue } : {}),
        ...(input.currentValue !== undefined ? { currentValue: input.currentValue } : {}),
        ...(input.baselineValue !== undefined ? { baselineValue: input.baselineValue } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.direction !== undefined ? { direction: input.direction } : {}),
        ...(input.trend !== undefined ? { trend: input.trend } : {}),
        ...(input.confidenceLevel !== undefined ? { confidenceLevel: input.confidenceLevel } : {}),
        ...(input.linkedObjectiveId !== undefined ? { linkedObjectiveId: input.linkedObjectiveId } : {}),
        ...(input.lastReviewedAt !== undefined ? { lastReviewedAt: input.lastReviewedAt } : {}),
      },
    });

    await emitAuditEvent(
      {
        eventName: isReview ? AUDIT_EVENTS.OWNER_KPI_REVIEWED : AUDIT_EVENTS.OWNER_KPI_OWNERSHIP_ASSIGNED,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        entityType: "KPIOwnershipRecord",
        entityId: input.recordId,
        payload: {
          metricName: existing.metricName,
          currentValue: input.currentValue,
          lastReviewedAt: input.lastReviewedAt,
        },
      },
      tx,
    );

    return updated;
  });
}

export async function listKPIOwnership(
  workspaceId: string,
  opts: { ownerUserId?: string } = {},
) {
  return db.kPIOwnershipRecord.findMany({
    // isFixtureRecord: false excludes acceptance/QA fixture KPIs (see
    // ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md) — an ordinary owner's KPI list must never include a
    // metric a QA blueprint run created.
    where: { workspaceId, isFixtureRecord: false, ...(opts.ownerUserId ? { ownerUserId: opts.ownerUserId } : {}) },
    orderBy: { metricName: "asc" },
  });
}
