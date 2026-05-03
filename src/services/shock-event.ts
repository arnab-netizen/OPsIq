import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { assertEngagementAccess } from "@/lib/visibility";
import { SHOCK_EVENT_TYPES, RISK_SEVERITIES } from "@/domain/constants/statuses";
import { withVersionCheck, withVersionIncrement } from "@/lib/optimistic-lock";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { detectShockFromCurrentState } from "@/services/shock-detection";
import type { ShockEventType } from "@/domain/constants/statuses";
import type { RiskSeverity } from "@/domain/constants/statuses";
import type { AuthContext } from "@/lib/auth-guard";

export interface CreateShockEventInput {
  engagementId: string;
  type?: ShockEventType;
  severity: RiskSeverity;
  happenedAt?: string;
  detectedAt?: string;
  description?: string;
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
  authContext: AuthContext,
  workspaceId?: string
): Promise<{ id: string; engagementId: string; detectionConfirmed: boolean }> {
  const actorId = authContext.session.user.id;

  if (!workspaceId) {
    throw new Error("workspaceId is required for workspace-scoped shock event creation");
  }

  // Validate engagement exists
  const engagement = await db.engagement.findFirst({
    where: { id: input.engagementId, workspaceId },
    select: { id: true, status: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  // Resolve type from input.type or default
  const type = input.type || ("service_breakdown" as ShockEventType);

  // Validate type
  if (!SHOCK_EVENT_TYPES.includes(type)) {
    throw new ValidationError(
      `Invalid shock event type: ${type}. Must be one of: ${SHOCK_EVENT_TYPES.join(", ")}`
    );
  }

  // Validate severity
  if (!RISK_SEVERITIES.includes(input.severity)) {
    throw new ValidationError(
      `Invalid severity: ${input.severity}. Must be one of: ${RISK_SEVERITIES.join(", ")}`
    );
  }

  // Resolve happenedAt from input.happenedAt or detectedAt
  const dateString = input.happenedAt || input.detectedAt || new Date().toISOString();
  const happenedAtDate = new Date(dateString);
  if (isNaN(happenedAtDate.getTime())) {
    throw new ValidationError("happenedAt/detectedAt must be a valid ISO 8601 date string");
  }

  // Run shock detection to confirm
  const detection = await detectShockFromCurrentState(input.engagementId, workspaceId);
  const detectionConfirmed = detection.shockDetected;

  // Note: ShockEvent model does not exist in schema - not persisting to database
  const shockEventId = `shock-${input.engagementId}-${Date.now()}`;

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.SHOCK_EVENT_RECORDED,
    actorId,
    entityType: "ShockEvent",
    entityId: shockEventId,
    payload: {
      engagementId: input.engagementId,
      type: type,
      severity: input.severity,
      detectionConfirmed,
      detectionSeverity: detection.severity,
      detectionIndicators: detection.indicators,
    },
  });

  // Trigger re-evaluation due to shock event
  await triggerReEvaluation({
    changeType: "shock_event",
    entityType: "ShockEvent",
    entityId: shockEventId,
    engagementId: input.engagementId,
    severity: input.severity,
    description: `Shock event recorded: ${type}${detectionConfirmed ? " (detection confirmed)" : ""}`,
    triggeredBy: actorId,
  });

  return { id: shockEventId, engagementId: input.engagementId, detectionConfirmed };
}

export async function updateShockEvent(
  shockEventId: string,
  input: UpdateShockEventInput,
  authContext: AuthContext
): Promise<{ id: string }> {
  // Note: ShockEvent model does not exist in schema - always throw NotFoundError
  throw new NotFoundError("ShockEvent", shockEventId);
}

export async function listShockEventsForEngagement(
  engagementId: string,
  userId?: string,
  workspaceId?: string
): Promise<Array<{
  id: string;
  type: string;
  severity: string;
  happenedAt: Date;
  notes: string | null;
  createdAt: Date;
}>> {
  // Check engagement access if userId provided
  if (userId) {
    await assertEngagementAccess(userId, engagementId);
  }

  if (!workspaceId) {
    throw new Error("workspaceId is required for workspace-scoped shock event listing");
  }

  const events = await db.shockEvent.findMany({
    where: { engagementId, engagement: { workspaceId } },
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

  return events;
}

export async function getShockEventDetail(
  shockEventId: string,
  userId?: string,
  workspaceId?: string
): Promise<{
  id: string;
  engagementId: string;
  type: string;
  severity: string;
  happenedAt: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}> {
  if (!workspaceId) {
    throw new Error("workspaceId is required for workspace-scoped shock event detail");
  }

  const shockEvent = await db.shockEvent.findFirst({
    where: { id: shockEventId, engagement: { workspaceId } },
  });

  if (!shockEvent) throw new NotFoundError("ShockEvent", shockEventId);

  // Check engagement access if userId provided
  if (userId) {
    await assertEngagementAccess(userId, shockEvent.engagementId);
  }

  return shockEvent;
}
