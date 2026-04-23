import { db } from "@/lib/db";
import { DuplicateSubmissionError, ValidationError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { createHash } from "crypto";

const DEFAULT_TTL_HOURS = 24;

function computePayloadHash(payload: unknown): string | null {
  if (payload === undefined) return null;
  const normalized = JSON.stringify(payload);
  return createHash("sha256").update(normalized).digest("hex");
}

export interface IdempotencyResult<T> {
  isNew: boolean;
  result: T;
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
  const incomingPayloadHash = computePayloadHash(payload);

  const existing = await db.idempotencyRecord.findUnique({
    where: { idempotencyKey },
  });

  if (existing) {
    if (existing.payload !== null && incomingPayloadHash !== existing.payload) {
      throw new ValidationError(
        "Idempotency key reused with different payload"
      );
    }

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

      const cachedResult = typeof existing.responseBody === "string"
        ? JSON.parse(existing.responseBody)
        : existing.responseBody;
      return { isNew: false, result: cachedResult as T };
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
          payload: incomingPayloadHash,
        },
      });

  try {
    const result = await operation();

    await db.idempotencyRecord.update({
      where: { id: record.id },
      data: {
        status: "completed",
        responseCode: 200,
        responseBody: result !== null && result !== undefined ? JSON.stringify(result) : null,
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
