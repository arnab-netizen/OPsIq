import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { SHOCK_EVENT_TYPES, RISK_SEVERITIES } from "@/domain/constants/statuses";
import { withVersionCheck, withVersionIncrement } from "@/lib/optimistic-lock";
import { triggerReEvaluation } from "@/services/re-evaluation";
import type { ShockEventType } from "@/domain/constants/statuses";
import type { RiskSeverity } from "@/domain/constants/statuses";

export interface CreateShockEventInput {
  engagementId: string;
  type: ShockEventType;
  severity: RiskSeverity;
  happenedAt: string;
  notes?: string;
}

export interface UpdateShockEventInput {
  type?: ShockEventType;
  severity?: RiskSeverity;
  happenedAt?: string;
  notes?: string;
  version: number;
}

export async function createShockEvent(
  input: CreateShockEventInput,
  actorId: string
): Promise<{ id: string; engagementId: string }> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
    select: { id: true, status: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  // Validate type
  if (!SHOCK_EVENT_TYPES.includes(input.type)) {
    throw new ValidationError(
      `Invalid shock event type: ${input.type}. Must be one of: ${SHOCK_EVENT_TYPES.join(", ")}`
    );
  }

  // Validate severity
  if (!RISK_SEVERITIES.includes(input.severity)) {
    throw new ValidationError(
      `Invalid severity: ${input.severity}. Must be one of: ${RISK_SEVERITIES.join(", ")}`
    );
  }

  // Validate happenedAt is valid date
  const happenedAtDate = new Date(input.happenedAt);
  if (isNaN(happenedAtDate.getTime())) {
    throw new ValidationError("happenedAt must be a valid ISO 8601 date string");
  }

  const shockEvent = await db.shockEvent.create({
    data: {
      engagementId: input.engagementId,
      type: input.type,
      severity: input.severity,
      happenedAt: happenedAtDate,
      notes: input.notes,
      createdBy: actorId,
    },
    select: { id: true, engagementId: true },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.SHOCK_EVENT_RECORDED,
    actorId,
    entityType: "ShockEvent",
    entityId: shockEvent.id,
    payload: {
      engagementId: input.engagementId,
      type: input.type,
      severity: input.severity,
    },
  });

  // Trigger re-evaluation due to shock event
  await triggerReEvaluation({
    changeType: "shock_event",
    entityType: "ShockEvent",
    entityId: shockEvent.id,
    engagementId: input.engagementId,
    severity: input.severity,
    description: `Shock event recorded: ${input.type}`,
    triggeredBy: actorId,
  });

  return shockEvent;
}

export async function updateShockEvent(
  shockEventId: string,
  input: UpdateShockEventInput,
  actorId: string
): Promise<{ id: string }> {
  // Validate shock event exists
  const existing = await db.shockEvent.findUnique({
    where: { id: shockEventId },
    select: { id: true, engagementId: true, version: true },
  });
  if (!existing) throw new NotFoundError("ShockEvent", shockEventId);

  // Version check
  if (existing.version !== input.version) {
    throw new ValidationError(
      `Version conflict: expected ${existing.version}, got ${input.version}`
    );
  }

  // Validate type if provided
  if (input.type && !SHOCK_EVENT_TYPES.includes(input.type)) {
    throw new ValidationError(
      `Invalid shock event type: ${input.type}. Must be one of: ${SHOCK_EVENT_TYPES.join(", ")}`
    );
  }

  // Validate severity if provided
  if (input.severity && !RISK_SEVERITIES.includes(input.severity)) {
    throw new ValidationError(
      `Invalid severity: ${input.severity}. Must be one of: ${RISK_SEVERITIES.join(", ")}`
    );
  }

  // Validate happenedAt if provided
  let happenedAt: Date | undefined;
  if (input.happenedAt) {
    happenedAt = new Date(input.happenedAt);
    if (isNaN(happenedAt.getTime())) {
      throw new ValidationError("happenedAt must be a valid ISO 8601 date string");
    }
  }

  const updated = await db.shockEvent.update({
    where: { id: shockEventId },
    data: {
      type: input.type,
      severity: input.severity,
      happenedAt,
      notes: input.notes,
      version: { increment: 1 },
    },
    select: { id: true, engagementId: true },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.SHOCK_EVENT_UPDATED,
    actorId,
    entityType: "ShockEvent",
    entityId: shockEventId,
    payload: {
      engagementId: updated.engagementId,
      type: input.type,
      severity: input.severity,
    },
  });

  // Trigger re-evaluation due to shock event update
  await triggerReEvaluation({
    changeType: "shock_event",
    entityType: "ShockEvent",
    entityId: shockEventId,
    engagementId: existing.engagementId,
    severity: input.severity || "medium",
    description: "Shock event updated",
    triggeredBy: actorId,
  });

  return { id: updated.id };
}

export async function listShockEventsForEngagement(
  engagementId: string
): Promise<Array<{
  id: string;
  type: string;
  severity: string;
  happenedAt: Date;
  notes: string | null;
  createdAt: Date;
}>> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: { id: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  return db.shockEvent.findMany({
    where: { engagementId },
    select: {
      id: true,
      type: true,
      severity: true,
      happenedAt: true,
      notes: true,
      createdAt: true,
    },
    orderBy: { happenedAt: "desc" },
  });
}

export async function getShockEventDetail(
  shockEventId: string
): Promise<{
  id: string;
  engagementId: string;
  type: string;
  severity: string;
  happenedAt: Date;
  notes: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}> {
  const event = await db.shockEvent.findUnique({
    where: { id: shockEventId },
    select: {
      id: true,
      engagementId: true,
      type: true,
      severity: true,
      happenedAt: true,
      notes: true,
      version: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!event) throw new NotFoundError("ShockEvent", shockEventId);
  return event;
}
