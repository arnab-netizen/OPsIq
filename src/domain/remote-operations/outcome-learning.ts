/**
 * §3.8 outcome windows + R29 — learning quarantine + remote harm types (§3.16, §28, §96).
 * Pure. Wires the existing F10 learning quarantine and F8 harm ledger — no parallel
 * learning/harm engine.
 *
 * Execution status and business outcome are separate. Learning cannot open before the
 * minimum outcome window closes; staff/supervisors may not shorten it. Remote operational
 * events enter the same quarantine, and any unresolved remote harm blocks learning.
 */

import { canPromote, type LearningCandidate } from "@/domain/domain-training/learning-quarantine";
import type { RemoteTaskType } from "@/domain/remote-operations/remote-types";

/** §3.8 minimum post-completion outcome windows (ms). */
export const OUTCOME_WINDOW_MS: Partial<Record<RemoteTaskType, number>> = {
  RECURRING_SERVICE: 24 * 60 * 60 * 1000,
  ONE_OFF_SERVICE: 24 * 60 * 60 * 1000,
  TURNOVER_SERVICE: 48 * 60 * 60 * 1000,
  INSPECTION: 24 * 60 * 60 * 1000,
  MAINTENANCE: 7 * 24 * 60 * 60 * 1000,
  EMERGENCY: 48 * 60 * 60 * 1000,
  COMPLAINT_RECOVERY: 72 * 60 * 60 * 1000,
  INVENTORY_RESTOCK: 24 * 60 * 60 * 1000,
  VENDOR_VISIT: 7 * 24 * 60 * 60 * 1000,
};

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function outcomeWindowMs(taskType: RemoteTaskType): number {
  return OUTCOME_WINDOW_MS[taskType] ?? DEFAULT_WINDOW_MS;
}

export function outcomeWindowClosed(taskType: RemoteTaskType, completedAtMs: number, nowMs: number): boolean {
  return nowMs - completedAtMs >= outcomeWindowMs(taskType);
}

/** Only the owner may extend a window; staff/supervisor may never shorten it. */
export function canAdjustOutcomeWindow(role: "OWNER" | "STAFF" | "SUPERVISOR" | "MANAGER", direction: "extend" | "shorten"): boolean {
  if (direction === "shorten") return false; // nobody may shorten below the minimum
  return role === "OWNER";
}

/** §3.16 remote/multi-location harm event types. */
export const REMOTE_HARM_TYPES = [
  "FALSE_COMPLETION_DETECTED", "UNSAFE_PROOF_ACCEPTED", "PAIR_RISK_MATERIALIZED", "FALSE_GREEN_LOCATION",
  "EMERGENCY_TASK_UNACKNOWLEDGED", "DISPATCH_BYPASSED_VETO", "OFFLINE_PROOF_TIMESTAMP_CONFLICT",
  "ACCESS_CODE_EXPOSED_WITHOUT_AUDIT", "VENDOR_WORK_CLOSED_WITHOUT_PROOF", "CUSTOMER_DISPUTE_AFTER_VERIFICATION",
  "MANAGER_SUPPRESSED_ESCALATION", "AI_FLAG_OVERRIDDEN_AND_HARM_OCCURRED", "OWNER_OVERRIDE_HARM_OCCURRED",
  "LOCATION_PAUSE_IGNORED", "COMPLIANCE_SAFETY_GATE_BYPASSED",
] as const;
export type RemoteHarmType = typeof REMOTE_HARM_TYPES[number];

export type OperationalEventClass =
  | "RAW_OPERATIONAL_EVENT" | "AI_FLAGGED_EVENT" | "HUMAN_REVIEWED_EVENT" | "OUTCOME_VERIFIED_EVENT"
  | "DISPUTED_EVENT" | "HARM_LEDGER_EVENT" | "LEARNING_ELIGIBLE_EVENT" | "LEARNING_BLOCKED_EVENT";

export interface RemoteLearningInput {
  proofWeak: boolean;
  taskDisputed: boolean;
  ownerOverride: boolean;
  aiFlagUnresolved: boolean;
  customerComplaintPending: boolean;
  outcomeWindowOpen: boolean;
  complianceSafetyUnresolved: boolean;
  unresolvedRemoteHarm: boolean;
  offlineTimestampConflictUnresolved: boolean;
  // F10 candidate fields (the verified path)
  outcomeVerified: boolean;
  harmChecked: boolean;
  harmful: boolean;
  simulationTested: boolean;
}

export interface RemoteLearningDecision {
  eligible: boolean;
  classification: OperationalEventClass;
  blockedReasons: string[];
}

/** Decide remote-operations learning eligibility (§96), wiring F10 canPromote. */
export function classifyRemoteLearning(i: RemoteLearningInput): RemoteLearningDecision {
  const blockedReasons: string[] = [];
  if (i.proofWeak) blockedReasons.push("proof_weak");
  if (i.taskDisputed) blockedReasons.push("task_disputed");
  if (i.ownerOverride) blockedReasons.push("owner_override");
  if (i.aiFlagUnresolved) blockedReasons.push("ai_flag_unresolved");
  if (i.customerComplaintPending) blockedReasons.push("customer_complaint_pending");
  if (i.outcomeWindowOpen) blockedReasons.push("outcome_window_open");
  if (i.complianceSafetyUnresolved) blockedReasons.push("compliance_safety_unresolved");
  if (i.unresolvedRemoteHarm) blockedReasons.push("unresolved_remote_harm");
  if (i.offlineTimestampConflictUnresolved) blockedReasons.push("offline_timestamp_conflict_unresolved");

  const candidate: LearningCandidate = {
    stage: i.simulationTested ? "SIMULATION_TESTED" as never : "CAPTURED" as never,
    outcomeVerified: i.outcomeVerified,
    harmChecked: i.harmChecked,
    harmful: i.harmful || i.unresolvedRemoteHarm,
    disputed: i.taskDisputed,
    inconclusive: false,
    simulationTested: i.simulationTested,
  };
  const f10Ok = canPromote(candidate);
  const eligible = blockedReasons.length === 0 && f10Ok;

  const classification: OperationalEventClass =
    i.unresolvedRemoteHarm || i.harmful ? "HARM_LEDGER_EVENT"
    : i.taskDisputed ? "DISPUTED_EVENT"
    : eligible ? "LEARNING_ELIGIBLE_EVENT"
    : blockedReasons.length > 0 ? "LEARNING_BLOCKED_EVENT"
    : i.outcomeVerified ? "OUTCOME_VERIFIED_EVENT" : "RAW_OPERATIONAL_EVENT";

  return { eligible, classification, blockedReasons };
}
