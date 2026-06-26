/**
 * Module 35 — Action WIP (Work-In-Progress) Limit (pure domain core).
 *
 * Prevents owner overload by limiting how many active actions/interventions an
 * owner (or the business) runs concurrently. Too many in-flight actions means
 * none get finished — a follow-through-risk / owner-bottlenecking failure mode.
 * Pure + deterministic (no Date.now / Math.random).
 */

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(Math.max(v, lo), hi);
}

function nonNeg(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

export interface WipPolicy {
  maxConcurrentActions: number;
  maxPerOwner: number;
  maxCritical: number;
}

export interface WipState {
  activeTotal: number;
  activeByOwner: Record<string, number>;
  activeCritical: number;
}

export interface WipCandidate {
  ownerId: string;
  critical: boolean;
}

export interface WipAdmissionResult {
  admit: boolean;
  blockedReasons: string[];
}

export type WipPressureBand = "HEALTHY" | "TIGHT" | "OVERLOADED";

/**
 * Derive sensible WIP limits scaling with team size. Deterministic.
 *
 * - maxConcurrentActions scales with team (~2 per head) clamped to a sane band.
 * - maxPerOwner stays small (one person can only finish so many things at once).
 * - maxCritical stays very small (critical work needs focus).
 */
export function defaultWipPolicy(teamSize: number): WipPolicy {
  const size = nonNeg(teamSize);
  return {
    maxConcurrentActions: clamp(size * 2, 3, 40),
    maxPerOwner: 3,
    maxCritical: 2,
  };
}

/**
 * Evaluate whether admitting a candidate action would keep WIP within policy.
 * blockedReasons are returned when admitting the candidate would exceed a limit.
 */
export function evaluateWipAdmission(
  state: WipState,
  policy: WipPolicy,
  candidate: WipCandidate
): WipAdmissionResult {
  const blockedReasons: string[] = [];

  const total = nonNeg(state.activeTotal);
  if (total + 1 > policy.maxConcurrentActions) blockedReasons.push("total_wip_exceeded");

  const ownerActive = nonNeg(state.activeByOwner?.[candidate.ownerId]);
  if (ownerActive + 1 > policy.maxPerOwner) blockedReasons.push("owner_wip_exceeded");

  if (candidate.critical) {
    const critical = nonNeg(state.activeCritical);
    if (critical + 1 > policy.maxCritical) blockedReasons.push("critical_wip_exceeded");
  }

  return { admit: blockedReasons.length === 0, blockedReasons };
}

/** Total WIP utilization 0..1 (activeTotal / maxConcurrentActions, guarded). */
export function wipUtilization(state: WipState, policy: WipPolicy): number {
  const max = policy.maxConcurrentActions;
  if (!Number.isFinite(max) || max <= 0) return 0;
  return clamp(nonNeg(state.activeTotal) / max, 0, 1);
}

/** Pressure band from total utilization. */
export function wipPressureBand(state: WipState, policy: WipPolicy): WipPressureBand {
  const u = wipUtilization(state, policy);
  if (u >= 1) return "OVERLOADED";
  if (u >= 0.8) return "TIGHT";
  return "HEALTHY";
}

/** Thrown when an action is admitted while it would breach the WIP limit. */
export class WipLimitExceededError extends Error {
  readonly code = "WIP_LIMIT_EXCEEDED";
  readonly blockedReasons: string[];
  constructor(ref: string, blockedReasons: string[]) {
    super(`Action ${ref} blocked: WIP limit exceeded (${blockedReasons.join(", ")}).`);
    this.name = "WipLimitExceededError";
    this.blockedReasons = blockedReasons;
  }
}

/** Guard: throws WipLimitExceededError unless the candidate is admissible. */
export function assertWipAdmissible(
  state: WipState,
  policy: WipPolicy,
  candidate: WipCandidate,
  ref: string
): void {
  const r = evaluateWipAdmission(state, policy, candidate);
  if (!r.admit) throw new WipLimitExceededError(ref, r.blockedReasons);
}
