/**
 * Collusion / fraud / abuse risk indicators (Section 25). Pure, deterministic.
 *
 * Surfaces suspicious patterns for human review. NEVER makes criminal accusations —
 * uses "requires review" / "possible …" language only. Detection is a risk signal,
 * not a verdict; resolution always routes to an owner/human review.
 */

export interface CollusionInput {
  /** Times the same manager approved spend for the same employee in the window. */
  sameApproverEmployeePairCount?: number;
  /** Repeated manual overrides by the same actor pair. */
  repeatedOverridePairCount?: number;
  refundsClusteredUnderStaff?: boolean;
  discountsClusteredUnderStaff?: boolean;
  /** Number of near-threshold spends forming a split-spend cluster. */
  splitSpendClusterCount?: number;
  selfApprovalCount?: number;
  /** Completed deliveries with no matching payment (possible cash leakage). */
  deliveriesWithoutPayment?: number;
}

export interface CollusionFinding {
  pattern:
    | "approver_employee_concentration"
    | "repeated_override_pair"
    | "refund_clustering"
    | "discount_clustering"
    | "split_spend_cluster"
    | "self_approval_pattern"
    | "delivery_without_payment";
  severity: "LOW" | "MEDIUM" | "HIGH";
  message: string;
}

export interface CollusionResult {
  findings: CollusionFinding[];
  hasRisk: boolean;
  /** True when any finding warrants owner review before further spend. */
  requiresOwnerReview: boolean;
}

const PAIR_CONCENTRATION = 5;
const OVERRIDE_PAIR = 3;
const SPLIT_CLUSTER = 3;
const SELF_APPROVAL = 2;

export function detectCollusionRisk(i: CollusionInput): CollusionResult {
  const findings: CollusionFinding[] = [];

  if ((i.sameApproverEmployeePairCount ?? 0) >= PAIR_CONCENTRATION) {
    findings.push({ pattern: "approver_employee_concentration", severity: "MEDIUM", message: "Same manager repeatedly approves the same employee's spend — possible approval bypass, requires review." });
  }
  if ((i.repeatedOverridePairCount ?? 0) >= OVERRIDE_PAIR) {
    findings.push({ pattern: "repeated_override_pair", severity: "HIGH", message: "Repeated manual overrides by the same actor pair — requires review." });
  }
  if (i.refundsClusteredUnderStaff) {
    findings.push({ pattern: "refund_clustering", severity: "MEDIUM", message: "Refunds cluster under one staff member — possible leakage, requires review." });
  }
  if (i.discountsClusteredUnderStaff) {
    findings.push({ pattern: "discount_clustering", severity: "MEDIUM", message: "Discounts cluster under one staff member — possible margin leakage, requires review." });
  }
  if ((i.splitSpendClusterCount ?? 0) >= SPLIT_CLUSTER) {
    findings.push({ pattern: "split_spend_cluster", severity: "HIGH", message: "Multiple near-threshold spends form a split-spend cluster — possible approval bypass, requires review." });
  }
  if ((i.selfApprovalCount ?? 0) >= SELF_APPROVAL) {
    findings.push({ pattern: "self_approval_pattern", severity: "HIGH", message: "Repeated self-approval — segregation-of-duties breach, requires owner review." });
  }
  if ((i.deliveriesWithoutPayment ?? 0) > 0) {
    findings.push({ pattern: "delivery_without_payment", severity: "MEDIUM", message: "Completed deliveries without a matching payment — possible revenue leakage, requires review." });
  }

  const hasRisk = findings.length > 0;
  const requiresOwnerReview = findings.some((f) => f.severity === "HIGH");
  return { findings, hasRisk, requiresOwnerReview };
}
