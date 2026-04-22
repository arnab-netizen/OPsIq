import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { KPI_STATUSES, type KPIStatus } from "@/domain/constants/statuses";
import { logger } from "@/infra/logger";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateKPIInput {
  engagementId: string;
  name: string;
  unit: string;
  baselineValue: number;
  currentValue: number;
  targetValue?: number;
}

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

export async function createKPI(
  input: CreateKPIInput,
  actorId: string
): Promise<{
  id: string;
  engagementId: string;
  name: string;
  status: KPIStatus;
}> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });

  if (!engagement) {
    throw new NotFoundError("Engagement", input.engagementId);
  }

  // Check intervention phase (reject if closed)
  const interventionState = await db.interventionState.findUnique({
    where: { engagementId: input.engagementId },
  });

  if (interventionState && interventionState.currentPhase === "closed") {
    throw new ValidationError(
      "Cannot create KPIs when intervention is in closed phase"
    );
  }

  // Validate numeric values
  if (!Number.isFinite(input.baselineValue)) {
    throw new ValidationError("Baseline value must be a valid number");
  }
  if (!Number.isFinite(input.currentValue)) {
    throw new ValidationError("Current value must be a valid number");
  }
  if (input.targetValue !== undefined && !Number.isFinite(input.targetValue)) {
    throw new ValidationError("Target value must be a valid number");
  }

  const status = deriveStatus(input.baselineValue, input.currentValue, input.targetValue);

  const kpi = await db.kpi.create({
    data: {
      engagementId: input.engagementId,
      name: input.name,
      unit: input.unit,
      baselineValue: input.baselineValue,
      currentValue: input.currentValue,
      targetValue: input.targetValue ?? null,
      status,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.KPI_CREATED,
    actorId,
    entityType: "kpi",
    entityId: kpi.id,
    payload: {
      kpiId: kpi.id,
      engagementId: input.engagementId,
      currentValue: input.currentValue,
      status,
    },
    visibility: "internal",
  });

  logger.info("KPI created", {
    kpiId: kpi.id,
    engagementId: input.engagementId,
    name: input.name,
  });

  return {
    id: kpi.id,
    engagementId: kpi.engagementId,
    name: kpi.name,
    status,
  };
}

export async function listKPIs(engagementId: string) {
  // Verify engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });

  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  const kpis = await db.kpi.findMany({
    where: { engagementId },
    select: {
      id: true,
      name: true,
      unit: true,
      baselineValue: true,
      currentValue: true,
      targetValue: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return kpis;
}

export async function getKPIById(id: string, engagementId?: string) {
  const kpi = await db.kpi.findUnique({
    where: { id },
  });

  if (!kpi) {
    throw new NotFoundError("KPI", id);
  }

  // Validate ownership if engagementId provided
  if (engagementId && kpi.engagementId !== engagementId) {
    throw new ValidationError(
      "KPI does not belong to the specified engagement"
    );
  }

  return {
    id: kpi.id,
    engagementId: kpi.engagementId,
    name: kpi.name,
    unit: kpi.unit,
    baselineValue: kpi.baselineValue,
    currentValue: kpi.currentValue,
    targetValue: kpi.targetValue,
    status: kpi.status as KPIStatus,
    createdAt: kpi.createdAt,
    updatedAt: kpi.updatedAt,
  };
}

export async function updateKPIValue(
  id: string,
  currentValue: number,
  actorId: string,
  engagementId?: string
) {
  // Validate numeric value
  if (!Number.isFinite(currentValue)) {
    throw new ValidationError("Current value must be a valid number");
  }

  const kpi = await db.kpi.findUnique({
    where: { id },
  });

  if (!kpi) {
    throw new NotFoundError("KPI", id);
  }

  // Validate ownership if engagementId provided
  if (engagementId && kpi.engagementId !== engagementId) {
    throw new ValidationError(
      "KPI does not belong to the specified engagement"
    );
  }

  // Check intervention phase (reject if closed)
  const interventionState = await db.interventionState.findUnique({
    where: { engagementId: kpi.engagementId },
  });

  if (interventionState && interventionState.currentPhase === "closed") {
    throw new ValidationError(
      "Cannot update KPIs when intervention is in closed phase"
    );
  }

  const newStatus = deriveStatus(kpi.baselineValue, currentValue, kpi.targetValue ?? undefined);
  const previousValue = kpi.currentValue;

  const updatedKPI = await db.kpi.update({
    where: { id },
    data: {
      currentValue,
      status: newStatus,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.KPI_UPDATED,
    actorId,
    entityType: "kpi",
    entityId: kpi.id,
    payload: {
      kpiId: kpi.id,
      engagementId: kpi.engagementId,
      previousValue,
      currentValue,
      status: newStatus,
    },
    visibility: "internal",
  });

  logger.info("KPI value updated", {
    kpiId: kpi.id,
    previousValue,
    currentValue,
    newStatus,
  });
}
