import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ConflictError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { assertEngagementAccess } from "@/lib/visibility";
import { withIdempotency } from "@/infra/idempotency";

export interface CreateKPIInput {
  engagementId: string;
  name: string;
  description?: string;
  target?: number;
}

export interface UpdateKPIInput {
  currentValue?: number;
  measurementDate?: string;
  version: number;
}

export async function createKPI(
  input: CreateKPIInput,
  actorId: string,
  idempotencyKey?: string
) {
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  if (idempotencyKey) {
    const result = await withIdempotency(
      idempotencyKey,
      "kpi.create",
      async () => {
        return await db.$transaction(async (tx: any) => {
          const kpi = await tx.kPI.create({
            data: {
              engagementId: input.engagementId,
              name: input.name,
              description: input.description || null,
              target: input.target || null,
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
            },
            visibility: "internal",
          });

          return kpi;
        });
      },
      input,
      actorId
    );

    if (!result.isNew) {
      logger.info("KPI creation - idempotency replay", {
        kpiId: result.result.id,
        engagementId: input.engagementId,
      });
    } else {
      logger.info("KPI created", {
        kpiId: result.result.id,
        engagementId: input.engagementId,
      });
    }

    return result.result;
  }

  const kpi = await db.kPI.create({
    data: {
      engagementId: input.engagementId,
      name: input.name,
      description: input.description || null,
      target: input.target || null,
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
    },
    visibility: "internal",
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
  actorId: string,
  idempotencyKey?: string
) {
  const kpi = await db.kPI.findUnique({
    where: { id: kpiId },
    include: {
      snapshots: {
        orderBy: { recordedAt: "desc" },
        take: 1,
      },
    },
  });
  if (!kpi) throw new NotFoundError("KPI", kpiId);

  // Validate version for optimistic locking
  if (kpi.version !== input.version) {
    throw new ConflictError(
      "KPI has been modified by another process. Current version: " + kpi.version,
      { code: "STALE_VERSION" }
    );
  }

  if (idempotencyKey) {
    const result = await withIdempotency(
      idempotencyKey,
      "kpi.record",
      async () => {
        return await db.$transaction(async (tx: any) => {
          const updateResult = await tx.kPI.updateMany({
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
              { code: "OPTIMISTIC_LOCK_FAILED" }
            );
          }

          // Create snapshot of the new value
          const newValue = input.currentValue ?? kpi.currentValue;
          const snapshot = await tx.kPISnapshot.create({
            data: {
              kpiId,
              value: newValue ?? 0,
              recordedBy: actorId,
            },
          });

          const updated = await tx.kPI.findUnique({
            where: { id: kpiId },
          });
          if (!updated) throw new NotFoundError("KPI", kpiId);

          // Detect deterioration
          const previousValue = kpi.snapshots[0]?.value;
          let deteriorated = false;

          if (previousValue != null && newValue != null) {
            const isWorsening = kpi.direction === "up" ? newValue < previousValue : newValue > previousValue;
            if (isWorsening) {
              deteriorated = true;
              await emitAuditEvent({
                eventName: AUDIT_EVENTS.KPI_DETERIORATED,
                actorId,
                entityType: "kpi",
                entityId: kpiId,
                payload: {
                  previousValue,
                  currentValue: newValue,
                  direction: kpi.direction,
                },
                visibility: "internal",
              });
            }
          }

          await emitAuditEvent({
            eventName: AUDIT_EVENTS.KPI_SNAPSHOT_RECORDED,
            actorId,
            entityType: "kpi",
            entityId: kpiId,
            payload: {
              currentValue: input.currentValue,
              deteriorated,
            },
            visibility: "internal",
          });

          return updated;
        });
      },
      { kpiId, ...input },
      actorId
    );

    if (!result.isNew) {
      logger.info("KPI record - idempotency replay", {
        kpiId: result.result.id,
      });
    }

    return result.result;
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
      { code: "OPTIMISTIC_LOCK_FAILED" }
    );
  }

  // Create snapshot of the new value
  const newValue = input.currentValue ?? kpi.currentValue;
  await db.kPISnapshot.create({
    data: {
      kpiId,
      value: newValue ?? 0,
      recordedBy: actorId,
    },
  });

  const updated = await db.kPI.findUnique({
    where: { id: kpiId },
  });
  if (!updated) throw new NotFoundError("KPI", kpiId);

  // Detect deterioration
  const previousValue = kpi.snapshots[0]?.value;
  let deteriorated = false;

  if (previousValue != null && newValue != null) {
    const isWorsening = kpi.direction === "up" ? newValue < previousValue : newValue > previousValue;
    if (isWorsening) {
      deteriorated = true;
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.KPI_DETERIORATED,
        actorId,
        entityType: "kpi",
        entityId: kpiId,
        payload: {
          previousValue,
          currentValue: newValue,
          direction: kpi.direction,
        },
        visibility: "internal",
      });
    }
  }

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.KPI_SNAPSHOT_RECORDED,
    actorId,
    entityType: "kpi",
    entityId: kpiId,
    payload: {
      currentValue: input.currentValue,
      deteriorated,
    },
    visibility: "internal",
  });

  return updated;
}
