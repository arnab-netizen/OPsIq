/**
 * Employee/Manager Budget Authority lifecycle + lawful-action guardrails
 * (Section 23). Pure, deterministic.
 *
 * Budget authority can be tightened on control signals (weak proof compliance,
 * approval violations, self-approval, split-spend) and later restored. Only lawful,
 * business-operational actions are ever recommended — wage deduction, unpaid
 * overtime, termination, discrimination, covert surveillance, etc. are forbidden.
 */

export type BudgetAuthorityStatus =
  | "NORMAL" | "WATCH" | "RESTRICTED" | "OWNER_APPROVAL_REQUIRED"
  | "SUSPENDED_FOR_CATEGORY" | "RESTORED";

/** Allowed authority transitions (governed lifecycle). */
const ALLOWED_TRANSITIONS: Record<BudgetAuthorityStatus, BudgetAuthorityStatus[]> = {
  NORMAL: ["WATCH", "RESTRICTED", "OWNER_APPROVAL_REQUIRED", "SUSPENDED_FOR_CATEGORY"],
  WATCH: ["NORMAL", "RESTRICTED", "OWNER_APPROVAL_REQUIRED", "SUSPENDED_FOR_CATEGORY", "RESTORED"],
  RESTRICTED: ["WATCH", "OWNER_APPROVAL_REQUIRED", "SUSPENDED_FOR_CATEGORY", "RESTORED"],
  OWNER_APPROVAL_REQUIRED: ["RESTRICTED", "WATCH", "SUSPENDED_FOR_CATEGORY", "RESTORED"],
  SUSPENDED_FOR_CATEGORY: ["OWNER_APPROVAL_REQUIRED", "RESTRICTED", "RESTORED"],
  RESTORED: ["NORMAL", "WATCH", "RESTRICTED", "OWNER_APPROVAL_REQUIRED", "SUSPENDED_FOR_CATEGORY"],
};

export interface AuthorityTransitionCheck {
  ok: boolean;
  reason: string;
}

export function checkAuthorityTransition(
  from: BudgetAuthorityStatus,
  to: BudgetAuthorityStatus
): AuthorityTransitionCheck {
  if (from === to) return { ok: true, reason: "No change." };
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  return allowed.includes(to)
    ? { ok: true, reason: `Authority ${from} → ${to}.` }
    : { ok: false, reason: `Illegal authority transition ${from} → ${to}.` };
}

/** Forbidden (unlawful/unfair) governance actions — never recommended (Section 23). */
export const FORBIDDEN_GOVERNANCE_ACTIONS = [
  "wage deduction", "unpaid overtime", "arbitrary penalty", "termination",
  "discriminat", "covert surveillance", "illegal monitoring", "withholding pay",
  "public shaming", "punitive",
];

export function isLawfulAuthorityAction(action: string): boolean {
  const a = action.toLowerCase();
  return !FORBIDDEN_GOVERNANCE_ACTIONS.some((f) => a.includes(f));
}

/** The only lawful, business-operational governance actions the engine may emit. */
export const LAWFUL_AUTHORITY_ACTIONS = [
  "require proof for spend",
  "reduce approval authority",
  "require owner review",
  "assign process audit",
  "assign training",
  "review workload",
  "investigate variance",
  "document performance issue for human review",
] as const;

export interface AuthorityRecommendationInput {
  proofComplianceWeak?: boolean;
  approvalViolations?: number;
  selfApprovalDetected?: boolean;
  splitSpendDetected?: boolean;
  repeatedUnverifiedSpend?: boolean;
}

export interface AuthorityRecommendation {
  recommendedStatus: BudgetAuthorityStatus;
  lawfulActions: string[];
  reason: string;
  reviewInDays: number;
  restorationCriteria: string;
}

/** Recommend a lawful authority change from control signals. Deterministic. */
export function recommendAuthorityChange(
  current: BudgetAuthorityStatus,
  input: AuthorityRecommendationInput
): AuthorityRecommendation {
  const violations = input.approvalViolations ?? 0;
  const critical = input.selfApprovalDetected === true || input.splitSpendDetected === true;
  const serious = violations >= 2 || input.repeatedUnverifiedSpend === true;
  const minor = input.proofComplianceWeak === true || violations === 1;

  let recommendedStatus: BudgetAuthorityStatus;
  const lawfulActions: string[] = [];
  let reason: string;
  let reviewInDays: number;
  let restorationCriteria: string;

  if (critical) {
    recommendedStatus = "SUSPENDED_FOR_CATEGORY";
    lawfulActions.push("require owner review", "reduce approval authority", "investigate variance", "assign process audit");
    reason = "Critical control signal (self-approval or split-spend) — suspend category authority pending owner review.";
    reviewInDays = 7;
    restorationCriteria = "Owner review complete + 30 days of compliant, proof-backed spend.";
  } else if (serious) {
    recommendedStatus = "OWNER_APPROVAL_REQUIRED";
    lawfulActions.push("require owner review", "require proof for spend", "investigate variance");
    reason = "Repeated approval violations / unverified spend — owner approval required for new spend.";
    reviewInDays = 14;
    restorationCriteria = "Two consecutive clean review cycles with full proof.";
  } else if (minor) {
    recommendedStatus = "WATCH";
    lawfulActions.push("require proof for spend", "assign training", "review workload");
    reason = "Weak proof compliance — monitor with proof requirement and support.";
    reviewInDays = 14;
    restorationCriteria = "Proof compliance restored over one review cycle.";
  } else {
    recommendedStatus = current === "NORMAL" ? "NORMAL" : "RESTORED";
    lawfulActions.push("require proof for spend");
    reason = "No adverse control signal — authority normal.";
    reviewInDays = 30;
    restorationCriteria = "n/a";
  }

  // Defensive: never emit a forbidden action.
  const safeActions = lawfulActions.filter(isLawfulAuthorityAction);
  return { recommendedStatus, lawfulActions: safeActions, reason, reviewInDays, restorationCriteria };
}
