/**
 * Founder Recovery — action status machine.
 *
 * Explicit, tested transition rules. This deliberately replaces the broken
 * legacy Action enum (where the route enum and the service `ACTION_STATUSES`
 * disagreed). A single source of truth, used by both the service and tests.
 */
export const RECOVERY_ACTION_STATUSES = [
  "proposed",
  "assigned",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
] as const;

export type RecoveryActionStatus = (typeof RECOVERY_ACTION_STATUSES)[number];

const TRANSITIONS: Record<RecoveryActionStatus, readonly RecoveryActionStatus[]> = {
  proposed: ["assigned", "cancelled"],
  assigned: ["in_progress", "blocked", "cancelled"],
  in_progress: ["blocked", "completed", "cancelled"],
  blocked: ["assigned", "in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};

export function isValidRecoveryStatus(value: string): value is RecoveryActionStatus {
  return (RECOVERY_ACTION_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: RecoveryActionStatus, to: RecoveryActionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throws on invalid transition; returns the target status on success. */
export function assertTransition(from: RecoveryActionStatus, to: RecoveryActionStatus): RecoveryActionStatus {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid recovery action transition: ${from} → ${to}. Allowed: ${TRANSITIONS[from]?.join(", ") || "none"}`
    );
  }
  return to;
}

/** Statuses that require a completion note + actual outcome before being set. */
export function requiresCompletionEvidence(to: RecoveryActionStatus): boolean {
  return to === "completed";
}
