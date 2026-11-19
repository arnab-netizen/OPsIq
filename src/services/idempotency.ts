import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import {
  AppError,
  BadRequestError,
  ConflictError,
  DuplicateSubmissionError,
  ForbiddenError,
  InvalidStateTransitionError,
  NotFoundError,
  OptimisticLockError,
  PlanLimitError,
  PolicyViolationError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
  type ErrorCode,
} from "@/infra/errors";
import crypto from "crypto";
import { randomUUID } from "crypto";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export interface IdempotencyOptions {
  idempotencyKey: string;
  operationName: string;
  authContext?: unknown;
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

/**
 * Stored-hash format that binds a record to the verified caller: `v2:<scope>:<payload>`, where <scope> is a
 * hash of the verified workspace and actor (options.workspaceId / options.actorId, else the verified ids on
 * authContext). The schema has no workspace/actor columns and the key is globally unique, so a record is
 * bound to its caller through this hash: another workspace or actor sending the same key never matches it
 * and is refused (400) instead of being served the first caller's cached outcome. Records written before
 * this format (a bare payload hash) carry no caller and are matched as before until they expire.
 */
const SCOPED_HASH_PREFIX = "v2:";

function scopeOf(options: IdempotencyOptions): string {
  const ctx = (options.authContext && typeof options.authContext === "object" ? options.authContext : {}) as {
    verifiedWorkspaceId?: unknown;
    verifiedActorId?: unknown;
  };
  const workspaceId = options.workspaceId ?? (typeof ctx.verifiedWorkspaceId === "string" ? ctx.verifiedWorkspaceId : "");
  const actorId = options.actorId ?? (typeof ctx.verifiedActorId === "string" ? ctx.verifiedActorId : "");
  return crypto.createHash("sha256").update(`workspace:${workspaceId}|actor:${actorId}`).digest("hex");
}

/** Refuse a record that belongs to another caller, another operation or another payload. */
function assertRecordMatches(
  record: { operationName: string; payload: string | null },
  operationName: string,
  scopeHash: string,
  payloadHash: string
): void {
  const stored = record.payload;
  if (stored && stored.startsWith(SCOPED_HASH_PREFIX)) {
    const [storedScope, storedPayload] = stored.slice(SCOPED_HASH_PREFIX.length).split(":");
    // Checked first, and answered without any detail of the other caller's request.
    if (storedScope !== scopeHash) {
      throw new ValidationError("This idempotency key has already been used. Send the request with a new idempotency key.");
    }
    if (record.operationName !== operationName) {
      throw new ValidationError(
        `Idempotency key reused for different operation. Original: ${record.operationName}, Current: ${operationName}`
      );
    }
    if (storedPayload !== payloadHash) {
      throw new ValidationError(
        `Idempotency key reused with different payload. Cannot retry request with different parameters.`
      );
    }
    return;
  }
  // Legacy record (bare payload hash, no caller binding).
  if (record.operationName !== operationName) {
    throw new ValidationError(
      `Idempotency key reused for different operation. Original: ${record.operationName}, Current: ${operationName}`
    );
  }
  if (stored && stored !== payloadHash) {
    throw new ValidationError(
      `Idempotency key reused with different payload. Cannot retry request with different parameters.`
    );
  }
}

export async function checkIdempotencyKey(
  options: IdempotencyOptions
): Promise<IdempotencyCheckResult> {
  const { idempotencyKey, operationName, payload, expirationMinutes = 24 * 60 } = options;

  const payloadHash = hashPayload(payload);
  const scopeHash = scopeOf(options);
  const storedHash = `${SCOPED_HASH_PREFIX}${scopeHash}:${payloadHash}`;
  const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

  // Atomically create or fetch existing record
  // IdempotencyRecord uses idempotencyKey as UNIQUE constraint
  // No workspace scoping in schema - idempotencyKey itself provides global uniqueness
  let existing = await db.idempotencyRecord.findFirst({
    where: { idempotencyKey },
  });

  // An expired record is recycled first, whoever wrote it: it is no longer anyone's answer, so the key is
  // claimed afresh below (the create path handles a concurrent claim of the same key).
  if (existing && existing.expiresAt < new Date()) {
    await db.idempotencyRecord.deleteMany({ where: { id: existing.id } });
    existing = null;
  }

  if (existing) {
    // Verify caller, operation name and payload match (reject any other use of the same key)
    assertRecordMatches(existing, operationName, scopeHash, payloadHash);

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

    // If failed, replay the recorded error with its original status and code
    if (existing.status === "failed") {
      return {
        isNew: false,
        cachedError: restoreCachedError(existing.responseBody),
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
        payload: storedHash,
        status: "pending",
        expiresAt,
      },
    });
  } catch (err: unknown) {
    // Handle concurrent creation race
    if ((err as { code?: unknown } | null)?.code === "P2002") {
      // Another request won the race - fetch and check its status
      const concurrent = await db.idempotencyRecord.findFirst({
        where: { idempotencyKey },
      });
      if (concurrent) {
        // Verify caller, operation name and payload match
        assertRecordMatches(concurrent, operationName, scopeHash, payloadHash);

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
          return {
            isNew: false,
            cachedError: restoreCachedError(concurrent.responseBody),
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

  // Finalize this caller's claim: the pending record, or a FAILED record being re-run. Callers that do not
  // replay cachedError re-run a failed key's write; completing the failed record makes later retries replay
  // the success instead of re-running again. Only the record's own caller can get here: checkIdempotencyKey
  // refuses any other workspace/actor (assertRecordMatches) before the write, and no route records for a
  // key it did not pass the check for. A completed record is final and never overwritten.
  await db.idempotencyRecord.updateMany({
    where: { idempotencyKey, status: { in: ["pending", "failed"] } },
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

  // A refusal that may clear on retry (telemetry.retryable: a 429, an unverifiable entitlement, a
  // "please try again" conflict, a transient 503) is not this key's final answer: release the claim so a
  // retry with the same key re-runs instead of replaying the refusal for the key's lifetime.
  if (error instanceof AppError && error.telemetry.retryable) {
    await db.idempotencyRecord.deleteMany({ where: { idempotencyKey, status: "pending" } });
    return;
  }

  const recorded = toRecordedError(error);
  // Finalize this caller's claim (pending, or a failed record being re-run; see recordIdempotencyResponse).
  await db.idempotencyRecord.updateMany({
    where: { idempotencyKey, status: { in: ["pending", "failed"] } },
    data: {
      status: "failed",
      responseCode: recorded.statusCode,
      responseBody: recorded as unknown as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });
}

/**
 * What a failed idempotent request persists so a retry of the same key gets the SAME client answer.
 * A 4xx AppError keeps its status, code, class name, owner-safe message and JSON-safe details (the message
 * the client already saw: every 4xx AppError message is owner-safe by contract). Anything else, including
 * every 5xx, is stored as a generic internal error: its message is never persisted, so it is never replayed.
 */
interface RecordedIdempotencyError {
  error: string;
  errorName: string;
  statusCode: number;
  code: string;
  details?: Record<string, unknown>;
}

const GENERIC_INTERNAL_FAILURE_TEXT = "Something went wrong on our side. Nothing was saved. Please try again.";

function isClientAppError(error: unknown): error is AppError {
  return error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500;
}

function jsonSafeDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!details) return undefined;
  try {
    const copy = JSON.parse(JSON.stringify(details)) as unknown;
    return copy && typeof copy === "object" && !Array.isArray(copy) ? (copy as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function toRecordedError(error: Error): RecordedIdempotencyError {
  if (isClientAppError(error)) {
    const details = jsonSafeDetails(error.details);
    return {
      error: error.message,
      errorName: error.name,
      statusCode: error.statusCode,
      code: error.code,
      ...(details ? { details } : {}),
    };
  }
  // Internal failure: classify for the server log only; the stored record carries no message of it.
  classifyOperatorError(error, { context: "load" });
  return { error: GENERIC_INTERNAL_FAILURE_TEXT, errorName: "InternalError", statusCode: 500, code: "INTERNAL_ERROR" };
}

const LAYER1_CODES = new Set(["AUTH_MISSING", "AUTH_MALFORMED", "AUTH_INVALID", "AUTH_EXPIRED", "AUTH_REVOKED", "AUTH_TAMPERED"]);
const FORBIDDEN_CODES = new Set([
  "WORKSPACE_MISSING",
  "WORKSPACE_MALFORMED",
  "WORKSPACE_NOT_FOUND",
  "WORKSPACE_MEMBERSHIP_MISSING",
  "WORKSPACE_MEMBERSHIP_INACTIVE",
  "WORKSPACE_INACTIVE",
  "CAPABILITY_NOT_GRANTED",
  "CAPABILITY_REVOKED",
]);

function detail(details: Record<string, unknown>, key: string): string {
  const value = details[key];
  return typeof value === "string" ? value : "unknown";
}

/** The AppError subclass for a recorded 4xx code, built from the recorded owner-safe text and details. */
function rebuildClientError(code: string, text: string, details: Record<string, unknown>): AppError {
  switch (code) {
    case "PLAN_LIMIT_EXCEEDED":
      return new PlanLimitError(detail(details, "capability"), text);
    case "VALIDATION_ERROR":
      return new ValidationError(text, details);
    case "BAD_REQUEST":
      return new BadRequestError(text, details);
    case "NOT_FOUND":
      return new NotFoundError(detail(details, "entityType"), detail(details, "entityId"));
    case "CONFLICT":
      return new ConflictError(text, details);
    case "DUPLICATE_SUBMISSION":
      return new DuplicateSubmissionError(detail(details, "idempotencyKey"));
    case "INVALID_STATE_TRANSITION":
      return new InvalidStateTransitionError(detail(details, "entityType"), detail(details, "from"), detail(details, "to"));
    case "OPTIMISTIC_LOCK_FAILURE":
      return new OptimisticLockError(detail(details, "entityType"), detail(details, "entityId"));
    case "POLICY_VIOLATION":
      return new PolicyViolationError(detail(details, "policy"), text);
    case "RATE_LIMITED":
      return new TooManyRequestsError(text, details);
  }
  if (LAYER1_CODES.has(code)) return new UnauthorizedError(code, text);
  if (FORBIDDEN_CODES.has(code)) return new ForbiddenError(code, text);
  return new ValidationError(text, details);
}

function genericInternalError(): AppError {
  return new AppError("INTERNAL_ERROR", GENERIC_INTERNAL_FAILURE_TEXT, 500, {
    telemetryClass: "INTERNAL_ERROR",
    auditClass: "INTERNAL_ERROR",
    severity: "HIGH",
    retryable: false,
    securityRelevant: false,
    infrastructureRelevant: true,
    abuseRelevant: false,
    handlerAllowed: false,
    mutationAllowed: false,
  });
}

/**
 * Rebuild the error a failed idempotent request answered with: the matching AppError subclass with the
 * recorded status, code, message and details, so the canonical wrapper renders the retry exactly like the
 * first response (402 stays 402, 404 stays 404, ...). A record without a recorded 4xx status (a 5xx, or a
 * record written before statuses were recorded) replays as a generic 500 that carries no stored message.
 */
function restoreCachedError(responseBody: unknown): AppError {
  const recorded = (responseBody && typeof responseBody === "object" ? responseBody : {}) as Partial<RecordedIdempotencyError>;
  const { statusCode, code, error: message } = recorded;
  if (
    typeof statusCode !== "number" ||
    statusCode < 400 ||
    statusCode >= 500 ||
    typeof code !== "string" ||
    typeof message !== "string"
  ) {
    return genericInternalError();
  }
  const details = recorded.details && typeof recorded.details === "object" ? recorded.details : {};
  let rebuilt = rebuildClientError(code, message, details);
  if (rebuilt.statusCode !== statusCode || rebuilt.code !== code) {
    // A recorded code whose class answers with another status: keep the recorded status and code exactly.
    rebuilt = new AppError(code as ErrorCode, message, statusCode, rebuilt.telemetry, details);
  }
  // Constructors that derive their message (NotFoundError, ...) must still replay the recorded text.
  rebuilt.message = message;
  return rebuilt;
}
