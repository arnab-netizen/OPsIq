import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { ValidationError, NotFoundError, UnauthorizedError } from "@/infra/errors";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { logger } from "@/infra/logger";
import { buildAuditTrail } from "./verification";

const ALLOWED_VERIFICATION_STATUSES = ["verified", "disputed"] as const;
type VerificationStatus = typeof ALLOWED_VERIFICATION_STATUSES[number];

const ALLOWED_TRANSITIONS: Record<string, VerificationStatus[]> = {
  unverified: ["verified", "disputed"],
  disputed: ["verified"],
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

  // GAP-PROOF-01 — separation of duties: the actor who executed/completed the decision
  // cannot also mark its outcome "verified". Self-verification of a positive outcome by the
  // executor is the segregation-of-duties hole the proof FSM forbids; the outcome-verification
  // path must enforce the same bar. (Disputing one's own outcome is still allowed.)
  if (
    input.verificationStatus === "verified" &&
    decision.completedBy &&
    decision.completedBy === actorId
  ) {
    throw new UnauthorizedError(
      "Separation of duties: the actor who executed this decision cannot verify its own outcome. A different reviewer must verify it."
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

  // AUDIT-01 + concurrency: verify via a status-guarded updateMany (only a row still in
  // `currentStatus` in this workspace transitions) inside one transaction with the audit event.
  // Fail-closed — a failed audit rolls the verification back (was a last-write-wins update +
  // swallowed post-commit audit).
  const now = new Date();
  const updateData: Record<string, any> = {
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
  };

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const res = await tx.operatorItem.updateMany({
      where: { id: decisionId, workspaceId, verificationStatus: decision.verificationStatus },
      data: updateData,
    });
    if (res.count !== 1) {
      throw new ValidationError("Outcome verification state changed concurrently; please retry");
    }

    await emitAuditEvent(
      {
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
      },
      tx
    );
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
    verificationStatus: input.verificationStatus || "unverified",
    verifiedAt: now.toISOString(),
    message: `Outcome ${input.verificationStatus === "verified" ? "approved" : "disputed"} successfully`,
  };
}
