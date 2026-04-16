import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { withIdempotency } from "@/infra/idempotency";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { logger } from "@/infra/logger";
import type { ShockEventType, ShockEventSeverity } from "@/generated/prisma/client";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateShockEventInput {
  engagementId: string;
  type: string; // shock event type as string
  severity: string; // severity level as string
  happenedAt: string; // ISO date string
  notes?: string;
}

// ─── Validation ────────────────────────────────────────────────────────────

const VALID_SHOCK_EVENT_TYPES = [
  "KEY_EMPLOYEE_LOSS",
  "MAJOR_CLIENT_LOSS",
  "PAYROLL_PRESSURE",
  "MARGIN_COLLAPSE",
  "SUPPLIER_FAILURE",
  "SERVICE_BREAKDOWN",
  "COMPLIANCE_ISSUE",
  "REPUTATION_DAMAGE",
  "INTERNAL_CONFLICT",
  "OWNER_WITHDRAWAL",
  "EXECUTION_STALL",
] as const;

const VALID_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

// Mapping from input (lowercase) to Prisma enum (UPPERCASE)
function toShockEventType(input: string): ShockEventType {
  const normalized = input
    .toUpperCase()
    .replace(/[_-]/g, "_");

  if (!VALID_SHOCK_EVENT_TYPES.includes(normalized as ShockEventType)) {
    throw new ValidationError(
      `Invalid shock event type: ${input}. Must be one of: ${VALID_SHOCK_EVENT_TYPES.join(", ")}`
    );
  }
  return normalized as ShockEventType;
}

function toSeverity(input: string): ShockEventSeverity {
  const normalized = input.toUpperCase();

  if (!VALID_SEVERITIES.includes(normalized as ShockEventSeverity)) {
    throw new ValidationError(
      `Invalid severity: ${input}. Must be one of: ${VALID_SEVERITIES.join(", ")}`
    );
  }
  return normalized as ShockEventSeverity;
}

// Map severity to re-evaluation severity for consistency
function reEvaluationSeverity(severity: ShockEventSeverity): "low" | "medium" | "high" | "critical" {
  return severity.toLowerCase() as "low" | "medium" | "high" | "critical";
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createShockEvent(
  input: CreateShockEventInput,
  actorId: string
): Promise<{ id: string; type: string; severity: string }> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
    select: { id: true, code: true, title: true },
  });
  if (!engagement) {
    throw new NotFoundError("Engagement", input.engagementId);
  }

  // Validate and convert inputs
  const type = toShockEventType(input.type);
  const severity = toSeverity(input.severity);
  const happenedAt = new Date(input.happenedAt);

  if (isNaN(happenedAt.getTime())) {
    throw new ValidationError("Invalid happenedAt date format");
  }

  // Create idempotency key: unique per engagement + type + timestamp + actor
  const idempotencyKey = `shock-event:${input.engagementId}:${type}:${happenedAt.toISOString()}:${actorId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "shock_event.create",
    async () => {
      const shockEvent = await db.shockEvent.create({
        data: {
          engagementId: input.engagementId,
          type,
          severity,
          happenedAt,
          notes: input.notes ?? null,
          createdBy: actorId,
        },
      });
      return shockEvent;
    }
  );

  // Emit audit event
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.SHOCK_EVENT_RECORDED,
    actorId,
    entityType: "shock_event",
    entityId: result.result.id,
    payload: {
      engagementId: input.engagementId,
      type: result.result.type,
      severity: result.result.severity,
      happenedAt: result.result.happenedAt.toISOString(),
      notes: result.result.notes,
    },
    visibility: "internal",
  });

  // Trigger adaptive re-evaluation
  // Note: Map the shock event type to the change type for re-evaluation
  let changeType: "shock_event" | "major_client_loss" | "key_employee_loss" = "shock_event";
  if (type === "MAJOR_CLIENT_LOSS") changeType = "major_client_loss";
  if (type === "KEY_EMPLOYEE_LOSS") changeType = "key_employee_loss";

  await triggerReEvaluation({
    changeType,
    entityType: "shock_event",
    entityId: result.result.id,
    engagementId: input.engagementId,
    severity: reEvaluationSeverity(severity),
    description: `Shock event recorded: ${type}`,
    triggeredBy: actorId,
  });

  logger.info("Shock event created", {
    shockEventId: result.result.id,
    engagementId: input.engagementId,
    type,
  });

  return {
    id: result.result.id,
    type: result.result.type,
    severity: result.result.severity,
  };
}

export async function getShockEventById(
  shockEventId: string,
  engagementId?: string
) {
  const where = {
    id: shockEventId,
    ...(engagementId && { engagementId }),
  };

  const shockEvent = await db.shockEvent.findFirst({
    where,
    include: {
      engagement: {
        select: {
          id: true,
          code: true,
          title: true,
          clientId: true,
        },
      },
    },
  });

  if (!shockEvent) {
    throw new NotFoundError("ShockEvent", shockEventId);
  }

  return shockEvent;
}

export async function listShockEventsByEngagement(params: {
  engagementId: string;
  limit?: number;
  offset?: number;
} = {} as any) {
  const { engagementId, limit = 25, offset = 0 } = params;

  // Verify engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: { id: true },
  });
  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  const [shockEvents, total] = await Promise.all([
    db.shockEvent.findMany({
      where: { engagementId },
      select: {
        id: true,
        type: true,
        severity: true,
        happenedAt: true,
        notes: true,
        createdAt: true,
        createdBy: true,
      },
      orderBy: { happenedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.shockEvent.count({ where: { engagementId } }),
  ]);

  return { shockEvents, total, limit, offset };
}
