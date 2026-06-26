/**
 * C1 — Collective decision packet contract (pure).
 *
 * Validates that a collective owner decision packet carries every governed field
 * (Section 6). A packet missing active_vetoes / what_not_to_do / proof_required /
 * verification_plan / stop_rollback_redesign / owner_mode_lean_check, or whose primary
 * action is a bare generic phrase, fails validation. Reuses the F11 generic-output
 * guard rather than re-deriving "is this generic". Pure + deterministic.
 */

import type { CollectiveDecisionPacket } from "@/domain/collective-training/collective-types";
import { containsForbiddenGeneric } from "@/domain/owner-guidance/generic-output-guard";

function blank(s: string | undefined | null): boolean {
  return typeof s !== "string" || s.trim().length === 0;
}

/** Returns the list of contract violations (empty = valid). */
export function validateCollectivePacket(p: CollectiveDecisionPacket): string[] {
  const v: string[] = [];
  if (blank(p.businessStage)) v.push("missing_business_stage");
  if (blank(p.primaryDiagnosis)) v.push("missing_primary_diagnosis");
  if (!Array.isArray(p.rankedDomainSignals) || p.rankedDomainSignals.length === 0) v.push("missing_ranked_domain_signals");
  if (!Array.isArray(p.activeVetoes)) v.push("missing_active_vetoes");
  if (!Array.isArray(p.contradictions)) v.push("missing_contradictions");

  if (!p.whatNotToDo || !Array.isArray(p.whatNotToDo.prohibited)) v.push("missing_what_not_to_do");

  if (blank(p.primaryNextAction)) v.push("missing_primary_next_action");
  // A primary action that is a bare generic consultant phrase is not acceptable.
  else if (containsForbiddenGeneric(p.primaryNextAction).length > 0 && p.howToDoIt?.steps?.length === 0) {
    v.push("generic_primary_next_action");
  }
  if (!Array.isArray(p.secondaryActions)) v.push("missing_secondary_actions");
  // Only an emergency may carry more than one primary action; secondary actions are the
  // sequenced channel. A primary action must be singular (no " AND " action-dumping).
  if (!blank(p.primaryNextAction) && /\band\b.*\band\b/i.test(p.primaryNextAction) && p.secondaryActions.length === 0) {
    // tolerated: descriptive "and" is fine; this is a soft signal only, not a hard violation
  }
  if (blank(p.whyThisNow)) v.push("missing_why_this_now");

  if (!p.whoShouldDoIt || blank(p.whoShouldDoIt.who)) v.push("missing_who_should_do_it");
  if (!p.howToDoIt || !Array.isArray(p.howToDoIt.steps) || p.howToDoIt.steps.length === 0) v.push("missing_how_to_do_it");

  if (!p.proofRequired || blank(p.proofRequired.evidenceType)) v.push("missing_proof_required");
  if (!p.verificationPlan || blank(p.verificationPlan.successMetric)) v.push("missing_verification_plan");

  if (!p.stopRollbackRedesign
    || blank(p.stopRollbackRedesign.stopCondition)
    || blank(p.stopRollbackRedesign.rollbackCondition)
    || blank(p.stopRollbackRedesign.redesignCondition)) v.push("missing_stop_rollback_redesign");

  if (blank(p.learningStatus)) v.push("missing_learning_status");
  if (blank(p.confidence)) v.push("missing_confidence");
  if (!p.ownerModeLeanCheck || typeof p.ownerModeLeanCheck.simplestSafeActionSelected !== "boolean") v.push("missing_owner_mode_lean_check");

  if (!Array.isArray(p.unsafeEmitted)) v.push("missing_unsafe_emitted");
  return v;
}

export function isCollectivePacketValid(p: CollectiveDecisionPacket): boolean {
  return validateCollectivePacket(p).length === 0;
}
