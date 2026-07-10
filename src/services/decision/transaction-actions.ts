import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { InvalidStateTransitionError } from "@/infra/errors";

/**
 * Execute decision action (approve, reject, override)
 * Orchestrates state transition and audit logging
 */
export async function executeDecisionAction(
  decisionId: string,
  workspaceId: string,
  userId: string,
  action: "approve" | "reject" | "override",
  overrideReason?: string
) {
  // Fetch current decision state
  const decision = await db.operatorItem.findFirst({
    where: { id: decisionId, workspaceId },
  });

  if (!decision) {
    throw new Error("Decision not found");
  }

  // Validate action is allowed on current state
  const allowedStates = ["pending", "blocked"];
  if (!allowedStates.includes(decision.status)) {
    throw new InvalidStateTransitionError("Decision", decision.status, action);
  }

  const statusMap = {
    approve: "approved",
    reject: "rejected",
    override: "approved",
  };

  const eventMap = {
    approve: AUDIT_EVENTS.DECISION_APPROVED,
    reject: AUDIT_EVENTS.DECISION_REJECTED,
    override: AUDIT_EVENTS.DECISION_OVERRIDDEN,
  };

  const newStatus = statusMap[action];
  const eventName = eventMap[action];
  const timestamp = new Date();

  // CAS + audit in transaction (fail-closed):
  // updateMany enforces workspaceId isolation and status guard atomically with the write,
  // preventing TOCTOU race. Audit rolls back with the state change on failure.
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const res = await tx.operatorItem.updateMany({
      where: { id: decisionId, workspaceId, status: { in: allowedStates } },
      data: { status: newStatus, updatedAt: timestamp },
    });

    if (res.count !== 1) {
      throw new InvalidStateTransitionError("Decision", decision.status, newStatus);
    }

    await emitAuditEvent(
      {
        eventName,
        workspaceId,
        actorId: userId,
        actorType: "user",
        entityType: "Decision",
        entityId: decisionId,
        payload: {
          from: decision.status,
          to: newStatus,
          action,
          timestamp: timestamp.toISOString(),
          ...(overrideReason && { override_reason: overrideReason }),
        },
        visibility: "internal",
      },
      tx
    );
  });

  const updated = await db.operatorItem.findUnique({ where: { id: decisionId } });
  if (!updated) throw new Error("Decision not found after update");
  return updated;
}

/**
 * Get available actions for a decision based on current state
 */
export function getAvailableActions(
  status: string,
  userRole?: string
): string[] {
  const actions: string[] = [];

  if (status === "pending" || status === "blocked") {
    actions.push("approve", "reject");
  }

  if (status === "blocked" && userRole === "admin") {
    actions.push("override");
  }

  return actions;
}

/**
 * Validate action parameters before execution
 */
export function validateActionParams(
  action: string,
  params: Record<string, unknown>
): boolean {
  if (action === "override") {
    return !!(
      typeof params.overrideReason === "string" &&
      params.overrideReason.trim().length > 0
    );
  }

  return true;
}
