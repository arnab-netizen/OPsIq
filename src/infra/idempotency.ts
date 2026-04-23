import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { createHash } from "crypto";
import { DuplicateSubmissionError, ValidationError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

const DEFAULT_TTL_HOURS = 24;

export interface IdempotencyResult<T> {
  isNew: boolean;
  result: T;
}

function computePayloadHash(payload: unknown): string {
  const normalized = JSON.stringify(payload);
  return createHash("sha256").update(normalized).digest("hex");
}

export async function withIdempotency<T>(
  idempotencyKey: string,
  operationName: string,
  operation: () => Promise<T>,
  payload?: unknown,
  actorId?: string,
  ttlHours: number = DEFAULT_TTL_HOURS
): Promise<IdempotencyResult<T>> {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  const payloadHash = payload ? computePayloadHash(payload) : null;

  const existing = await db.idempotencyRecord.findUnique({
    where: { idempotencyKey },
  });

  if (existing) {
    if (existing.status === "completed" && existing.responseBody !== null) {
      logger.info("Idempotency cache hit", {
        idempotencyKey,
        operationName,
      });

      if (actorId) {
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.IDEMPOTENCY_REPLAY_DETECTED,
          actorId,
          entityType: "IdempotencyRecord",
          entityId: existing.id,
          payload: {
            operationName,
            idempotencyKey,
          },
          visibility: "internal",
        });
      }

      return { isNew: false, result: existing.responseBody as T };
    }

    if (existing.status === "pending") {
      throw new DuplicateSubmissionError(idempotencyKey);
    }
  }

  const record = existing
    ? await db.idempotencyRecord.update({
        where: { idempotencyKey },
        data: { status: "pending", completedAt: null },
      })
    : await db.idempotencyRecord.create({
        data: {
          idempotencyKey,
          operationName,
          status: "pending",
          expiresAt,
        },
      });

  try {
    const result = await operation();

    await db.idempotencyRecord.update({
      where: { id: record.id },
      data: {
        status: "completed",
        responseCode: 200,
        responseBody: (result ?? Prisma.DbNull) as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });

    return { isNew: true, result };
  } catch (error) {
    await db.idempotencyRecord.update({
      where: { id: record.id },
      data: { status: "failed" },
    });
    throw error;
  }
}
