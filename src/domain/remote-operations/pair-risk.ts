/**
 * R16 — Staff-supervisor pair risk + collusion block (§3.3, §36). Pure.
 *
 * For HIGH/CRITICAL proof-burden tasks, the approving supervisor must not be the direct
 * manager of the submitting staff unless no other verifier is available AND the owner /
 * authorised manager is notified. When the pair-risk score exceeds threshold, all further
 * approvals by that supervisor for that staff member require manager counter-approval.
 */

import { isHighRisk, type RiskLevel } from "@/domain/remote-operations/remote-types";

export interface PairRiskSignals {
  repeatedDisputes: number;
  repeatedRework: number;
  weakProofApprovals: number;
  unusuallyFastApprovals: number;
  complaintsAfterApproval: number;
  sameProofReuse: number;
}

export const DEFAULT_PAIR_RISK_THRESHOLD = 3;

/** Simple additive pair-risk score (sample-gated elsewhere). */
export function pairRiskScore(s: PairRiskSignals): number {
  return s.repeatedDisputes + s.repeatedRework + s.weakProofApprovals + s.unusuallyFastApprovals + s.complaintsAfterApproval + (s.sameProofReuse * 2);
}

export interface PairApprovalInput {
  riskLevel: RiskLevel;
  supervisorIsDirectManagerOfStaff: boolean;
  pairRiskScore: number;
  threshold?: number;
  counterApprovalPresent: boolean;
  otherVerifierAvailable: boolean;
  ownerOrManagerNotified: boolean;
}

export interface PairApprovalDecision {
  allowed: boolean;
  reason?: string;
  blockActive: boolean;
}

/** Decide whether a supervisor may approve this proof for this staff member. */
export function evaluatePairApproval(i: PairApprovalInput): PairApprovalDecision {
  const threshold = i.threshold ?? DEFAULT_PAIR_RISK_THRESHOLD;
  const blockActive = i.pairRiskScore > threshold;
  const high = isHighRisk(i.riskLevel);

  // §3.3 collusion technical block: direct line manager cannot approve HIGH/CRITICAL
  // unless no other verifier exists AND owner/manager notified.
  if (high && i.supervisorIsDirectManagerOfStaff) {
    if (i.otherVerifierAvailable) return { allowed: false, reason: "direct_manager_collusion_block_other_verifier_required", blockActive };
    if (!i.ownerOrManagerNotified) return { allowed: false, reason: "direct_manager_requires_owner_notification", blockActive };
  }

  // Pair-risk block: future approvals require manager counter-approval.
  if (blockActive) {
    if (!i.counterApprovalPresent) return { allowed: false, reason: "pair_risk_block_requires_counter_approval", blockActive };
    if (high && !i.counterApprovalPresent) return { allowed: false, reason: "high_risk_pair_block_requires_counter_approval", blockActive };
  }

  return { allowed: true, blockActive };
}
