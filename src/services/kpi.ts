import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ConflictError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { assertEngagementAccess } from "@/lib/visibility";

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

  // Trigger re-evaluation due to new KPI
  await triggerReEvaluation({
    changeType: "kpi",
    entityType: "kpi",
    entityId: kpi.id,
    engagementId: input.engagementId,
    severity: "medium",
    description: `KPI defined: ${input.name}`,
    triggeredBy: actorId,
  });

  logger.info("KPI created", {
    kpiId: kpi.id,
    engagementId: input.engagementId,
  });

  return kpi;
}

export async function getKPIsForEngagement(engagementId: string, userId: string) {
  // Check engagement access
  await assertEngagementAccess(userId, engagementId);

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

  // Validate version for optimistic locking
  if (kpi.version !== input.version) {
    throw new ConflictError(
      "KPI has been modified by another process. Current version: " + kpi.version,
      "STALE_VERSION"
    );
  }

  // Optimistic locking: update only if version matches
  const updateResult = await db.kPI.updateMany({
    where: {
      id: kpiId,
      version: input.version,
    },
    data: {
      currentValue: input.currentValue ?? kpi.currentValue,
      measurementDate: input.measurementDate ? new Date(input.measurementDate) : kpi.measurementDate,
      version: { increment: 1 },
    },
  });

  if (updateResult.count === 0) {
    throw new ConflictError(
      "KPI has been modified by another process",
      "OPTIMISTIC_LOCK_FAILED"
    );
  }

  const updated = await db.kPI.findUnique({
    where: { id: kpiId },
  });
  if (!updated) throw new NotFoundError("KPI", kpiId);

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

  // Trigger re-evaluation due to KPI value change
  await triggerReEvaluation({
    changeType: "kpi",
    entityType: "kpi",
    entityId: kpiId,
    engagementId: updated.engagementId,
    severity: "medium",
    description: `KPI snapshot recorded: ${updated.name}`,
    triggeredBy: actorId,
  });

  return updated;
}
