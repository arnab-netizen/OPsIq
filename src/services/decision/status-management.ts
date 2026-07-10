import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import type { AuditEventName } from "@/domain/constants/audit-events";
import { InvalidStateTransitionError } from "@/infra/errors";

/**
 * Decision status enum
 */
export enum DecisionStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  BLOCKED = "blocked",
  OVERRIDDEN = "overridden",
  EXECUTED = "executed",
}

/**
 * Valid status transitions
 * Maps from current status to allowed next statuses
 */
const VALID_TRANSITIONS: Record<DecisionStatus, DecisionStatus[]> = {
  [DecisionStatus.PENDING]: [
    DecisionStatus.APPROVED,
    DecisionStatus.REJECTED,
    DecisionStatus.BLOCKED,
  ],
  [DecisionStatus.APPROVED]: [DecisionStatus.EXECUTED],
  [DecisionStatus.REJECTED]: [],
  [DecisionStatus.BLOCKED]: [
    DecisionStatus.APPROVED,
    DecisionStatus.REJECTED,
    DecisionStatus.OVERRIDDEN,
  ],
  [DecisionStatus.OVERRIDDEN]: [DecisionStatus.EXECUTED],
  [DecisionStatus.EXECUTED]: [],
};

/**
 * Status metadata and descriptions
 */
interface StatusMetadata {
  label: string;
  color: string;
  icon: string;
  isTerminal: boolean;
  description: string;
}

const STATUS_METADATA: Record<DecisionStatus, StatusMetadata> = {
  [DecisionStatus.PENDING]: {
    label: "Pending",
    color: "yellow",
    icon: "⏳",
    isTerminal: false,
    description: "Awaiting approval or rejection",
  },
  [DecisionStatus.APPROVED]: {
    label: "Approved",
    color: "green",
    icon: "✓",
    isTerminal: false,
    description: "Approved and ready for execution",
  },
  [DecisionStatus.REJECTED]: {
    label: "Rejected",
    color: "gray",
    icon: "✗",
    isTerminal: true,
    description: "Decision rejected",
  },
  [DecisionStatus.BLOCKED]: {
    label: "Blocked",
    color: "red",
    icon: "⚠️",
    isTerminal: false,
    description: "Blocked by governance rules",
  },
  [DecisionStatus.OVERRIDDEN]: {
    label: "Overridden",
    color: "blue",
    icon: "→",
    isTerminal: false,
    description: "Block overridden by admin",
  },
  [DecisionStatus.EXECUTED]: {
    label: "Executed",
    color: "purple",
    icon: "✓✓",
    isTerminal: true,
    description: "Decision executed",
  },
};

/**
 * Validate if transition is allowed
 */
export function isValidTransition(
  fromStatus: string,
  toStatus: string
): boolean {
  const from = fromStatus as DecisionStatus;
  const to = toStatus as DecisionStatus;

  if (!VALID_TRANSITIONS[from]) {
    return false;
  }

  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Get valid next statuses for current status
 */
export function getValidNextStatuses(currentStatus: string): DecisionStatus[] {
  return VALID_TRANSITIONS[currentStatus as DecisionStatus] || [];
}

/**
 * Change decision status with validation and audit
 */
export async function changeDecisionStatus(
  decisionId: string,
  workspaceId: string,
  userId: string,
  newStatus: string,
  metadata?: Record<string, any>
): Promise<{
  success: boolean;
  message: string;
  timestamp: Date;
}> {
  // Fetch current decision (outside transaction for pre-validation)
  const decision = await db.operatorItem.findFirst({
    where: { id: decisionId, workspaceId },
  });

  if (!decision) {
    throw new Error("Decision not found");
  }

  const currentStatus = decision.status;

  // Validate transition before entering transaction
  if (!isValidTransition(currentStatus, newStatus)) {
    throw new InvalidStateTransitionError("Decision", currentStatus, newStatus);
  }

  // Determine audit event name
  let eventName: AuditEventName = AUDIT_EVENTS.DECISION_STATUS_CHANGED;
  if (newStatus === DecisionStatus.APPROVED) {
    eventName = AUDIT_EVENTS.DECISION_APPROVED;
  } else if (newStatus === DecisionStatus.REJECTED) {
    eventName = AUDIT_EVENTS.DECISION_REJECTED;
  } else if (newStatus === DecisionStatus.BLOCKED) {
    eventName = AUDIT_EVENTS.DECISION_BLOCKED;
  } else if (newStatus === DecisionStatus.OVERRIDDEN) {
    eventName = AUDIT_EVENTS.DECISION_OVERRIDDEN;
  } else if (newStatus === DecisionStatus.EXECUTED) {
    eventName = AUDIT_EVENTS.DECISION_EXECUTED;
  }

  const timestamp = new Date();

  // CAS + audit in transaction (fail-closed): only update if status is still currentStatus
  // and workspaceId matches, preventing TOCTOU race and ensuring audit is atomic with state change.
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const res = await tx.operatorItem.updateMany({
      where: { id: decisionId, workspaceId, status: currentStatus },
      data: { status: newStatus, updatedAt: timestamp },
    });

    if (res.count !== 1) {
      throw new InvalidStateTransitionError("Decision", currentStatus, newStatus);
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
          from: currentStatus,
          to: newStatus,
          action: "change_status",
          timestamp: timestamp.toISOString(),
          ...(metadata ?? {}),
        },
        visibility: "internal",
      },
      tx
    );
  });

  return {
    success: true,
    message: `Decision status changed from ${currentStatus} to ${newStatus}`,
    timestamp,
  };
}

/**
 * Get status metadata for UI rendering
 */
export function getStatusMetadata(
  status: string
): StatusMetadata & { isValid: boolean } {
  const metadata = STATUS_METADATA[status as DecisionStatus];

  return {
    isValid: !!metadata,
    label: metadata?.label || status,
    color: metadata?.color || "gray",
    icon: metadata?.icon || "•",
    isTerminal: metadata?.isTerminal || false,
    description: metadata?.description || "Unknown status",
  };
}

/**
 * Check if status is terminal (no further transitions)
 */
export function isTerminalStatus(status: string): boolean {
  const metadata = STATUS_METADATA[status as DecisionStatus];
  return metadata?.isTerminal || false;
}

/**
 * Get decision timeline - all status changes with timestamps
 */
export async function getDecisionTimeline(
  decisionId: string,
  workspaceId: string
) {
  const decision = await db.operatorItem.findFirst({
    where: { id: decisionId, workspaceId },
  });

  if (!decision) {
    throw new Error("Decision not found");
  }

  // Fetch all status-related audit events
  const statusEvents = await db.auditEvent.findMany({
    where: {
      workspaceId,
      entityId: decisionId,
      eventName: {
        in: [
          "DECISION_APPROVED",
          "DECISION_REJECTED",
          "DECISION_BLOCKED",
          "DECISION_OVERRIDDEN",
          "DECISION_EXECUTED",
          "DECISION_STATUS_CHANGED",
        ],
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  // Build timeline
  const timeline = statusEvents.map((event: typeof statusEvents[number]) => ({
    status: event.metadata?.to || event.metadata?.status,
    previousStatus: event.metadata?.from,
    timestamp: event.createdAt,
    eventName: event.eventName,
    actor: event.metadata?.actor,
    reason: event.metadata?.reason,
    override: event.metadata?.override_reason,
  }));

  return {
    currentStatus: decision.status,
    createdAt: decision.createdAt,
    updatedAt: decision.updatedAt,
    timeline,
  };
}

/**
 * Get status change summary
 */
export function getStatusSummary(status: string): {
  current: string;
  label: string;
  icon: string;
  isTerminal: boolean;
  canTransitionTo: DecisionStatus[];
} {
  const metadata = getStatusMetadata(status);
  const nextStatuses = getValidNextStatuses(status);

  return {
    current: status,
    label: metadata.label,
    icon: metadata.icon,
    isTerminal: metadata.isTerminal,
    canTransitionTo: nextStatuses,
  };
}
