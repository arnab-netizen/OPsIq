/**
 * F11 — Recommendation quality validator (pure).
 *
 * Composes the existing generic-output-guard (no generic advice) + guidance-object
 * governance into the 16-point quality bar every recommendation must pass: specific,
 * sequenced, assigned, time/review-bound, evidence-bound, verifiable, reversible or
 * risk-controlled, matched to cash/capacity/staff/owner load, what-not-to-do, proof,
 * stop/rollback/redesign, confidence, severity. Pure + deterministic.
 */

import { containsForbiddenGeneric } from "@/domain/owner-guidance/generic-output-guard";

export interface RecommendationQualityInput {
  text: string;
  actions: string[];           // discrete actions (≤ a small number, prioritized)
  assignedRole: string;
  deadlineOrReviewWindow: string;
  evidenceRefs: string[];
  verificationMethod: string;
  reversibleOrRiskControlled: boolean;
  matchedToCash: boolean;
  matchedToCapacity: boolean;
  matchedToStaffWorkload: boolean;
  matchedToOwnerWorkload: boolean;
  whatNotToDo: string[];
  proofRequirement: string;
  stopRollbackRedesign: string;
  confidence: string;
  severity: string;
}

const MAX_UNPRIORITIZED_ACTIONS = 5;

function blank(s: string | undefined | null): boolean {
  return typeof s !== "string" || s.trim().length === 0;
}

/** Returns the list of failed quality checks (empty = passes). */
export function validateRecommendationQuality(r: RecommendationQualityInput): string[] {
  const f: string[] = [];
  // 1 specific — not a bare generic phrase
  if (blank(r.text) || containsForbiddenGeneric(r.text).length > 0 && r.actions.length === 0) f.push("not_specific");
  // 2 sequenced / not an unprioritized dump
  if (!r.actions || r.actions.length === 0) f.push("no_actions");
  else if (r.actions.length > MAX_UNPRIORITIZED_ACTIONS) f.push("too_many_unprioritized_actions");
  // 3 assigned
  if (blank(r.assignedRole)) f.push("no_owner");
  // 4 time/review bound
  if (blank(r.deadlineOrReviewWindow)) f.push("not_time_bound");
  // 5 evidence-bound
  if (!r.evidenceRefs || r.evidenceRefs.length === 0) f.push("not_evidence_bound");
  // 6 verifiable
  if (blank(r.verificationMethod)) f.push("not_verifiable");
  // 7 reversible / risk-controlled
  if (!r.reversibleOrRiskControlled) f.push("not_reversible_or_risk_controlled");
  // 8-11 matched to constraints
  if (!r.matchedToCash) f.push("not_matched_to_cash");
  if (!r.matchedToCapacity) f.push("not_matched_to_capacity");
  if (!r.matchedToStaffWorkload) f.push("not_matched_to_staff_workload");
  if (!r.matchedToOwnerWorkload) f.push("not_matched_to_owner_workload");
  // 12 what not to do
  if (!r.whatNotToDo || r.whatNotToDo.length === 0) f.push("no_what_not_to_do");
  // 13 proof
  if (blank(r.proofRequirement)) f.push("no_proof_requirement");
  // 14 stop/rollback/redesign
  if (blank(r.stopRollbackRedesign)) f.push("no_stop_rollback_redesign");
  // 15 confidence
  if (blank(r.confidence)) f.push("no_confidence");
  // 16 severity
  if (blank(r.severity)) f.push("no_severity");
  return f;
}

export function isRecommendationQualityOk(r: RecommendationQualityInput): boolean {
  return validateRecommendationQuality(r).length === 0;
}
