/**
 * Owner action outcome service — Capability 5 (Measure outcomes).
 *
 * Records the result of an executed owner-mode action against a specific
 * business. Uses the `OwnerActionOutcome` model (workspace-scoped via
 * `ClientAccount`). Each outcome captures: what status the action reached,
 * before/after metrics, evidence quality, and an optional external-event flag
 * (for outcomes invalidated by exogenous shocks).
 *
 * Workspace isolation is enforced: all reads and writes require a matching
 * `workspaceId`. Duplicate reporting is allowed (multiple observations over
 * time are legitimate); idempotent writes are caller's responsibility via
 * `recommendationId` / `actionId` uniqueness policy.
 *
 * All writes emit an atomic audit event. Partial success (mutation without
 * audit) is prevented by the emitAuditEvent throwing on failure; the caller
 * can wrap in a DB transaction if atomicity is required at the application
 * level.
 */

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";

// Stable vocabulary for outcome status — mirrors the schema comment.
const VALID_OUTCOME_STATUSES = [
  "worked",
  "partially_worked",
  "did_not_work",
  "made_worse",
  "not_measurable",
  "too_early_to_judge",
  "invalid_test",
  "executed_differently",
  "external_event_interference",
] as const;

export type OutcomeStatus = (typeof VALID_OUTCOME_STATUSES)[number];

// Stable vocabulary for evidence quality — mirrors the schema comment.
const VALID_EVIDENCE_QUALITIES = [
  "strong",
  "moderate",
  "weak",
  "anecdotal",
  "none",
] as const;

export type EvidenceQuality = (typeof VALID_EVIDENCE_QUALITIES)[number];

export interface RecordOwnerActionOutcomeInput {
  businessId: string;
  outcomeStatus: OutcomeStatus;
  recommendationId?: string;
  actionId?: string;
  ownerReportedResult?: string;
  actualMetricName?: string;
  beforeValue?: number;
  afterValue?: number;
  measurementPeriodStart?: Date;
  measurementPeriodEnd?: Date;
  evidenceQuality?: EvidenceQuality;
  externalEventFlag?: boolean;
  externalEventDescription?: string;
}

export interface OwnerActionOutcomeRecord {
  id: string;
  workspaceId: string;
  businessId: string;
  outcomeStatus: string;
  recommendationId: string | null;
  actionId: string | null;
  ownerReportedResult: string | null;
  actualMetricName: string | null;
  beforeValue: number | null;
  afterValue: number | null;
  absoluteChange: number | null;
  percentageChange: number | null;
  measurementPeriodStart: Date | null;
  measurementPeriodEnd: Date | null;
  evidenceQuality: string | null;
  externalEventFlag: boolean;
  externalEventDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Record an outcome for one owner action.
 *
 * Computes `absoluteChange` and `percentageChange` deterministically from
 * `beforeValue` / `afterValue` when both are present; never stores
 * caller-supplied deltas so derived figures can't be fabricated.
 */
export async function recordOwnerActionOutcome(
  workspaceId: string,
  actorId: string,
  input: RecordOwnerActionOutcomeInput,
): Promise<OwnerActionOutcomeRecord> {
  if (!VALID_OUTCOME_STATUSES.includes(input.outcomeStatus)) {
    throw new ValidationError(
      `Invalid outcomeStatus: "${input.outcomeStatus}". Must be one of: ${VALID_OUTCOME_STATUSES.join(", ")}`,
    );
  }
  if (input.evidenceQuality && !VALID_EVIDENCE_QUALITIES.includes(input.evidenceQuality)) {
    throw new ValidationError(
      `Invalid evidenceQuality: "${input.evidenceQuality}". Must be one of: ${VALID_EVIDENCE_QUALITIES.join(", ")}`,
    );
  }

  // Verify the business belongs to this workspace (fail-closed).
  const business = await db.ownerBusiness.findFirst({
    where: { id: input.businessId, workspaceId },
    select: { id: true },
  });
  if (!business) throw new NotFoundError("OwnerBusiness", input.businessId);

  // Compute deltas deterministically — never accept caller-supplied values.
  let absoluteChange: number | null = null;
  let percentageChange: number | null = null;
  if (input.beforeValue != null && input.afterValue != null) {
    absoluteChange = input.afterValue - input.beforeValue;
    percentageChange =
      input.beforeValue !== 0
        ? ((input.afterValue - input.beforeValue) / Math.abs(input.beforeValue)) * 100
        : null;
  }

  const id = randomUUID();
  const outcome = await db.ownerActionOutcome.create({
    data: {
      id,
      workspaceId,
      businessId: input.businessId,
      outcomeStatus: input.outcomeStatus,
      recommendationId: input.recommendationId ?? null,
      actionId: input.actionId ?? null,
      ownerReportedResult: input.ownerReportedResult ?? null,
      actualMetricName: input.actualMetricName ?? null,
      beforeValue: input.beforeValue ?? null,
      afterValue: input.afterValue ?? null,
      absoluteChange,
      percentageChange,
      measurementPeriodStart: input.measurementPeriodStart ?? null,
      measurementPeriodEnd: input.measurementPeriodEnd ?? null,
      evidenceQuality: input.evidenceQuality ?? null,
      externalEventFlag: input.externalEventFlag ?? false,
      externalEventDescription: input.externalEventDescription ?? null,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_ACTION_OUTCOME_RECORDED,
    actorId,
    entityType: "owner_action_outcome",
    entityId: id,
    workspaceId,
    payload: {
      businessId: input.businessId,
      outcomeStatus: input.outcomeStatus,
      evidenceQuality: input.evidenceQuality ?? null,
      externalEventFlag: input.externalEventFlag ?? false,
      recommendationId: input.recommendationId ?? null,
      actionId: input.actionId ?? null,
    },
    visibility: "internal",
  });

  return outcome as OwnerActionOutcomeRecord;
}

/** List all outcomes for a specific business, workspace-scoped. */
export async function listOwnerActionOutcomes(
  workspaceId: string,
  businessId: string,
): Promise<OwnerActionOutcomeRecord[]> {
  const business = await db.ownerBusiness.findFirst({
    where: { id: businessId, workspaceId },
    select: { id: true },
  });
  if (!business) throw new NotFoundError("OwnerBusiness", businessId);

  const outcomes = await db.ownerActionOutcome.findMany({
    where: { workspaceId, businessId },
    orderBy: { createdAt: "desc" },
  });
  return outcomes as OwnerActionOutcomeRecord[];
}
