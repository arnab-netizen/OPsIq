import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { type KPIStatus } from "@/domain/constants/statuses";
import { logger } from "@/infra/logger";

// ─── Status Derivation ─────────────────────────────────────────────────────

function deriveStatus(
  baselineValue: number,
  currentValue: number,
  targetValue?: number
): KPIStatus {
  if (targetValue !== undefined && targetValue !== null && currentValue >= targetValue) {
    return "target_met";
  }

  if (currentValue > baselineValue) {
    return "improving";
  } else if (currentValue < baselineValue) {
    return "worsening";
  }
  return "stagnant";
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function recordKPIChange(
  kpiId: string,
  newValue: number,
  actorId: string,
  actionId?: string,
  engagementId?: string
) {
  // Validate numeric value
  if (!Number.isFinite(newValue)) {
    throw new ValidationError("New value must be a valid number");
  }

  // Fetch current KPI
  const kpi = await db.kpi.findUnique({
    where: { id: kpiId },
  });

  if (!kpi) {
    throw new NotFoundError("KPI", kpiId);
  }

  // Validate ownership if engagementId provided
  if (engagementId && kpi.engagementId !== engagementId) {
    throw new ValidationError(
      "KPI does not belong to the specified engagement"
    );
  }

  // Validate action if provided
  if (actionId) {
    const action = await db.action.findUnique({
      where: { id: actionId },
    });

    if (!action) {
      throw new NotFoundError("Action", actionId);
    }

    // Verify action belongs to same engagement
    if (action.engagementId !== kpi.engagementId) {
      throw new ValidationError(
        "Action does not belong to the same engagement as the KPI"
      );
    }
  }

  // Check intervention phase (reject if closed)
  const interventionState = await db.interventionState.findUnique({
    where: { engagementId: kpi.engagementId },
  });

  if (interventionState && interventionState.currentPhase === "closed") {
    throw new ValidationError(
      "Cannot record KPI changes when intervention is in closed phase"
    );
  }

  const previousValue = kpi.currentValue;
  const delta = newValue - previousValue;

  // Create KPI event
  const kpiEvent = await db.kpiEvent.create({
    data: {
      kpiId,
      actionId: actionId ?? null,
      previousValue,
      newValue,
      delta,
    },
  });

  // Update KPI value and status
  const newStatus = deriveStatus(kpi.baselineValue, newValue, kpi.targetValue ?? undefined);

  const updatedKPI = await db.kpi.update({
    where: { id: kpiId },
    data: {
      currentValue: newValue,
      status: newStatus,
    },
  });

  // Emit audit event
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.KPI_CHANGE_RECORDED,
    actorId,
    entityType: "kpi",
    entityId: kpiId,
    payload: {
      kpiId,
      actionId: actionId || null,
      previousValue,
      newValue,
      delta,
      status: newStatus,
    },
    visibility: "internal",
  });

  logger.info("KPI change recorded", {
    kpiId,
    actionId: actionId || null,
    previousValue,
    newValue,
    delta,
    newStatus,
  });
}
