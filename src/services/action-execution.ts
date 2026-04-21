import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { ValidationError } from "@/infra/errors";
import type { ActionStatus, ActionRecord } from "@/generated/prisma/client";

export interface UpdateActionInput {
  status?: ActionStatus;
  notes?: string;
  blockReason?: string;
  ownerUserId?: string;
  dueDate?: Date;
}

// State machine transitions
const validTransitions: Record<string, ActionStatus[]> = {
  DRAFT: ["READY"],
  READY: ["IN_PROGRESS", "BLOCKED"],
  IN_PROGRESS: ["COMPLETED", "FAILED", "BLOCKED"],
  BLOCKED: ["READY", "FAILED"],
  COMPLETED: [],
  FAILED: ["DRAFT", "BLOCKED"],
};

async function validateTransition(
  currentStatus: ActionStatus,
  targetStatus: ActionStatus
): Promise<void> {
  const allowedTransitions = validTransitions[currentStatus];
  if (!allowedTransitions || !allowedTransitions.includes(targetStatus)) {
    throw new ValidationError(
      `Invalid transition: ${currentStatus} → ${targetStatus}`
    );
  }
}

async function validateActionCanStart(actionId: string): Promise<void> {
  // Check if all dependencies are completed
  const dependencies = await db.actionDependencyRecord.findMany({
    where: { actionId },
    include: {
      action: {
        select: { status: true },
      },
    },
  });

  for (const dep of dependencies) {
    if (dep.action.status !== "COMPLETED") {
      throw new ValidationError(
        `Cannot start action: dependency still in ${dep.action.status} status`
      );
    }
  }
}

async function validateCompletion(
  actionId: string,
  notes?: string
): Promise<void> {
  if (!notes || notes.trim().length === 0) {
    throw new ValidationError(
      "Cannot complete action without completion notes"
    );
  }
}

async function validateBlockage(
  blockReason?: string
): Promise<void> {
  if (!blockReason || blockReason.trim().length === 0) {
    throw new ValidationError("Cannot block action without reason");
  }
}

export async function updateAction(
  actionId: string,
  input: UpdateActionInput,
  actorId: string
): Promise<ActionRecord> {
  // Load current action
  const action = await db.actionRecord.findUnique({
    where: { id: actionId },
    include: {
      dependencies: {
        include: {
          action: {
            select: { status: true },
          },
        },
      },
    },
  });

  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }

  // Validate transition if status is changing
  if (input.status && input.status !== action.status) {
    await validateTransition(action.status, input.status);

    // Additional validations based on target status
    if (input.status === "IN_PROGRESS") {
      await validateActionCanStart(actionId);
    }

    if (input.status === "COMPLETED") {
      await validateCompletion(actionId, input.notes);
    }

    if (input.status === "BLOCKED") {
      await validateBlockage(input.blockReason);
    }
  }

  // Build update data
  const updateData: Record<string, unknown> = {
    ...input,
  };

  // Set timestamps based on status transitions
  if (input.status === "READY" && action.status === "DRAFT") {
    updateData.assignedAt = new Date();
  }

  if (input.status === "IN_PROGRESS" && action.status !== "IN_PROGRESS") {
    updateData.assignedAt = new Date();
  }

  if (
    input.status === "COMPLETED" &&
    action.status !== "COMPLETED"
  ) {
    updateData.completedAt = new Date();
  }

  // Update the action
  const updatedAction = await db.actionRecord.update({
    where: { id: actionId },
    data: updateData,
  });

  // Emit audit event
  const eventName =
    input.status === "COMPLETED"
      ? "ACTION_COMPLETED"
      : input.status === "IN_PROGRESS"
        ? "ACTION_STARTED"
        : input.status === "FAILED"
          ? "ACTION_FAILED"
          : input.status === "BLOCKED"
            ? "ACTION_BLOCKED"
            : "ACTION_UPDATED";

  await emitAuditEvent({
    eventName,
    actorId,
    entityType: "ActionRecord",
    entityId: actionId,
    payload: {
      previousStatus: action.status,
      newStatus: input.status || action.status,
      notes: input.notes,
      blockReason: input.blockReason,
    },
    visibility: "internal",
  });

  return updatedAction;
}

export async function getActionWithDependencies(actionId: string) {
  return db.actionRecord.findUnique({
    where: { id: actionId },
    include: {
      dependencies: {
        include: {
          action: {
            select: {
              id: true,
              title: true,
              status: true,
              completedAt: true,
            },
          },
        },
      },
    },
  });
}

export async function getActionsByOwner(
  ownerUserId: string,
  status?: ActionStatus
) {
  return db.actionRecord.findMany({
    where: {
      ownerUserId,
      ...(status && { status }),
    },
    orderBy: [
      { dueDate: "asc" },
      { criticalityLevel: "desc" },
    ],
    include: {
      dependencies: {
        include: {
          action: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      },
    },
  });
}

export async function getActionsByEngagement(
  engagementId: string,
  status?: ActionStatus
) {
  return db.actionRecord.findMany({
    where: {
      engagementId,
      ...(status && { status }),
    },
    orderBy: [{ phase: "asc" }, { createdAt: "asc" }],
  });
}

export async function validateActionExecutionState(
  engagementId: string
): Promise<{
  allCompleted: boolean;
  blockedCount: number;
  inProgressCount: number;
  completedCount: number;
  failedCount: number;
}> {
  const actions = await db.actionRecord.findMany({
    where: { engagementId },
  });

  const counts = {
    blockedCount: actions.filter((a) => a.status === "BLOCKED").length,
    inProgressCount: actions.filter((a) => a.status === "IN_PROGRESS").length,
    completedCount: actions.filter((a) => a.status === "COMPLETED").length,
    failedCount: actions.filter((a) => a.status === "FAILED").length,
  };

  return {
    allCompleted:
      counts.blockedCount === 0 &&
      counts.inProgressCount === 0 &&
      counts.failedCount === 0 &&
      counts.completedCount === actions.length,
    ...counts,
  };
}
