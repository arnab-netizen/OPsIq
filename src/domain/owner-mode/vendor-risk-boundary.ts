/**
 * Vendor / Procurement Risk Boundary — pure domain engine.
 *
 * Classifies vendor risk from signals. No DB, no side effects, deterministic.
 * Worst-case signal wins. Four levels:
 *   informational          — no significant risk flags
 *   review_advised         — approaching renewal, overdue payment, or performance issues
 *   high_concentration_risk — sole-source or ≥50% spend share
 *   blocked_pending_review  — expired contract or unverified bank details
 *
 * Governance: owner must be notified of any vendor classified above informational.
 * No procurement decisions may be taken for blocked vendors without owner sign-off.
 */

export type VendorRiskClassification =
  | "informational"
  | "review_advised"
  | "high_concentration_risk"
  | "blocked_pending_review";

export interface VendorRiskInput {
  vendorName: string;
  spendSharePct?: number;
  soleSupplier?: boolean;
  contractExpired?: boolean;
  contractExpiringSoon?: boolean;
  bankUnverified?: boolean;
  paymentOverdue?: boolean;
  performanceFailures?: boolean;
}

export interface VendorRiskResult {
  classification: VendorRiskClassification;
  ownerNotificationRequired: boolean;
  blockedFromNewOrders: boolean;
  reasons: string[];
  recommendedActions: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "This is an automated risk signal summary only. It is not a professional procurement, " +
  "legal, or financial recommendation. Consult a qualified professional before making " +
  "supply-chain or vendor decisions that could materially affect your business.";

export function assessVendorRisk(input: VendorRiskInput): VendorRiskResult {
  const reasons: string[] = [];
  const actions: string[] = [];

  // Level weights (higher = worse)
  const WEIGHTS = {
    blocked_pending_review: 3,
    high_concentration_risk: 2,
    review_advised: 1,
    informational: 0,
  } satisfies Record<VendorRiskClassification, number>;

  let worstWeight = 0;
  const updateWorst = (level: VendorRiskClassification) => {
    if (WEIGHTS[level] > worstWeight) worstWeight = WEIGHTS[level];
  };

  // ── Blocked signals ────────────────────────────────────────────────────────
  if (input.contractExpired) {
    updateWorst("blocked_pending_review");
    reasons.push(`${input.vendorName}'s contract has expired — renewals or new orders require owner sign-off.`);
    actions.push("Review and renew or terminate the vendor contract before placing new orders.");
  }
  if (input.bankUnverified) {
    updateWorst("blocked_pending_review");
    reasons.push(`${input.vendorName}'s bank details are unverified — payments are blocked until verified.`);
    actions.push("Complete vendor bank verification before releasing any further payments.");
  }

  // ── High concentration signals ─────────────────────────────────────────────
  if (input.soleSupplier) {
    updateWorst("high_concentration_risk");
    reasons.push(`${input.vendorName} is the sole supplier for a critical input — single-source dependency.`);
    actions.push("Identify and qualify at least one alternative supplier to reduce concentration risk.");
  }
  if (input.spendSharePct !== undefined && input.spendSharePct >= 50) {
    updateWorst("high_concentration_risk");
    reasons.push(
      `${input.vendorName} represents ${input.spendSharePct.toFixed(1)}% of total external spend — ` +
      `exceeds the 50% concentration threshold.`
    );
    actions.push("Review procurement strategy to diversify spend across multiple suppliers.");
  }

  // ── Review-advised signals ─────────────────────────────────────────────────
  if (input.contractExpiringSoon) {
    updateWorst("review_advised");
    reasons.push(`${input.vendorName}'s contract is expiring soon — renewal decision required.`);
    actions.push("Initiate contract renewal or competitive tender before the expiry date.");
  }
  if (input.paymentOverdue) {
    updateWorst("review_advised");
    reasons.push(`${input.vendorName} has an overdue payment — credit or delivery risk elevated.`);
    actions.push("Resolve overdue payment and assess impact on supply continuity.");
  }
  if (input.performanceFailures) {
    updateWorst("review_advised");
    reasons.push(`${input.vendorName} has recent quality or delivery failures on record.`);
    actions.push("Conduct a formal performance review with the vendor and set measurable improvement targets.");
  }

  // ── Informational baseline ─────────────────────────────────────────────────
  if (reasons.length === 0) {
    reasons.push(`No significant risk signals detected for ${input.vendorName}.`);
    actions.push("Continue standard vendor monitoring and contract renewal schedule.");
  }

  // Decode worst weight back to level
  const classification = (
    Object.entries(WEIGHTS) as [VendorRiskClassification, number][]
  ).find(([, w]) => w === worstWeight)?.[0] ?? "informational";

  return {
    classification,
    ownerNotificationRequired: worstWeight >= WEIGHTS.review_advised,
    blockedFromNewOrders: worstWeight >= WEIGHTS.blocked_pending_review,
    reasons,
    recommendedActions: actions,
    disclaimer: DISCLAIMER,
  };
}
