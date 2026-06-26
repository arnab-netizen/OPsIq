/**
 * C8 — Primary next-action selector (pure).
 *
 * Selects exactly ONE primary next action, driven by the binding constraint (the
 * highest-priority red domain) and the governed precedence: compliance escalation →
 * survival/containment → constraint relief → proof collection → optimization. Parallel
 * actions are allowed ONLY for emergency containment. The chosen action is screened
 * through the existing F12 feasibility checker and F13 lean filter (wired, not
 * re-derived); it must not violate an active veto.
 */

import type { BusinessStage, DomainKey } from "@/domain/collective-training/collective-types";
import { checkFeasibility, type FeasibilityInput, type FeasibilityResult } from "@/domain/domain-training/feasibility-checker";
import { checkLean, type LeanInput, type LeanResult } from "@/domain/domain-training/lean-filter";

const CONSTRAINT_ACTION: Partial<Record<DomainKey, string>> = {
  "cash-survival": "Stabilize cash first: collect overdue invoices and stop discretionary spend before anything else.",
  "risk-compliance": "Escalate to a verified expert for sign-off before acting on the compliance-sensitive decision.",
  quality: "Fix the quality root cause before any marketing or scaling; recheck the defect and complaint rate.",
  capacity: "Relieve the capacity bottleneck before generating more demand; recheck capacity headroom.",
  "supplier-inventory": "Secure supply and right-size stock before promising more volume; recheck stock cover.",
  "staff-workload": "Rebalance staff workload and remove waste before adding any demand.",
  "owner-workload": "Offload the owner-bottleneck work to a capable owner before taking anything else on.",
  "sop-process": "Make the SOP repeatable and proven before scaling; verify adherence on the next jobs.",
  "customer-complaints": "Fix the complaint root cause and collect recovery proof before any marketing.",
  "profit-improvement": "Repair margin (pricing, discounts, low-margin customers) before chasing growth.",
  "pricing-decisions": "Run the contribution-margin check before changing price.",
  retention: "Close the retention leak before any acquisition spend; recheck churn and repeat rate.",
  marketing: "Instrument marketing so spend traces to sales before increasing budget.",
  "growth-readiness": "Hold growth until every growth-readiness gate passes; collect the missing proof.",
  "scale-readiness": "Hold scaling until every scale-readiness gate passes (repeatable, owner-independent).",
};

export interface NextActionInput {
  bindingConstraint: DomainKey | null;
  stage: BusinessStage;
  complianceUncertain: boolean;
  missingCriticalProof: boolean;
  lowDataConfidence: boolean;
  blockClosure: boolean;
  hasContradiction: boolean;
  emergencyContainment?: boolean;
  feasibility?: Partial<FeasibilityInput>;
  lean?: Partial<LeanInput>;
}

export interface NextActionResult {
  primaryAction: string;
  secondaryActions: string[];
  rationale: string;
  feasibility: FeasibilityResult;
  lean: LeanResult;
}

const FEASIBLE_DEFAULT: FeasibilityInput = {
  affordable: true, staffAvailable: true, assigneeHasAuthority: true, legalOrEscalated: true,
  proofCollectable: true, outcomeMeasurable: true, reversibilityScored: true, reversible: true,
  ownerWorkloadAcceptable: true, staffWorkloadAcceptable: true, noConflictWithPriorities: true,
  lowerRiskAlternativeConsidered: true, confidenceLow: false,
};
const LEAN_DEFAULT: LeanInput = {
  reducesWasteOrProtectsValue: true, addsUnnecessaryAdmin: false, overloadsStaff: false, overloadsOwner: false,
  protectsProfit: true, protectsServiceQuality: true, supportsSustainableGrowth: true,
  simplerSafeOptionExists: false, complexityJustified: true,
  survivalCritical: false, emergencyTemporary: false, profitDamageJustified: false,
};

export function selectPrimaryAction(i: NextActionInput): NextActionResult {
  let primaryAction: string;
  let rationale: string;

  if (i.complianceUncertain) {
    primaryAction = CONSTRAINT_ACTION["risk-compliance"]!;
    rationale = "Compliance/safety uncertainty fails closed — escalate before any action.";
  } else if (i.blockClosure) {
    primaryAction = "Reconcile the unproven completion: collect the missing proof before closing or learning.";
    rationale = "A completion was claimed without proof — closure is blocked until evidence-backed.";
  } else if (i.bindingConstraint && CONSTRAINT_ACTION[i.bindingConstraint]) {
    primaryAction = CONSTRAINT_ACTION[i.bindingConstraint]!;
    rationale = `The binding constraint is ${i.bindingConstraint}; it must clear before lower-priority work.`;
  } else if (i.missingCriticalProof || i.lowDataConfidence) {
    primaryAction = "Collect the missing critical evidence and establish a baseline before committing to an action.";
    rationale = "Data is insufficient for a confident action — collect proof first.";
  } else if (i.hasContradiction) {
    primaryAction = "Reconcile the contradictory evidence before acting; do not classify any outcome as success yet.";
    rationale = "Evidence is contradictory — reconcile before acting.";
  } else {
    primaryAction = "Proceed with the planned optimization in controlled steps and monitor the side-effect metrics.";
    rationale = "No binding constraint or blocker — optimize within the guardrails.";
  }

  const feasibility = checkFeasibility({ ...FEASIBLE_DEFAULT, confidenceLow: i.lowDataConfidence, ...i.feasibility });
  const lean = checkLean({ ...LEAN_DEFAULT, survivalCritical: i.bindingConstraint === "cash-survival", ...i.lean });

  // Single primary action by default; emergency containment may add one parallel action.
  const secondaryActions: string[] = i.emergencyContainment
    ? ["In parallel (emergency only): contain the immediate damage while the primary action proceeds."]
    : [];

  return { primaryAction, secondaryActions, rationale, feasibility, lean };
}
