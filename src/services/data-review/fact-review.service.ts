/**
 * B05-S1 — Fact Review Service (Owner Data Review/Correction).
 *
 * Provides owner-facing operations to review, approve, correct, and reject
 * extracted facts from data intakes (from B02-S3 file intake). All operations
 * enforce workspace isolation, validate input, and emit audit events.
 *
 * DB-backed (LANE_B) with idempotent approval/correction patterns.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";

export interface FactReviewAction {
  action: "approved" | "corrected" | "rejected" | "marked_unknown";
  factId: string;
  previousValue?: unknown;
  newValue?: unknown;
  correctionReason?: string;
}

export interface ReviewStatus {
  intakeId: string;
  approvedFactCount: number;
  correctedFactCount: number;
  rejectedFactCount: number;
  markedUnknownCount: number;
  totalFactCount: number;
  actions: FactReviewAction[];
}

/**
 * Record an owner approval of a fact (set validation_status to owner_confirmed).
 */
export async function approveFact(
  intakeId: string,
  factId: string,
  workspaceId: string,
  actorId: string,
) {
  const intake = await db.ownerDataIntake.findFirst({
    where: { id: intakeId, workspaceId },
  });
  if (!intake) throw new NotFoundError("OwnerDataIntake", intakeId);

  // Idempotency: allow re-approving the same fact (no-op if already approved)
  const existing = await db.factReviewAction.findFirst({
    where: { intakeId, factId, workspaceId, action: "approved" },
  });

  if (!existing) {
    await db.factReviewAction.create({
      data: {
        id: randomUUID(),
        intakeId,
        factId,
        action: "approved",
        actorId,
        workspaceId,
      },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.FACT_REVIEW_APPROVED,
      actorId,
      workspaceId,
      entityType: "FactReviewAction",
      entityId: intakeId,
      payload: {
        factId,
        action: "approved",
      },
    });
  }
}

/**
 * Record an owner correction of a fact value.
 * Stores the previous value for audit trail.
 */
export async function correctFact(
  intakeId: string,
  factId: string,
  newValue: unknown,
  correctionReason: string | null,
  workspaceId: string,
  actorId: string,
) {
  const intake = await db.ownerDataIntake.findFirst({
    where: { id: intakeId, workspaceId },
  });
  if (!intake) throw new NotFoundError("OwnerDataIntake", intakeId);

  if (newValue === undefined) {
    throw new ValidationError("newValue cannot be undefined");
  }

  // Retrieve the previous value from the intake records
  const records = Array.isArray(intake.records) ? intake.records : [];
  let previousValue: unknown = null;
  for (const record of records) {
    if (record && typeof record === "object" && "fact_id" in record && record.fact_id === factId) {
      previousValue = record.value ?? null;
      break;
    }
  }

  await db.factReviewAction.create({
    data: {
      id: randomUUID(),
      intakeId,
      factId,
      action: "corrected",
      previousValue,
      newValue,
      correctionReason,
      actorId,
      workspaceId,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FACT_REVIEW_CORRECTED,
    actorId,
    workspaceId,
    entityType: "FactReviewAction",
    entityId: intakeId,
    payload: {
      factId,
      action: "corrected",
      previousValue,
      newValue,
      reason: correctionReason,
    },
  });
}

/**
 * Record an owner rejection of a fact (set validation_status to rejected).
 */
export async function rejectFact(
  intakeId: string,
  factId: string,
  rejectionReason: string | null,
  workspaceId: string,
  actorId: string,
) {
  const intake = await db.ownerDataIntake.findFirst({
    where: { id: intakeId, workspaceId },
  });
  if (!intake) throw new NotFoundError("OwnerDataIntake", intakeId);

  // Idempotency: allow re-rejecting (no-op if already rejected)
  const existing = await db.factReviewAction.findFirst({
    where: { intakeId, factId, workspaceId, action: "rejected" },
  });

  if (!existing) {
    await db.factReviewAction.create({
      data: {
        id: randomUUID(),
        intakeId,
        factId,
        action: "rejected",
        correctionReason: rejectionReason,
        actorId,
        workspaceId,
      },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.FACT_REVIEW_REJECTED,
      actorId,
      workspaceId,
      entityType: "FactReviewAction",
      entityId: intakeId,
      payload: {
        factId,
        action: "rejected",
        reason: rejectionReason,
      },
    });
  }
}

/**
 * Record an owner marking a fact as unknown (set value to null, status to unknown).
 */
export async function markFactUnknown(
  intakeId: string,
  factId: string,
  reason: string | null,
  workspaceId: string,
  actorId: string,
) {
  const intake = await db.ownerDataIntake.findFirst({
    where: { id: intakeId, workspaceId },
  });
  if (!intake) throw new NotFoundError("OwnerDataIntake", intakeId);

  // Retrieve the previous value from the intake records
  const records = Array.isArray(intake.records) ? intake.records : [];
  let previousValue: unknown = null;
  for (const record of records) {
    if (record && typeof record === "object" && "fact_id" in record && record.fact_id === factId) {
      previousValue = record.value ?? null;
      break;
    }
  }

  // Idempotency: allow re-marking as unknown (no-op if already marked)
  const existing = await db.factReviewAction.findFirst({
    where: { intakeId, factId, workspaceId, action: "marked_unknown" },
  });

  if (!existing) {
    await db.factReviewAction.create({
      data: {
        id: randomUUID(),
        intakeId,
        factId,
        action: "marked_unknown",
        previousValue,
        newValue: null,
        correctionReason: reason,
        actorId,
        workspaceId,
      },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.FACT_REVIEW_MARKED_UNKNOWN,
      actorId,
      workspaceId,
      entityType: "FactReviewAction",
      entityId: intakeId,
      payload: {
        factId,
        action: "marked_unknown",
        previousValue,
        reason,
      },
    });
  }
}

/**
 * Get the review status for an intake, including all recorded actions.
 */
export async function getReviewStatus(
  intakeId: string,
  workspaceId: string,
): Promise<ReviewStatus> {
  const intake = await db.ownerDataIntake.findFirst({
    where: { id: intakeId, workspaceId },
  });
  if (!intake) throw new NotFoundError("OwnerDataIntake", intakeId);

  const actions = await db.factReviewAction.findMany({
    where: { intakeId, workspaceId },
    orderBy: { createdAt: "asc" },
  });

  const totalFactCount = Array.isArray(intake.records) ? intake.records.length : 0;
  const approvedCount = actions.filter((a: typeof actions[number]) => a.action === "approved").length;
  const correctedCount = actions.filter((a: typeof actions[number]) => a.action === "corrected").length;
  const rejectedCount = actions.filter((a: typeof actions[number]) => a.action === "rejected").length;
  const unknownCount = actions.filter((a: typeof actions[number]) => a.action === "marked_unknown").length;

  return {
    intakeId,
    approvedFactCount: approvedCount,
    correctedFactCount: correctedCount,
    rejectedFactCount: rejectedCount,
    markedUnknownCount: unknownCount,
    totalFactCount,
    actions: actions.map((a: typeof actions[number]) => ({
      action: a.action as FactReviewAction["action"],
      factId: a.factId,
      previousValue: a.previousValue,
      newValue: a.newValue,
      correctionReason: a.correctionReason ?? undefined,
    })),
  };
}

/**
 * Undo a previous review action. Used if owner changes their mind.
 * Note: this creates a new "undone" record for audit trail; doesn't delete the original.
 */
export async function undoReviewAction(
  intakeId: string,
  factId: string,
  workspaceId: string,
  actorId: string,
) {
  const intake = await db.ownerDataIntake.findFirst({
    where: { id: intakeId, workspaceId },
  });
  if (!intake) throw new NotFoundError("OwnerDataIntake", intakeId);

  // Find the most recent action for this fact
  const latestAction = await db.factReviewAction.findFirst({
    where: { intakeId, factId, workspaceId },
    orderBy: { createdAt: "desc" },
  });

  if (!latestAction) {
    throw new NotFoundError("FactReviewAction", `${intakeId}:${factId}`);
  }

  // Emit an undo event
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FACT_REVIEW_UNDONE,
    actorId,
    workspaceId,
    entityType: "FactReviewAction",
    entityId: intakeId,
    payload: {
      factId,
      action: "undone",
      undidAction: latestAction.action,
    },
  });
}
