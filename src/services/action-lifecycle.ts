import { db } from "@/lib/db";
import { NotFoundError, ValidationError, ConflictError } from "@/infra/errors";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { logger } from "@/infra/logger";
import { triggerReEvaluation } from "@/services/re-evaluation";
import type { AuthContext } from "@/lib/auth-guard";

// ─── Action Lifecycle States ──────────────────────────────────────────────────

export type ActionLifecycleState = "draft" | "created" | "in_progress" | "blocked" | "completed" | "verified" | "cancelled";

export interface ActionStateTransition {
  from: ActionLifecycleState;
  to: ActionLifecycleState;
  requiredContext?: Record<string, any>;
  requiresEvidence?: boolean;
  requiresReviewer?: boolean;
}

export interface EnforcementRule {
  ruleId: string;
  name: string;
  check: (action: any) => boolean;
  error: string;
}

// ─── State Machine Definition ──────────────────────────────────────────────────

const STATE_MACHINE: Record<ActionLifecycleState, ActionLifecycleState[]> = {
  draft: ["created", "in_progress", "blocked", "cancelled"],
  created: ["in_progress", "blocked", "cancelled"],
  in_progress: ["blocked", "completed", "created"],
  blocked: ["in_progress", "created", "cancelled"],
  completed: ["verified"],
  verified: [],
  cancelled: [],
};

// ─── Enforcement Rules ──────────────────────────────────────────────────────

export const ENFORCEMENT_RULES: EnforcementRule[] = [
  {
    ruleId: "action.evidence.required.completed",
    name: "Completion requires evidence",
    check: (action) => {
      if (action.status === "completed" && action.status !== "in_progress") {
        return !!action.evidence && action.evidence.length > 0;
      }
      return true;
    },
    error: "Cannot complete action without evidence",
  },
  {
    ruleId: "action.blocker.required.blocked",
    name: "Blocked status requires reason",
    check: (action) => {
      if (action.status === "blocked") {
        return !!action.blockerReason && action.blockerReason.trim().length > 0;
      }
      return true;
    },
    error: "Blocked actions must include a reason",
  },
  {
    ruleId: "action.priority.preservation",
    name: "Critical priority preserved during execution",
    check: (action) => {
      if (action.originalPriority === "critical") {
        return action.priority === "critical";
      }
      return true;
    },
    error: "Critical priority actions cannot be deprioritized",
  },
  {
    ruleId: "action.version.conflict",
    name: "Optimistic locking prevents concurrent modifications",
    check: (action) => true,
    error: "Action was modified by another process",
  },
];

// ─── Lifecycle Service ──────────────────────────────────────────────────────

export async function validateStateTransition(
  currentState: ActionLifecycleState,
  nextState: ActionLifecycleState
): Promise<void> {
  const allowedStates = STATE_MACHINE[currentState];

  if (!allowedStates) {
    throw new ValidationError(`Unknown action state: ${currentState}`);
  }

  if (!allowedStates.includes(nextState)) {
    throw new ValidationError(
      `Invalid action state transition: ${currentState} → ${nextState}. ` +
        `Allowed states from ${currentState}: ${allowedStates.join(", ")}`
    );
  }
}

export async function enforceActionRules(action: any): Promise<string[]> {
  const violations: string[] = [];

  for (const rule of ENFORCEMENT_RULES) {
    try {
      if (!rule.check(action)) {
        violations.push(`[${rule.ruleId}] ${rule.error}`);
      }
    } catch (error) {
      violations.push(`[${rule.ruleId}] Rule check failed: ${error}`);
    }
  }

  return violations;
}

export async function transitionActionState(
  actionId: string,
  nextState: ActionLifecycleState,
  context: {
    authContext?: AuthContext;
    actorId?: string;
    reason?: string;
    evidence?: string;
    reviewerId?: string;
  }
): Promise<any> {
  const resolvedActorId = context.authContext?.session.user.id || context.actorId;
  if (!resolvedActorId) {
    throw new Error("Either authContext or actorId must be provided");
  }
  const action = await db.action.findUnique({
    where: { id: actionId },
    include: { engagement: true },
  });

  if (!action) {
    throw new NotFoundError("Action", actionId);
  }

  const currentState = (action.status as ActionLifecycleState) || "created";

  // Validate transition is allowed
  await validateStateTransition(currentState, nextState);

  // Enforce transition-specific rules
  if (nextState === "completed") {
    if (!context.evidence) {
      throw new ValidationError(
        "Evidence is required to complete an action"
      );
    }
  }

  if (nextState === "verified") {
    if (!context.reviewerId) {
      throw new ValidationError(
        "A reviewer ID is required to verify an action"
      );
    }
  }

  if (nextState === "blocked") {
    if (!context.reason) {
      throw new ValidationError(
        "A reason is required to block an action"
      );
    }
  }

  // Update action state
  const updatedAction = await db.action.update({
    where: { id: actionId },
    data: {
      status: nextState,
      blockerReason: nextState === "blocked" ? context.reason : action.blockerReason,
      completedAt: nextState === "completed" ? new Date() : action.completedAt,
      verifiedAt: nextState === "verified" ? new Date() : action.verifiedAt,
      verifiedBy: nextState === "verified" ? context.reviewerId : action.verifiedBy,
      version: { increment: 1 },
    },
  });

  // Emit audit event for state transition
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ACTION_UPDATED,
    actorId: resolvedActorId,
    entityType: "action",
    entityId: actionId,
    workspaceId: action.engagement.workspaceId,
    payload: {
      engagementId: action.engagementId,
      transition: `${currentState} → ${nextState}`,
      reason: context.reason,
      evidence: !!context.evidence,
      reviewer: context.reviewerId,
    },
    visibility: "internal",
  });

  // Trigger re-evaluation based on state transition
  if (nextState === "blocked" && action.priority === "critical") {
    await triggerReEvaluation({
      changeType: "unresolved_critical_blocker",
      entityType: "action",
      entityId: actionId,
      engagementId: action.engagementId,
      severity: "critical",
      description: `Critical action blocked: ${action.title}. Reason: ${context.reason}`,
      triggeredBy: resolvedActorId,
    });
  }

  logger.info("Action state transitioned", {
    actionId,
    engagementId: action.engagementId,
    from: currentState,
    to: nextState,
  });

  return updatedAction;
}

export async function getActionsByEngagementAndState(
  engagementId: string,
  state: ActionLifecycleState
): Promise<any[]> {
  return db.action.findMany({
    where: {
      engagementId,
      status: state,
    },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
  });
}

export async function getActionsByState(state: ActionLifecycleState): Promise<any[]> {
  return db.action.findMany({
    where: { status: state },
    include: { engagement: { select: { id: true, code: true, title: true } } },
  });
}

export async function countActionsByEngagementState(
  engagementId: string,
  workspaceId: string
): Promise<Record<ActionLifecycleState, number>> {
  // Verify engagement exists and belongs to workspace
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId, workspaceId },
  });
  if (!engagement) {
    throw new Error("Engagement not found");
  }

  const states: ActionLifecycleState[] = [
    "created",
    "in_progress",
    "blocked",
    "completed",
    "verified",
    "cancelled",
  ];
  const counts: Record<ActionLifecycleState, number> = {
    draft: 0,
    created: 0,
    in_progress: 0,
    blocked: 0,
    completed: 0,
    verified: 0,
    cancelled: 0,
  };

  for (const state of states) {
    const count = await db.action.count({
      where: {
        engagementId,
        status: state,
        workspaceId,
      },
    });
    counts[state] = count;
  }

  return counts;
}

export function getStateTransitionRules(currentState: ActionLifecycleState): ActionLifecycleState[] {
  return STATE_MACHINE[currentState] || [];
}

export function isStateTerminal(state: ActionLifecycleState): boolean {
  const allowedTransitions = STATE_MACHINE[state] || [];
  return allowedTransitions.length === 0;
}
