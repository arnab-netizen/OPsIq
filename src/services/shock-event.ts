import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
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
  authContext: CanonicalAuthContext,
  workspaceId?: string
): Promise<{ id: string; engagementId: string; detectionConfirmed: boolean }> {
  const actorId = authContext.verifiedActorId;

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

  // SHOCK-01: persist the ShockEvent (the model exists — the prior "does not exist" comment
  // was false, so created shocks never appeared in listShockEventsForEngagement). The record
  // and its audit event are written atomically (AUDIT-01). Scoped by engagement (which was
  // already verified to belong to `workspaceId`).
  const shockEventId = randomUUID();
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.shockEvent.create({
      data: {
        id: shockEventId,
        engagementId: input.engagementId,
        type,
        severity: input.severity,
        happenedAt: happenedAtDate,
        notes: input.notes ?? null,
        reportedBy: actorId ?? null,
        createdBy: actorId ?? null,
        updatedAt: new Date(),
      },
    });
    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.SHOCK_EVENT_RECORDED,
        actorId,
        workspaceId,
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
      },
      tx
    );
  });

  // Trigger re-evaluation due to shock event
  await triggerReEvaluation({
    changeType: "shock_event",
    entityType: "ShockEvent",
    entityId: shockEventId,
    engagementId: input.engagementId,
    workspaceId,
    severity: input.severity,
    description: `Shock event recorded: ${type}${detectionConfirmed ? " (detection confirmed)" : ""}`,
    triggeredBy: actorId,
  });

  return { id: shockEventId, engagementId: input.engagementId, detectionConfirmed };
}

export async function updateShockEvent(
  shockEventId: string,
  input: UpdateShockEventInput,
  authContext: CanonicalAuthContext
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
  if (userId && workspaceId) {
    await assertEngagementAccess(userId, engagementId, workspaceId);
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
    await assertEngagementAccess(userId, shockEvent.engagementId, workspaceId);
  }

  return shockEvent;
}
