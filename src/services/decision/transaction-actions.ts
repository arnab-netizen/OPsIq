import { classifyOperatorError } from "@/lib/operator-error-governance";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/services/audit/audit-log";

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
    throw new Error(
      `Cannot execute ${action} on ${decision.status} decision`
    );
  }

  // Map action to status
  const statusMap = {
    approve: "approved",
    reject: "rejected",
    override: "approved",
  };

  const newStatus = statusMap[action];

  // Update decision
  const updated = await db.operatorItem.update({
    where: { id: decisionId },
    data: {
      status: newStatus,
      ...(action === "override" && {
        override_reason: overrideReason,
        override_approved_at: new Date().toISOString(),
        reviewedBy: userId,
      }),
      updatedAt: new Date(),
    },
  });

  // Log audit event
  await logAuditEvent({
    eventName:
      action === "override"
        ? "DECISION_OVERRIDDEN"
        : action === "approve"
          ? "DECISION_APPROVED"
          : "DECISION_REJECTED",
    entityType: "Decision",
    entityId: decisionId,
    actorId: userId,
    role: null,
    before: {
      status: decision.status,
    },
    after: {
      status: newStatus,
    },
    metadata: {
      action: `${action}_decision`,
      ...(overrideReason && { override_reason: overrideReason }),
      timestamp: new Date().toISOString(),
    },
    workspaceId,
  }).catch((err: unknown) => {
    const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: "load" });
    console.error(
      `Audit logging failed: ${governed.operatorMessage}`
    );
  });

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
    return !!(params.overrideReason && params.overrideReason.trim().length > 0);
  }

  return true;
}
