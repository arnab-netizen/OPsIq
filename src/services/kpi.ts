import { db } from "@/lib/db";
import { emitAuditEvent, type Visibility } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { logger } from "@/infra/logger";

export interface DefineKPIInput {
  engagementId: string;
  name: string;
  description?: string;
  unit?: string;
  baselineValue?: number;
  baselineDate?: string;
  targetValue?: number;
  targetDate?: string;
  direction?: string; // "increase" | "decrease"
  visibility?: Visibility;
}

export interface RecordKPISnapshotInput {
  kpiId: string;
  currentValue: number;
}

export async function defineKPI(
  input: DefineKPIInput,
  actorId: string
): Promise<{ id: string }> {
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  const kpi = await db.kPI.create({
    data: {
      engagementId: input.engagementId,
      name: input.name,
      description: input.description ?? null,
      unit: input.unit ?? null,
      baselineValue: input.baselineValue ?? null,
      baselineDate: input.baselineDate ? new Date(input.baselineDate) : null,
      targetValue: input.targetValue ?? null,
      targetDate: input.targetDate ? new Date(input.targetDate) : null,
      direction: input.direction ?? null,
      visibility: input.visibility ?? "internal",
      createdBy: actorId,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.KPI_DEFINED,
    actorId,
    entityType: "kpi",
    entityId: kpi.id,
    payload: {
      engagementId: input.engagementId,
      name: input.name,
      baselineValue: input.baselineValue,
      targetValue: input.targetValue,
    },
    visibility: input.visibility ?? "internal",
  });

  logger.info("KPI defined", {
    kpiId: kpi.id,
    engagementId: input.engagementId,
    name: input.name,
  });

  return { id: kpi.id };
}

export async function recordKPISnapshot(
  input: RecordKPISnapshotInput,
  actorId: string
): Promise<void> {
  const kpi = await db.kPI.findUnique({
    where: { id: input.kpiId },
  });
  if (!kpi) throw new NotFoundError("KPI", input.kpiId);

  await db.kPI.update({
    where: { id: input.kpiId },
    data: {
      currentValue: input.currentValue,
      currentDate: new Date(),
      updatedAt: new Date(),
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.KPI_SNAPSHOT_RECORDED,
    actorId,
    entityType: "kpi",
    entityId: input.kpiId,
    payload: {
      currentValue: input.currentValue,
    },
    visibility: kpi.visibility as Visibility,
  });

  logger.info("KPI snapshot recorded", {
    kpiId: input.kpiId,
    currentValue: input.currentValue,
  });
}

export async function getKPIsByEngagement(engagementId: string) {
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  return db.kPI.findMany({
    where: { engagementId, status: "active" },
    orderBy: { createdAt: "asc" },
  });
}

export async function getKPIProgress(kpiId: string) {
  const kpi = await db.kPI.findUnique({
    where: { id: kpiId },
  });
  if (!kpi) throw new NotFoundError("KPI", kpiId);

  const progress = {
    baseline: kpi.baselineValue,
    current: kpi.currentValue,
    target: kpi.targetValue,
    baselineDate: kpi.baselineDate,
    currentDate: kpi.currentDate,
    targetDate: kpi.targetDate,
    unit: kpi.unit,
    direction: kpi.direction,
  };

  // Calculate progress percentage if baseline and target exist
  if (
    kpi.baselineValue !== null &&
    kpi.targetValue !== null &&
    kpi.currentValue !== null
  ) {
    const range = Math.abs(kpi.targetValue - kpi.baselineValue);
    if (range > 0) {
      const progress_amount = Math.abs(kpi.currentValue - kpi.baselineValue);
      const progressPct = Math.min(100, Math.round((progress_amount / range) * 100));
      return { ...progress, progressPercentage: progressPct };
    }
  }

  return progress;
}
