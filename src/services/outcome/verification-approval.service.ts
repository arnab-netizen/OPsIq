import { db } from "@/lib/db";
import { ValidationError, NotFoundError, UnauthorizedError } from "@/infra/errors";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { logger } from "@/infra/logger";
import { buildAuditTrail } from "./verification";

const ALLOWED_VERIFICATION_STATUSES = ["verified", "disputed"] as const;
type VerificationStatus = typeof ALLOWED_VERIFICATION_STATUSES[number];

const ALLOWED_TRANSITIONS: Record<string, VerificationStatus[]> = {
  unverified: ["verified", "disputed"],
  disputed: ["verified", "unverified"],
  verified: ["disputed"],
};

export interface VerificationApprovalInput {
  verificationStatus: string;
  reason: string;
}

export async function approveOutcomeVerification(
  decisionId: string,
  workspaceId: string,
  input: VerificationApprovalInput,
  actorId: string
): Promise<{
  decisionId: string;
  verificationStatus: string;
  verifiedAt: string;
  message: string;
}> {
  // Validate input
  if (!input.reason || input.reason.trim().length < 5) {
    throw new ValidationError("Reason required (minimum 5 characters)");
  }

  if (!ALLOWED_VERIFICATION_STATUSES.includes(input.verificationStatus as VerificationStatus)) {
    throw new ValidationError(
      `Invalid verification status. Allowed: ${ALLOWED_VERIFICATION_STATUSES.join(", ")}`
    );
  }

  // Fetch decision
  const decision = await db.operatorItem.findFirst({
    where: {
      id: decisionId,
      workspaceId,
    },
  });

  if (!decision) {
    throw new NotFoundError("Decision", decisionId);
  }

  // Check that decision has an outcome recorded
  if (!decision.actualOutcome && !decision.actualOutcomeValue) {
    throw new ValidationError(
      "Cannot verify outcome: no outcome recorded for this decision"
    );
  }

  const currentStatus = decision.verificationStatus || "unverified";

  // Validate state transition
  const allowedTransitions = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowedTransitions?.includes(input.verificationStatus as VerificationStatus)) {
    throw new ValidationError(
      `Cannot transition from '${currentStatus}' to '${input.verificationStatus}'. Allowed transitions: ${allowedTransitions?.join(", ") || "none"}`
    );
  }

  // Update database
  const now = new Date();
  const updatedDecision = await db.operatorItem.update({
    where: { id: decisionId },
    data: {
      verificationStatus: input.verificationStatus,
      verifiedAt: now,
      verifiedBy: actorId,
      verificationEvidence: {
        ...(decision.verificationEvidence as Record<string, unknown>),
        adminVerification: {
          approvedBy: actorId,
          approvedAt: now.toISOString(),
          reason: input.reason,
          previousStatus: currentStatus,
        },
      },
      auditTrail: buildAuditTrail(
        (decision.auditTrail as any[]) || [],
        actorId,
        "OUTCOME_VERIFIED",
        undefined,
        undefined,
        `${input.verificationStatus === "verified" ? "Verified" : "Disputed"}: ${input.reason}`
      ),
    },
  });

  // Emit audit event
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OUTCOME_VERIFIED || "outcome.verified",
    actorId,
    entityType: "decision",
    entityId: decisionId,
    workspaceId,
    payload: {
      verificationStatus: input.verificationStatus,
      previousStatus: currentStatus,
      reason: input.reason,
    },
    visibility: "internal",
  }).catch((error) => {
    logger.warn("Failed to emit audit event for outcome verification", {
      decisionId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  logger.info("Outcome verified", {
    decisionId,
    workspaceId,
    actorId,
    verificationStatus: input.verificationStatus,
    previousStatus: currentStatus,
  });

  return {
    decisionId,
    verificationStatus: updatedDecision.verificationStatus || "unverified",
    verifiedAt: now.toISOString(),
    message: `Outcome ${input.verificationStatus === "verified" ? "approved" : "disputed"} successfully`,
  };
}
