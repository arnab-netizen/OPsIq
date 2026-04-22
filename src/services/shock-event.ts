import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { getInterventionState } from "./intervention-state";
import { triggerReEvaluation } from "./re-evaluation";

export interface CreateShockEventInput {
  engagementId: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  detectedAt: string;
}

export interface ShockEventOutput {
  id: string;
  engagementId: string;
  description: string;
  severity: string;
  detectedBy: string;
  detectedAt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export async function createShockEvent(
  input: CreateShockEventInput,
  actorId: string
): Promise<ShockEventOutput> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });

  if (!engagement) {
    throw new NotFoundError("Engagement", input.engagementId);
  }

  // Validate engagement phase is not CLOSED
  const interventionState = await getInterventionState(input.engagementId);
  if (interventionState.currentPhase === "closed") {
    throw new ValidationError(
      "Cannot record shock events for engagements in CLOSED phase"
    );
  }

  // Create shock event
  const shockEvent = await db.shockEvent.create({
    data: {
      engagementId: input.engagementId,
      description: input.description,
      severity: input.severity,
      detectedBy: actorId,
      detectedAt: new Date(input.detectedAt),
    },
  });

  // Emit audit event
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.SHOCK_EVENT_RECORDED,
    actorId,
    entityType: "shock_event",
    entityId: shockEvent.id,
    payload: {
      engagementId: input.engagementId,
      description: input.description,
      severity: input.severity,
      detectedAt: input.detectedAt,
    },
    visibility: "internal",
  });

  // Trigger re-evaluation
  await triggerReEvaluation({
    changeType: "shock_event",
    entityType: "shock_event",
    entityId: shockEvent.id,
    engagementId: input.engagementId,
    severity: input.severity,
    description: `Shock event detected: ${input.description}`,
    triggeredBy: actorId,
    correlationId: shockEvent.id,
  });

  logger.info("Shock event created", {
    shockEventId: shockEvent.id,
    engagementId: input.engagementId,
    severity: input.severity,
  });

  return formatShockEvent(shockEvent);
}

export async function listShockEvents(
  engagementId: string
): Promise<ShockEventOutput[]> {
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });

  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  const events = await db.shockEvent.findMany({
    where: { engagementId },
    orderBy: { detectedAt: "desc" },
  });

  return events.map(formatShockEvent);
}

export async function getShockEvent(id: string): Promise<ShockEventOutput> {
  const shockEvent = await db.shockEvent.findUnique({
    where: { id },
  });

  if (!shockEvent) {
    throw new NotFoundError("ShockEvent", id);
  }

  return formatShockEvent(shockEvent);
}

function formatShockEvent(event: any): ShockEventOutput {
  return {
    id: event.id,
    engagementId: event.engagementId,
    description: event.description,
    severity: event.severity,
    detectedBy: event.detectedBy,
    detectedAt: event.detectedAt.toISOString(),
    version: event.version,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}
