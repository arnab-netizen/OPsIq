/**
 * F12 — Feasibility checker (pure).
 *
 * Before an action is emitted it must be feasible: affordable, staffable, assigned to
 * someone with authority, legal/compliant or escalated, with collectable proof and a
 * measurable outcome, reversibility scored, acceptable owner/staff load, no conflict
 * with current priorities, and a lower-risk alternative considered. Extends the
 * boundary checks. Pure + deterministic.
 */

export interface FeasibilityInput {
  affordable: boolean;
  staffAvailable: boolean;
  assigneeHasAuthority: boolean;
  legalOrEscalated: boolean;
  proofCollectable: boolean;
  outcomeMeasurable: boolean;
  reversibilityScored: boolean;
  reversible: boolean;
  ownerWorkloadAcceptable: boolean;
  staffWorkloadAcceptable: boolean;
  noConflictWithPriorities: boolean;
  lowerRiskAlternativeConsidered: boolean;
  confidenceLow: boolean;
}

export type FeasibilityVerdict = "FEASIBLE" | "BLOCKED" | "DOWNGRADE";

export interface FeasibilityResult {
  verdict: FeasibilityVerdict;
  blockers: string[];
  downgrades: string[];
}

export function checkFeasibility(i: FeasibilityInput): FeasibilityResult {
  const blockers: string[] = [];
  const downgrades: string[] = [];

  if (!i.affordable) blockers.push("unaffordable");
  if (!i.assigneeHasAuthority) blockers.push("assignee_no_authority");
  if (!i.legalOrEscalated) blockers.push("legal_uncertain_not_escalated");
  if (!i.staffAvailable) blockers.push("no_staff_available");
  // Irreversible + high-risk under low confidence is blocked.
  if (!i.reversible && i.confidenceLow) blockers.push("irreversible_high_risk_low_confidence");

  if (!i.outcomeMeasurable) downgrades.push("outcome_not_measurable");
  if (!i.proofCollectable) downgrades.push("proof_not_collectable");
  if (!i.reversibilityScored) downgrades.push("reversibility_not_scored");
  if (!i.ownerWorkloadAcceptable) downgrades.push("owner_workload_high");
  if (!i.staffWorkloadAcceptable) downgrades.push("staff_workload_high");
  if (!i.noConflictWithPriorities) downgrades.push("conflicts_with_priorities");
  if (!i.lowerRiskAlternativeConsidered) downgrades.push("no_lower_risk_alternative_considered");

  const verdict: FeasibilityVerdict = blockers.length > 0 ? "BLOCKED" : downgrades.length > 0 ? "DOWNGRADE" : "FEASIBLE";
  return { verdict, blockers, downgrades };
}
