import type { ServiceCapabilityContext } from '@/lib/auth-guard';
import { enrichMutationAuditEvent } from '@/infra/audit-enrichment';
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { NotFoundError, ValidationError, ForbiddenError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { validateDecisionForAcceptance, type DecisionAcceptanceInput, type DecisionRejectionInput } from "./human-decision-validator";

export interface VerifiedAcceptanceInput {
  decisionId: string;
  engagementId: string;
  verifiedWorkspaceId: string;
  verifiedActorId: string;
  rationale?: string;
}

export interface AcceptanceRecord {
  decisionId: string;
  acceptedBy: string;
  acceptedAt: Date;
  rationale?: string;
  auditEventId: string;
}

export interface RejectionRecord {
  decisionId: string;
  rejectedBy: string;
  rejectedAt: Date;
  reason: string;
  auditEventId: string;
}

export interface VerifiedRejectionInput {
  decisionId: string;
  engagementId: string;
  verifiedWorkspaceId: string;
  verifiedActorId: string;
  reason: string;
}

export async function acceptDecision(input: VerifiedAcceptanceInput): Promise<AcceptanceRecord> {
  // Validate decision can be accepted
  const validation = await validateDecisionForAcceptance({
    decisionId: input.decisionId,
    engagementId: input.engagementId,
    workspaceId: input.verifiedWorkspaceId,
  });

  if (!validation.isValid) {
    throw new ValidationError(`Decision cannot be accepted: ${validation.errors.join(", ")}`);
  }

  // Fetch decision for audit context
  const decision = await db.operatorItem.findUnique({
    where: { id: input.decisionId },
  });

  if (!decision) {
    throw new NotFoundError("Decision", input.decisionId);
  }

  const now = new Date();

  // Update decision status
  const updated = await db.operatorItem.update({
    where: { id: input.decisionId },
    data: {
      status: "in_progress",
      lastUpdatedBy: input.verifiedActorId,
      updatedAt: now,
    },
  });

  // Emit audit event
  const auditEventId = await emitAuditEvent({
    eventName: AUDIT_EVENTS.DECISION_ACCEPTED,
    workspaceId: input.verifiedWorkspaceId,
    actorId: input.verifiedActorId,
    capability: "DECISION_ACCEPT",
    decision: "decision_accepted",
    requestId: input.requestId,
    actorType: "user",
    entityType: "OperatorItem",
    entityId: input.decisionId,
    payload: {
      decisionType: decision.decisionType,
      expectedImpact: decision.impactExpected,
      confidence: decision.confidence,
      rationale: input.rationale || "",
      previousStatus: decision.status,
      newStatus: updated.status,
    },
    visibility: "internal",
  });

  logger.info("Decision accepted", {
    decisionId: input.decisionId,
    acceptedBy: input.verifiedActorId,
    auditEventId,
    expectedImpact: decision.impactExpected,
  });

  return {
    decisionId: input.decisionId,
    acceptedBy: input.verifiedActorId,
    acceptedAt: now,
    rationale: input.rationale,
    auditEventId,
  };
}

export async function rejectDecision(input: VerifiedRejectionInput): Promise<RejectionRecord> {
  // Validate decision exists
  const decision = await db.operatorItem.findUnique({
    where: { id: input.decisionId },
  });

  if (!decision) {
    throw new NotFoundError("Decision", input.decisionId);
  }

  // Verify workspace isolation
  if (decision.workspaceId !== input.verifiedWorkspaceId) {
    throw new ForbiddenError("Workspace mismatch");
  }

  if (!input.reason || input.reason.trim().length === 0) {
    throw new ValidationError("Rejection reason is required");
  }

  const now = new Date();

  // Update decision status to blocked with reason
  const updated = await db.operatorItem.update({
    where: { id: input.decisionId },
    data: {
      status: "blocked",
      blockStage: "decision_gate",
      blockReason: input.reason,
      lastUpdatedBy: input.verifiedActorId,
      updatedAt: now,
    },
  });

  // Emit audit event
  const auditEventId = await emitAuditEvent({
    eventName: AUDIT_EVENTS.DECISION_REJECTED,
    workspaceId: input.verifiedWorkspaceId,
    actorId: input.verifiedActorId,
    capability: "DECISION_REJECT",
    decision: "decision_rejected",
    requestId: input.requestId,
    actorType: "user",
    entityType: "OperatorItem",
    entityId: input.decisionId,
    payload: {
      decisionType: decision.decisionType,
      expectedImpact: decision.impactExpected,
      confidence: decision.confidence,
      reason: input.reason,
      previousStatus: decision.status,
      newStatus: updated.status,
    },
    visibility: "internal",
  });

  logger.info("Decision rejected", {
    decisionId: input.decisionId,
    rejectedBy: input.verifiedActorId,
    reason: input.reason,
    auditEventId,
  });

  return {
    decisionId: input.decisionId,
    rejectedBy: input.verifiedActorId,
    rejectedAt: now,
    reason: input.reason,
    auditEventId,
  };
}

export async function getDecisionAcceptanceHistory(
  decisionId: string,
  workspaceId: string
): Promise<(AcceptanceRecord | RejectionRecord)[]> {
  const events = await db.auditEvent.findMany({
    where: {
      workspaceId,
      entityId: decisionId,
      entityType: "OperatorItem",
      eventName: {
        in: [AUDIT_EVENTS.DECISION_ACCEPTED, AUDIT_EVENTS.DECISION_REJECTED],
      },
    },
    orderBy: { occurredAt: "desc" },
  });

  return events.map((event: any) => {
    const payload = event.payload as Record<string, any>;
    if (event.eventName === AUDIT_EVENTS.DECISION_ACCEPTED) {
      return {
        decisionId: event.entityId || "",
        acceptedBy: event.actorId || "",
        acceptedAt: event.occurredAt,
        rationale: payload?.rationale,
        auditEventId: event.id,
      };
    } else {
      return {
        decisionId: event.entityId || "",
        rejectedBy: event.actorId || "",
        rejectedAt: event.occurredAt,
        reason: payload?.reason || "",
        auditEventId: event.id,
      };
    }
  });
}
