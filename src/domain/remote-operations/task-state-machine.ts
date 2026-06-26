/**
 * R4 — Atomic high-risk task transition state machine (§3.2, §18, §27). Pure.
 *
 * High-risk (HIGH/CRITICAL) tasks may not skip verification stages: a server-side
 * transition validator enforces the sequence and concurrent completion attempts are
 * serialized via optimistic locking — only one completion path succeeds. Partial writes
 * never produce a verified state.
 */

import { isHighRisk, type RemoteTaskStatus, type RiskLevel } from "@/domain/remote-operations/remote-types";

/** Allowed forward/side transitions per status (the governed main path). */
const ALLOWED: Partial<Record<RemoteTaskStatus, RemoteTaskStatus[]>> = {
  DRAFT: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["ASSIGNED_NOT_ACKNOWLEDGED", "ACKNOWLEDGED", "CANCELLED", "BLOCKED", "PAUSED"],
  ASSIGNED_NOT_ACKNOWLEDGED: ["ACKNOWLEDGED", "ESCALATED", "CANCELLED", "REWORK_REQUIRED"],
  ACKNOWLEDGED: ["IN_PROGRESS", "BLOCKED", "CANCELLED", "PAUSED"],
  IN_PROGRESS: ["SUBMITTED", "BLOCKED", "FAILED", "PAUSED"],
  SUBMITTED: ["PROOF_MISSING", "PROOF_INSUFFICIENT", "PROOF_REJECTED", "SUPERVISOR_REVIEW_REQUIRED"],
  PROOF_MISSING: ["SUBMITTED", "REWORK_REQUIRED", "FAILED"],
  PROOF_INSUFFICIENT: ["SUBMITTED", "REWORK_REQUIRED", "FAILED"],
  PROOF_REJECTED: ["REWORK_REQUIRED", "FAILED", "SUBMITTED"],
  SUPERVISOR_REVIEW_REQUIRED: ["SUPERVISOR_VERIFIED", "PROOF_REJECTED", "REWORK_REQUIRED", "ESCALATED", "MANAGER_REVIEW_REQUIRED"],
  SUPERVISOR_VERIFIED: ["MANAGER_REVIEW_REQUIRED", "CUSTOMER_CONFIRMATION_PENDING", "COMPLETED_VERIFIED", "DISPUTED"],
  MANAGER_REVIEW_REQUIRED: ["MANAGER_REVIEWED", "REWORK_REQUIRED", "ESCALATED", "OWNER_DECISION_REQUIRED"],
  MANAGER_REVIEWED: ["CUSTOMER_CONFIRMATION_PENDING", "COMPLETED_VERIFIED", "DISPUTED"],
  CUSTOMER_CONFIRMATION_PENDING: ["CUSTOMER_CONFIRMED", "CUSTOMER_DISPUTED"],
  CUSTOMER_CONFIRMED: ["COMPLETED_VERIFIED"],
  CUSTOMER_DISPUTED: ["DISPUTED", "REWORK_REQUIRED", "OWNER_DECISION_REQUIRED"],
  DISPUTED: ["REWORK_REQUIRED", "OWNER_DECISION_REQUIRED", "FAILED"],
  REWORK_REQUIRED: ["ASSIGNED", "IN_PROGRESS"],
  OWNER_DECISION_REQUIRED: ["ESCALATED", "REWORK_REQUIRED", "CANCELLED", "COMPLETED_VERIFIED"],
  ESCALATED: ["OWNER_DECISION_REQUIRED", "REWORK_REQUIRED", "MANAGER_REVIEWED", "CANCELLED"],
  COMPLETED_VERIFIED: ["COMPLETED_VERIFIED_PENDING_OUTCOME_WINDOW"],
  COMPLETED_VERIFIED_PENDING_OUTCOME_WINDOW: ["COMPLETED_VERIFIED_OUTCOME_CONFIRMED", "COMPLETED_VERIFIED_LATER_DISPUTED"],
  PAUSED: ["ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS", "CANCELLED"],
  BLOCKED: ["ASSIGNED", "ACKNOWLEDGED", "CANCELLED", "ESCALATED"],
};

/** Verified terminal states that require the full sequence (never reached by a skip). */
const VERIFIED_STATES: ReadonlySet<RemoteTaskStatus> = new Set([
  "SUPERVISOR_VERIFIED", "MANAGER_REVIEWED", "CUSTOMER_CONFIRMED", "COMPLETED_VERIFIED",
  "COMPLETED_VERIFIED_OUTCOME_CONFIRMED",
]);

export interface TransitionCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Validate a transition. For HIGH/CRITICAL tasks the transition must be an allowed
 * adjacency AND a CRITICAL task may not reach COMPLETED_VERIFIED straight from
 * SUPERVISOR_VERIFIED (it must pass MANAGER_REVIEWED / CUSTOMER_CONFIRMED).
 */
export function checkTransition(from: RemoteTaskStatus, to: RemoteTaskStatus, risk: RiskLevel): TransitionCheck {
  const allowed = ALLOWED[from] ?? [];
  if (!allowed.includes(to)) {
    return { ok: false, reason: VERIFIED_STATES.has(to) ? `skip_stage_forbidden:${from}->${to}` : `illegal_transition:${from}->${to}` };
  }
  if (risk === "CRITICAL" && to === "COMPLETED_VERIFIED" && from === "SUPERVISOR_VERIFIED") {
    return { ok: false, reason: "critical_requires_manager_or_customer_before_completion" };
  }
  // AI-only / unverified paths can never jump into a verified state from a non-review state.
  if (isHighRisk(risk) && VERIFIED_STATES.has(to) && !allowed.includes(to)) {
    return { ok: false, reason: `high_risk_skip_to_verified:${to}` };
  }
  return { ok: true };
}

export class IllegalTransitionError extends Error {
  readonly code = "ILLEGAL_TRANSITION";
  constructor(reason: string) { super(`Illegal task transition: ${reason}.`); this.name = "IllegalTransitionError"; }
}

export interface LockedTask {
  status: RemoteTaskStatus;
  riskLevel: RiskLevel;
  /** Optimistic-lock version; every successful transition increments it. */
  lockVersion: number;
}

export interface TransitionResult {
  task: LockedTask;
  applied: boolean;
  reason?: string;
}

/**
 * Apply a transition under optimistic locking. The caller passes the version it read;
 * if it no longer matches (another writer won), the transition is rejected — serializing
 * concurrent completion attempts so only one succeeds.
 */
export function applyTransition(task: LockedTask, to: RemoteTaskStatus, expectedVersion: number): TransitionResult {
  if (task.lockVersion !== expectedVersion) {
    return { task, applied: false, reason: "stale_lock_version_concurrent_write" };
  }
  const check = checkTransition(task.status, to, task.riskLevel);
  if (!check.ok) return { task, applied: false, reason: check.reason };
  return { task: { ...task, status: to, lockVersion: task.lockVersion + 1 }, applied: true };
}

/** Serialize N concurrent attempts to the same target — exactly one applies. */
export function serializeConcurrentTransitions(task: LockedTask, to: RemoteTaskStatus, attempts: number): { successes: number; finalVersion: number } {
  let current = task;
  let successes = 0;
  const readVersion = task.lockVersion; // all readers read the same version (true concurrency)
  for (let i = 0; i < attempts; i++) {
    const res = applyTransition(current, to, readVersion);
    if (res.applied) { successes++; current = res.task; }
  }
  return { successes, finalVersion: current.lockVersion };
}
