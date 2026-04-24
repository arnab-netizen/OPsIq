import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ValidationError } from "@/infra/errors";
import crypto from "crypto";

export interface IdempotencyOptions {
  idempotencyKey: string;
  operationName: string;
  actorId: string;
  payload: Record<string, unknown>;
  expirationMinutes?: number;
}

export interface IdempotencyCheckResult {
  isNew: boolean;
  cachedResponse?: {
    status: number;
    body: Record<string, unknown>;
  };
}

function hashPayload(payload: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function checkIdempotencyKey(
  options: IdempotencyOptions
): Promise<IdempotencyCheckResult> {
  const { idempotencyKey, operationName, payload, expirationMinutes = 24 * 60 } = options;

  // Look for existing record with this key
  const existing = await db.idempotencyRecord.findUnique({
    where: { idempotencyKey },
  });

  if (existing) {
    // Key exists - verify it's for the same operation and payload
    // We don't store payload directly, but we can verify it's the same operation
    // If different operation, that's suspicious
    if (existing.operationName !== operationName) {
      throw new ValidationError(
        `Idempotency key reused for different operation. Original: ${existing.operationName}, Current: ${operationName}`
      );
    }

    // If request has expired, delete and treat as new request
    if (existing.expiresAt < new Date()) {
      await db.idempotencyRecord.delete({ where: { id: existing.id } });
      // Fall through to create new record below
    } else {
      // Return cached response if available
      if (existing.status === "completed" && existing.responseCode && existing.responseBody) {
        return {
          isNew: false,
          cachedResponse: {
            status: existing.responseCode,
            body: existing.responseBody as Record<string, unknown>,
          },
        };
      }

      // If pending, request is in flight - reject duplicate
      if (existing.status === "pending") {
        throw new ValidationError(
          "Duplicate request in flight with same idempotency key. Please wait for the original request to complete."
        );
      }

      // If failed, allow retry with same key
      if (existing.status === "failed") {
        return { isNew: true };
      }
    }
  }

  // Create new idempotency record
  const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

  await db.idempotencyRecord.create({
    data: {
      idempotencyKey,
      operationName,
      status: "pending",
      expiresAt,
    },
  });

  return { isNew: true };
}

export async function recordIdempotencyResponse(
  idempotencyKey: string,
  statusCode: number,
  responseBody: Record<string, unknown>
): Promise<void> {
  await db.idempotencyRecord.update({
    where: { idempotencyKey },
    data: {
      status: "completed",
      responseCode: statusCode,
      responseBody: responseBody as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });
}

export async function recordIdempotencyError(
  idempotencyKey: string,
  error: Error
): Promise<void> {
  await db.idempotencyRecord.update({
    where: { idempotencyKey },
    data: {
      status: "failed",
      responseBody: { error: error.message },
      completedAt: new Date(),
    },
  });
}
