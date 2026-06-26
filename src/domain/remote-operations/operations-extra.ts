/**
 * R25 / R28 — Structured handover, dispute, random audit sampling, readiness + pilot
 * (§83, §84, §85, §86, §90, §91). Pure.
 */

/** §83/§84 structured handover mandatory fields. */
export const HANDOVER_FIELDS = [
  "openTasks", "pendingProofs", "accessKeyStatus", "knownIssues", "consumablesStatus",
  "customerAlerts", "maintenanceVendorStatus", "blockedItems", "nextScheduledEvent", "incomingResponsiblePerson",
] as const;
export type HandoverField = typeof HANDOVER_FIELDS[number];

export interface Handover {
  fields: Partial<Record<HandoverField, string>>;
  acknowledgedByIncoming: boolean;
  shiftStarted: boolean;
}

export interface HandoverAssessment {
  missingFields: HandoverField[];
  complete: boolean;
  escalateToManager: boolean;
}

/** A handover is not complete until all fields are present AND the incoming person acknowledges. */
export function assessHandover(h: Handover): HandoverAssessment {
  const missingFields = HANDOVER_FIELDS.filter((f) => typeof h.fields[f] !== "string" || h.fields[f]!.trim().length === 0);
  const complete = missingFields.length === 0 && h.acknowledgedByIncoming;
  const escalateToManager = h.shiftStarted && !h.acknowledgedByIncoming;
  return { missingFields, complete, escalateToManager };
}

/** §85 a disputed task/location must never show GREEN_VERIFIED / READY_VERIFIED. */
export function disputeBlocksGreen(disputeOpen: boolean): boolean {
  return disputeOpen;
}

/**
 * §86 random audit sampling: deterministic pseudo-random selection from completed task ids,
 * with NO supervisor input into which tasks are picked. Minimum 1 per active location/week,
 * default 10% coverage.
 */
export function selectRandomAudit(completedTaskIds: readonly string[], seed: number, ratePct = 10): string[] {
  if (completedTaskIds.length === 0) return [];
  const target = Math.max(1, Math.ceil((completedTaskIds.length * ratePct) / 100));
  // Deterministic hash-rank (seed-mixed) — supervisor cannot influence the order.
  const ranked = [...completedTaskIds]
    .map((id, i) => ({ id, key: ((hash(id) ^ (seed * 2654435761)) >>> 0) + i * 0 }))
    .sort((a, b) => a.key - b.key)
    .slice(0, target)
    .map((x) => x.id);
  return ranked;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function auditCoverageRate(audited: number, completed: number): number {
  return completed === 0 ? 0 : (audited / completed) * 100;
}

/** §90 remote operations readiness assessment. */
export interface ReadinessChecklist {
  locationHierarchyDefined: boolean;
  rolesAssigned: boolean;
  supervisorExists: boolean;
  checklistExists: boolean;
  proofRulesExist: boolean;
  complaintChannelExists: boolean;
  approvalThresholdsExist: boolean;
  ownerDecisionQueueConfigured: boolean;
  escalationRulesConfigured: boolean;
  ownerModeIntegrationsPresent: boolean;
  staleDataWindowsConfigured: boolean;
}

export function assessRemoteReadiness(c: ReadinessChecklist): { ready: boolean; missing: string[] } {
  const missing = Object.entries(c).filter(([, v]) => v !== true).map(([k]) => k);
  return { ready: missing.length === 0, missing };
}

/** §91 pilot-first rollout: multi-location expansion is blocked until the pilot passes. */
export interface PilotResult {
  proofSubmissionAcceptable: boolean;
  falseCompletionControlled: boolean;
  supervisorVerificationReliable: boolean;
  ownerBriefingUseful: boolean;
  noFalseGreen: boolean;
  arbitrationNoBlockingConflicts: boolean;
}

export function canExpandBeyondPilot(p: PilotResult): boolean {
  return Object.values(p).every((v) => v === true);
}
