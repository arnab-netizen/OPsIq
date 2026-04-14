import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { DuplicateSubmissionError } from "@/infra/errors";
import { logger } from "@/infra/logger";

const DEFAULT_TTL_HOURS = 24;

export interface IdempotencyResult<T> {
  isNew: boolean;
  result: T;
}

export async function withIdempotency<T>(
  idempotencyKey: string,
  operationName: string,
  operation: () => Promise<T>,
  ttlHours: number = DEFAULT_TTL_HOURS
): Promise<IdempotencyResult<T>> {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  const existing = await db.idempotencyRecord.findUnique({
    where: { idempotencyKey },
  });

  if (existing) {
    if (existing.status === "completed" && existing.responseBody !== null) {
      logger.info("Idempotency cache hit", {
        idempotencyKey,
        operationName,
      });
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
