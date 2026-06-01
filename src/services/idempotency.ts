import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { ValidationError } from "@/infra/errors";
import crypto from "crypto";
import { randomUUID } from "crypto";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export interface IdempotencyOptions {
  idempotencyKey: string;
  operationName: string;
  authContext?: any;
  actorId?: string;
  workspaceId?: string;
  payload: Record<string, unknown>;
  expirationMinutes?: number;
}

export interface IdempotencyCheckResult {
  isNew: boolean;
  cachedResponse?: {
    status: number;
    body: Record<string, unknown>;
  };
  cachedError?: Error;
}

function hashPayload(payload: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function checkIdempotencyKey(
  options: IdempotencyOptions
): Promise<IdempotencyCheckResult> {
  const { idempotencyKey, operationName, payload, expirationMinutes = 24 * 60 } = options;

  const payloadHash = hashPayload(payload);
  const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

  // Atomically create or fetch existing record
  // IdempotencyRecord uses idempotencyKey as UNIQUE constraint
  // No workspace scoping in schema - idempotencyKey itself provides global uniqueness
  const existing = await db.idempotencyRecord.findFirst({
    where: { idempotencyKey },
  });

  if (existing) {
    // Verify operation name matches
    if (existing.operationName !== operationName) {
      throw new ValidationError(
        `Idempotency key reused for different operation. Original: ${existing.operationName}, Current: ${operationName}`
      );
    }

    // Verify payload matches (reject different payload with same key)
    if (existing.payload && existing.payload !== payloadHash) {
      throw new ValidationError(
        `Idempotency key reused with different payload. Cannot retry request with different parameters.`
      );
    }

    // If request has expired, treat as new
    if (existing.expiresAt < new Date()) {
      // Delete expired record and proceed to create new one
      await db.idempotencyRecord.delete({ where: { id: existing.id } });

      // Create new record for this request
      try {
        await db.idempotencyRecord.create({
          data: {
            id: randomUUID(),
            idempotencyKey,
            operationName,
            payload: payloadHash,
            status: "pending",
            expiresAt,
          },
        });
      } catch (err: any) {
        if (err.code === "P2002") {
          // Unique constraint violation due to concurrent request
          // Fetch the newly created record from concurrent request
          const concurrent = await db.idempotencyRecord.findFirst({
            where: { idempotencyKey },
          });
          if (concurrent && concurrent.status === "pending") {
            throw new ValidationError(
              "Duplicate request in flight with same idempotency key. Please wait for the original request to complete."
            );
          }
        }
        throw err;
      }
      return { isNew: true };
    }

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

    // If failed, return the cached error
    if (existing.status === "failed") {
      const errorData = existing.responseBody as Record<string, unknown>;
      const errorMessage = (errorData?.error as string) || "Unknown error";
      const errorName = (errorData?.errorName as string) || "Error";

      const error = new Error(errorMessage);
      error.name = errorName;

      return {
        isNew: false,
        cachedError: error,
      };
    }
  }

  // Create new idempotency record
  try {
    await db.idempotencyRecord.create({
      data: {
        id: randomUUID(),
        idempotencyKey,
        operationName,
        payload: payloadHash,
        status: "pending",
        expiresAt,
      },
    });
  } catch (err: any) {
    // Handle concurrent creation race
    if (err.code === "P2002") {
      // Another request won the race - fetch and check its status
      const concurrent = await db.idempotencyRecord.findFirst({
        where: { idempotencyKey },
      });
      if (concurrent) {
        // Verify operation name matches
        if (concurrent.operationName !== operationName) {
          throw new ValidationError(
            `Idempotency key reused for different operation. Original: ${concurrent.operationName}, Current: ${operationName}`
          );
        }

        // Verify payload matches
        if (concurrent.payload && concurrent.payload !== payloadHash) {
          throw new ValidationError(
            `Idempotency key reused with different payload. Cannot retry request with different parameters.`
          );
        }

        // If in flight, reject duplicate
        if (concurrent.status === "pending") {
          throw new ValidationError(
            "Duplicate request in flight with same idempotency key. Please wait for the original request to complete."
          );
        }

        // Return the concurrent result
        if (concurrent.status === "completed" && concurrent.responseCode && concurrent.responseBody) {
          return {
            isNew: false,
            cachedResponse: {
              status: concurrent.responseCode,
              body: concurrent.responseBody as Record<string, unknown>,
            },
          };
        }

        if (concurrent.status === "failed") {
          const errorData = concurrent.responseBody as Record<string, unknown>;
          const errorMessage = (errorData?.error as string) || "Unknown error";
          const errorName = (errorData?.errorName as string) || "Error";

          const error = new Error(errorMessage);
          error.name = errorName;

          return {
            isNew: false,
            cachedError: error,
          };
        }
      }
    }
    throw err;
  }

  return { isNew: true };
}

export async function recordIdempotencyResponse(
  idempotencyKey: string,
  statusCode: number,
  responseBody: Record<string, unknown>,
  workspaceId?: string
): Promise<void> {
  // workspaceId parameter accepted for backward compatibility but not used
  // IdempotencyRecord schema does not have workspaceId field
  // Clients must ensure idempotencyKey is globally unique

  await db.idempotencyRecord.updateMany({
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
  error: Error,
  workspaceId?: string
): Promise<void> {
  // workspaceId parameter accepted for backward compatibility but not used
  // IdempotencyRecord schema does not have workspaceId field
  // Clients must ensure idempotencyKey is globally unique

  const governed = classifyOperatorError(error, { context: "load" });
  await db.idempotencyRecord.updateMany({
    where: { idempotencyKey },
    data: {
      status: "failed",
      responseBody: {
        error: governed.operatorMessage,
        errorName: error.name,
      } as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });
}
