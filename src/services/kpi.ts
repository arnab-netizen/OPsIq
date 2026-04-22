import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import { logger } from "@/infra/logger";

export interface CreateKPIInput {
  engagementId: string;
  name: string;
  baseline?: number;
  targetValue?: number;
  unit?: string;
  direction?: string;
  notes?: string;
}

export interface UpdateKPIInput {
  currentValue?: number;
  measurementDate?: string;
  version: number;
}

export async function createKPI(
  input: CreateKPIInput,
  actorId: string
) {
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  const kpi = await db.kPI.create({
    data: {
      engagementId: input.engagementId,
      name: input.name,
      baseline: input.baseline ?? null,
      targetValue: input.targetValue ?? null,
      unit: input.unit ?? null,
      direction: input.direction ?? "up",
      notes: input.notes ?? null,
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
    },
    visibility: "internal",
  });

  logger.info("KPI created", {
    kpiId: kpi.id,
    engagementId: input.engagementId,
  });

  return kpi;
}

export async function getKPIsForEngagement(engagementId: string) {
  return db.kPI.findMany({
    where: { engagementId },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateKPIValue(
  kpiId: string,
  input: UpdateKPIInput,
  actorId: string
) {
  const kpi = await db.kPI.findUnique({
    where: { id: kpiId },
  });
  if (!kpi) throw new NotFoundError("KPI", kpiId);

  const updated = await db.kPI.update({
    where: { id: kpiId },
    data: {
      currentValue: input.currentValue ?? kpi.currentValue,
      measurementDate: input.measurementDate ? new Date(input.measurementDate) : kpi.measurementDate,
      version: input.version + 1,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.KPI_SNAPSHOT_RECORDED,
    actorId,
    entityType: "kpi",
    entityId: kpiId,
    payload: {
      currentValue: input.currentValue,
    },
    visibility: "internal",
  });

  return updated;
}
