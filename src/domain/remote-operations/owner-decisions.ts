/**
 * R9 / R20 — Owner decision timeout + notification acknowledgement + digest
 * (§3.11, §58, §73, §74). Pure.
 *
 * Owner absence must never leave a safety/emergency issue unresolvable: every decision
 * has a severity-based timeout that escalates to a backup contact / safe default /
 * manager re-escalation. The owner mobile digest is capped to decision-grade items.
 */

export type OwnerDecisionSeverity = "EMERGENCY" | "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

interface TimeoutPolicy {
  backupNotifyMs?: number;
  safeDefaultMs?: number;
  managerReescalateMs?: number;
  reminderMs?: number;
}

export const OWNER_TIMEOUT: Record<OwnerDecisionSeverity, TimeoutPolicy> = {
  EMERGENCY: { backupNotifyMs: 15 * 60 * 1000, safeDefaultMs: 30 * 60 * 1000 },
  CRITICAL: { backupNotifyMs: 30 * 60 * 1000, safeDefaultMs: 60 * 60 * 1000 },
  HIGH: { managerReescalateMs: 4 * 60 * 60 * 1000 },
  MEDIUM: { reminderMs: 24 * 60 * 60 * 1000 },
  LOW: { reminderMs: 7 * 24 * 60 * 60 * 1000 },
};

export type OwnerTimeoutAction = "NONE" | "NOTIFY_BACKUP" | "SAFE_DEFAULT" | "MANAGER_REESCALATE" | "REMINDER";

/** Resolve the escalation action for an un-actioned owner decision of the given age. */
export function resolveOwnerTimeout(severity: OwnerDecisionSeverity, ageMs: number, safeDefaultConfigured: boolean): OwnerTimeoutAction {
  const p = OWNER_TIMEOUT[severity];
  if (p.safeDefaultMs !== undefined && safeDefaultConfigured && ageMs >= p.safeDefaultMs) return "SAFE_DEFAULT";
  if (p.backupNotifyMs !== undefined && ageMs >= p.backupNotifyMs) return "NOTIFY_BACKUP";
  if (p.managerReescalateMs !== undefined && ageMs >= p.managerReescalateMs) return "MANAGER_REESCALATE";
  if (p.reminderMs !== undefined && ageMs >= p.reminderMs) return "REMINDER";
  return "NONE";
}

/** §74 owner operating-load target — mobile digest caps decision-grade items. */
export const OWNER_DIGEST_MAX = 5;

export function ownerDigest<T>(decisionGradeItems: readonly T[], max: number = OWNER_DIGEST_MAX): { shown: T[]; overflow: number } {
  return { shown: decisionGradeItems.slice(0, max), overflow: Math.max(0, decisionGradeItems.length - max) };
}

/** §58 notification acknowledgement lifecycle (MVP subset). */
export type AlertState = "ALERT_CREATED" | "ALERT_SENT" | "ACK_REQUIRED" | "ACK_RECEIVED" | "ACK_TIMEOUT" | "ESCALATED_AFTER_NO_ACK";

export function alertNeedsEscalation(state: AlertState, ackRequired: boolean, ackReceived: boolean, ageMs: number, ackWindowMs: number): boolean {
  if (!ackRequired) return false;
  if (ackReceived) return false;
  return ageMs >= ackWindowMs && (state === "ACK_REQUIRED" || state === "ALERT_SENT" || state === "ACK_TIMEOUT");
}
