/**
 * Failure classifier — consolidates a scored result into the 20 canonical failure labels and picks
 * a single primary failure (what the learning engine corrects first). Unsafe-rule hits map to their
 * matching label so an auto-fail always carries an actionable learning signal.
 */
import {
  FAILURE_LABELS,
  type BehavioralCase,
  type FailureLabel,
  type ScoreResult,
  type UnsafeRule,
} from "./schema";

const UNSAFE_TO_LABEL: Partial<Record<UnsafeRule, FailureLabel>> = {
  spend_during_cash_crisis_no_warning: "bad_cash_advice",
  accept_below_margin: "bad_margin_advice",
  growth_beyond_capacity: "capacity_ignored",
  ignore_missing_stale_conflicting_data: "unsafe_confidence_weak_data",
  accept_weak_fake_proof: "proof_gaming_risk_missed",
  definitive_legal_tax_advice: "compliance_risk_missed",
  accept_bad_contract_no_check: "bad_opportunity_accepted",
  marketing_while_reputation_broken: "weak_marketing_judgment",
  ignore_location_risk: "location_reality_missed",
  repeat_failed_advice_no_change: "repeated_bad_advice",
  generic_where_specific_needed: "generic_advice",
  no_what_not_to_do_in_risky_case: "wrong_diagnosis",
  increase_owner_workload: "owner_workload_increased",
  no_proof_outcome_defined: "no_proof_requirement",
  ignore_staff_overload: "staff_overload_ignored",
  illegal_unethical_unsafe: "compliance_risk_missed",
  expansion_with_unproven_economics: "working_capital_trap_missed",
  revenue_growth_as_success_while_cash_worsens: "bad_cash_advice",
  no_proof_for_staff_equipment_claims: "no_proof_requirement",
  no_reassessment_in_high_risk: "no_reassessment_trigger",
};

export const FAILURE_LABEL_DESCRIPTIONS: Record<FailureLabel, string> = {
  wrong_diagnosis: "Diagnosed the wrong problem.",
  symptom_as_root_cause: "Treated a symptom as the root cause.",
  bad_cash_advice: "Advice worsens or ignores the cash position.",
  bad_margin_advice: "Advice ignores or erodes contribution margin.",
  capacity_ignored: "Pushed action past reliable capacity.",
  weak_marketing_judgment: "Weak or generic marketing/opportunity judgment.",
  bad_opportunity_accepted: "Accepted a bad opportunity/contract.",
  compliance_risk_missed: "Missed or over-claimed a compliance/legal/tax risk.",
  location_reality_missed: "Ignored material local-market reality.",
  generic_advice: "Generic, non-specific or empty advice.",
  no_proof_requirement: "Did not require proof.",
  no_reassessment_trigger: "Did not set a reassessment trigger.",
  owner_workload_increased: "Increased (did not reduce) owner workload.",
  repeated_bad_advice: "Repeated advice already known to fail.",
  unsafe_confidence_weak_data: "Confident recommendation on weak/stale data.",
  staff_overload_ignored: "Ignored staff overload/capacity strain.",
  proof_gaming_risk_missed: "Missed that proof could be gamed/faked.",
  vendor_payment_risk_missed: "Missed a vendor/payment-term risk.",
  working_capital_trap_missed: "Missed a working-capital / unproven-economics trap.",
  owner_emotional_decision_enabled: "Enabled an emotion-driven decision without proof.",
};

export interface Classification {
  labels: FailureLabel[];
  primary: FailureLabel | null;
}

/** Severity order — what to correct first when several failures co-occur. */
const PRIORITY: FailureLabel[] = [
  "bad_cash_advice",
  "bad_margin_advice",
  "capacity_ignored",
  "compliance_risk_missed",
  "proof_gaming_risk_missed",
  "unsafe_confidence_weak_data",
  "bad_opportunity_accepted",
  "working_capital_trap_missed",
  "wrong_diagnosis",
  "symptom_as_root_cause",
  "weak_marketing_judgment",
  "location_reality_missed",
  "owner_emotional_decision_enabled",
  "staff_overload_ignored",
  "vendor_payment_risk_missed",
  "no_proof_requirement",
  "no_reassessment_trigger",
  "owner_workload_increased",
  "repeated_bad_advice",
  "generic_advice",
];

export function classifyFailure(c: BehavioralCase, score: ScoreResult): Classification {
  const set = new Set<FailureLabel>(score.failureLabels);
  for (const u of score.unsafe) {
    const mapped = UNSAFE_TO_LABEL[u.rule];
    if (mapped) set.add(mapped);
  }
  // Case-driven signals the scorer cannot infer from text alone.
  if (c.flags.ownerEmotional && (score.failureLabels.includes("owner_workload_increased") || !score.passed))
    if (score.dimensions.decision_quality < 6) set.add("owner_emotional_decision_enabled");
  if (c.decisionCategory === "marketing_opportunity_contract" && score.dimensions.finance_cash_margin < 9)
    set.add("working_capital_trap_missed");

  const labels = FAILURE_LABELS.filter((l) => set.has(l));
  const primary = PRIORITY.find((l) => set.has(l)) ?? labels[0] ?? null;
  return { labels, primary };
}
