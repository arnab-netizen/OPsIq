type OperatorStatus = "pending" | "in_progress" | "done" | "failed";
type ExecutionStatus = "not_started" | "started" | "completed";

// Valid status transitions
const VALID_TRANSITIONS: Record<OperatorStatus, OperatorStatus[]> = {
  pending: ["in_progress", "failed"],
  in_progress: ["done", "failed"],
  done: [],
  failed: [],
};

export function validateStatusTransition(
  currentStatus: OperatorStatus,
  newStatus: OperatorStatus
): boolean {
  const validNextStates = VALID_TRANSITIONS[currentStatus];
  return validNextStates.includes(newStatus);
}

export function validateExecutionStatusTransition(
  currentStatus: ExecutionStatus,
  newStatus: ExecutionStatus
): boolean {
  // Execution status follows a linear progression
  const progression: ExecutionStatus[] = ["not_started", "started", "completed"];
  const currentIndex = progression.indexOf(currentStatus);
  const newIndex = progression.indexOf(newStatus);

  // Can only move forward or stay the same
  return newIndex >= currentIndex;
}

export function getStatusTransitionError(
  currentStatus: OperatorStatus,
  newStatus: OperatorStatus
): string | null {
  if (!validateStatusTransition(currentStatus, newStatus)) {
    return `Cannot transition from "${currentStatus}" to "${newStatus}"`;
  }
  return null;
}

export function getExecutionStatusTransitionError(
  currentStatus: ExecutionStatus,
  newStatus: ExecutionStatus
): string | null {
  if (!validateExecutionStatusTransition(currentStatus, newStatus)) {
    return `Cannot transition execution status from "${currentStatus}" to "${newStatus}"`;
  }
  return null;
}
