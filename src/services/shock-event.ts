import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { SHOCK_EVENT_TYPES, type ShockEventType, RISK_SEVERITIES, type RiskSeverity, INTERVENTION_PHASES, type InterventionPhase } from "@/domain/constants/statuses";
import { logger } from "@/infra/logger";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateShockEventInput {
  engagementId: string;
  eventType: ShockEventType;
  severity: RiskSeverity;
  title: string;
  description?: string;
  detectedAt: string;
}

// ─── Phase-Aware Gating ────────────────────────────────────────────────────
// Shock events may be recorded in any phase, but gating rules determine
// expectation/urgency. For now, all phases allow shock event creation.

const SHOCK_EVENT_PHASE_GATES: Partial<Record<InterventionPhase, boolean>> = {
  assessment: true,  // Expected during assessment
  planning: true,    // Can occur during planning
  execution: true,   // Critical during execution
  review: true,      // Review may discover new shocks
  handover: true,    // Late shocks still recordable
  closed: false,     // Closed engagements: no new shocks
};

function validateShockEventPhaseGate(phase: InterventionPhase): void {
  const allowed = SHOCK_EVENT_PHASE_GATES[phase];
  if (allowed === false) {
    throw new ValidationError(
      `Shock events cannot be recorded in "${phase}" phase`
    );
  }
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createShockEvent(
  input: CreateShockEventInput,
  actorId: string
): Promise<{ id: string; engagementId: string; eventType: ShockEventType; severity: RiskSeverity }> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
    include: {
      interventionState: true,
    },
  });

  if (!engagement) {
    throw new NotFoundError("Engagement", input.engagementId);
  }

  // Validate event type
  if (!SHOCK_EVENT_TYPES.includes(input.eventType)) {
    throw new ValidationError(
      `Invalid shock event type: ${input.eventType}. Must be one of: ${SHOCK_EVENT_TYPES.join(", ")}`
    );
  }

  // Validate severity
  if (!RISK_SEVERITIES.includes(input.severity)) {
    throw new ValidationError(
      `Invalid severity: ${input.severity}. Must be one of: ${RISK_SEVERITIES.join(", ")}`
    );
  }

  // Validate phase gate if intervention state exists
  if (engagement.interventionState) {
    validateShockEventPhaseGate(engagement.interventionState.currentPhase as InterventionPhase);
  }

  const event = await db.shockEvent.create({
    data: {
      engagementId: input.engagementId,
      eventType: input.eventType,
      severity: input.severity,
      title: input.title,
      description: input.description ?? null,
      detectedAt: new Date(input.detectedAt),
      recordedBy: actorId,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.SHOCK_EVENT_RECORDED,
    actorId,
    entityType: "shock_event",
    entityId: event.id,
    payload: {
      engagementId: input.engagementId,
      shockEventId: event.id,
      eventType: input.eventType,
      severity: input.severity,
      title: input.title,
    },
    visibility: "internal",
  });

  logger.info("Shock event recorded", {
    shockEventId: event.id,
    engagementId: input.engagementId,
    eventType: input.eventType,
    severity: input.severity,
  });

  return {
    id: event.id,
    engagementId: event.engagementId,
    eventType: event.eventType as ShockEventType,
    severity: event.severity as RiskSeverity,
  };
}

export async function listShockEventsForEngagement(
  engagementId: string,
  params: {
    limit?: number;
    offset?: number;
    severity?: string;
    eventType?: string;
  } = {}
) {
  const { limit = 25, offset = 0, severity, eventType } = params;

  // Verify engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });
  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  const where = {
    engagementId,
    ...(severity && { severity }),
    ...(eventType && { eventType }),
  };

  const [events, total] = await Promise.all([
    db.shockEvent.findMany({
      where,
      select: {
        id: true,
        eventType: true,
        severity: true,
        title: true,
        detectedAt: true,
        createdAt: true,
      },
      orderBy: { detectedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.shockEvent.count({ where }),
  ]);

  return { events, total, limit, offset };
}

export async function getShockEventById(shockEventId: string) {
  const event = await db.shockEvent.findUnique({
    where: { id: shockEventId },
  });

  if (!event) {
    throw new NotFoundError("ShockEvent", shockEventId);
  }

  return {
    id: event.id,
    engagementId: event.engagementId,
    eventType: event.eventType as ShockEventType,
    severity: event.severity as RiskSeverity,
    title: event.title,
    description: event.description,
    detectedAt: event.detectedAt,
    recordedBy: event.recordedBy,
    version: event.version,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}
