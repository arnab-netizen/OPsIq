/**
 * R1 — Owner Mode integration contract (pure).
 *
 * Proves remote / multi-location operations CANNOT bypass Owner Mode governance:
 *  - every remote operating recommendation must carry the Owner Mode collective
 *    arbitration packet (from `runCollective`) and that packet must be valid;
 *  - a remote action must not contradict an active Owner Mode veto;
 *  - no terminal (employee/supervisor/manager) may declare a HIGH/CRITICAL task a
 *    "verified success" outside Owner Mode verification.
 *
 * This is the gate the rest of the capability is built behind. If any of these fail,
 * the remote output is rejected (fail-closed) — it never silently proceeds.
 */

import type { CollectiveDecisionPacket } from "@/domain/collective-training/collective-types";
import { validateCollectivePacket } from "@/domain/collective-training/decision-packet";
import { isHighRisk, type RiskLevel, type TerminalType } from "@/domain/remote-operations/remote-types";

export class OwnerModeBypassError extends Error {
  readonly code = "OWNER_MODE_BYPASS";
  readonly reasons: string[];
  constructor(reasons: string[]) {
    super(`Remote operation rejected — would bypass Owner Mode governance: ${reasons.join(", ")}.`);
    this.name = "OwnerModeBypassError";
    this.reasons = reasons;
  }
}

export interface GovernedRemoteDecision {
  /** The Owner Mode collective arbitration result this remote decision was produced by. */
  arbitration: CollectiveDecisionPacket;
  /** The remote action the decision proposes (must not contradict an active veto). */
  proposedAction: string;
  /** Action categories this remote action would perform (matched against active vetoes). */
  performsActions: string[];
}

/** Returns violations; empty = the remote decision is governed by Owner Mode. */
export function checkGovernedByOwnerMode(d: GovernedRemoteDecision): string[] {
  const reasons: string[] = [];
  // 1. The collective arbitration packet must exist and be valid.
  if (!d.arbitration) reasons.push("missing_owner_mode_arbitration");
  else {
    const packetViolations = validateCollectivePacket(d.arbitration);
    if (packetViolations.length > 0) reasons.push(`invalid_arbitration:${packetViolations.join("|")}`);
    // 2. The remote action must not perform an action blocked by an active veto.
    const blocked = new Set(d.arbitration.activeVetoes.flatMap((v) => v.blockedActions));
    for (const a of d.performsActions) {
      if (blocked.has(a as never)) reasons.push(`action_blocked_by_active_veto:${a}`);
    }
    // 3. If the packet emitted any unsafe output, the remote decision cannot proceed.
    if (d.arbitration.unsafeEmitted.length > 0) reasons.push("arbitration_unsafe_emitted");
  }
  return reasons;
}

export function assertGovernedByOwnerMode(d: GovernedRemoteDecision): void {
  const reasons = checkGovernedByOwnerMode(d);
  if (reasons.length > 0) throw new OwnerModeBypassError(reasons);
}

export interface TerminalCompletionClaim {
  terminal: TerminalType;
  riskLevel: RiskLevel;
  /** Did the claim pass the full Owner Mode verification chain (proof + verifier + state machine)? */
  ownerModeVerified: boolean;
  /** Was this the sole AI review (AI alone may not verify high-risk work)? */
  aiOnlyReview?: boolean;
}

/**
 * A terminal may mark work SUBMITTED, but only the Owner Mode verification chain may
 * produce COMPLETED_VERIFIED. A terminal claim of verified success that did not pass
 * Owner Mode verification (or relied on AI alone for high-risk work) is rejected.
 */
export function checkTerminalCannotForgeSuccess(c: TerminalCompletionClaim): string[] {
  const reasons: string[] = [];
  if (!c.ownerModeVerified) reasons.push("terminal_verified_success_outside_owner_mode");
  if (isHighRisk(c.riskLevel) && c.aiOnlyReview === true) reasons.push("ai_only_verification_of_high_risk_task");
  return reasons;
}

export function assertTerminalCannotForgeSuccess(c: TerminalCompletionClaim): void {
  const reasons = checkTerminalCannotForgeSuccess(c);
  if (reasons.length > 0) throw new OwnerModeBypassError(reasons);
}
