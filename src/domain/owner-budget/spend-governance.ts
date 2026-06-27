/**
 * Spend Governance & Approval Engine (Sections 18, 19, 25). Pure, deterministic.
 *
 * Risk-tiers a spend and flags control violations: self-approval (SOD), split-spend
 * below threshold, new-vendor / vendor-bank-change holds, missing/disputed proof.
 * Uses "requires review" language — never criminal accusations. Friction increases
 * with risk (Section 27). Emergency spend is allowed within limits with post-proof.
 */

import {
  type SpendGovernanceInput,
  type SpendGovernanceResult,
  type SpendDecisionType,
  type SpendRiskLevel,
} from "@/domain/owner-budget/types";

/** Split-spend: multiple recent same-category amounts each just below threshold summing above it. */
function detectSplitSpend(input: SpendGovernanceInput): boolean {
  const recent = input.recentSameCategoryAmounts ?? [];
  if (recent.length < 1) return false;
  const all = [...recent, input.amount];
  const eachBelow = all.every((a) => a < input.ownerApprovalThreshold);
  const sumAbove = all.reduce((s, a) => s + a, 0) >= input.ownerApprovalThreshold;
  const nearThreshold = all.filter((a) => a >= input.ownerApprovalThreshold * 0.7).length >= 2;
  return eachBelow && sumAbove && nearThreshold;
}

const RISK_ORDER: readonly SpendRiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function evaluateSpend(input: SpendGovernanceInput): SpendGovernanceResult {
  const flags: string[] = [];
  const reasons: string[] = [];
  const risks: SpendRiskLevel[] = ["LOW"];
  const escalate = (to: SpendRiskLevel) => risks.push(to);

  const aboveThreshold = input.amount >= input.ownerApprovalThreshold;
  if (aboveThreshold) {
    escalate("HIGH");
    reasons.push("Amount at/above owner approval threshold.");
  } else if (input.amount >= input.ownerApprovalThreshold * 0.5) {
    escalate("MEDIUM");
  }

  // Segregation of duties: same person requested and approved.
  const selfApproved =
    !!input.approvedByUserId && input.approvedByUserId === input.requestedByUserId;
  if (selfApproved) {
    flags.push("SOD_RISK: same person requested and approved — requires owner verification.");
    escalate("CRITICAL");
  }

  if (detectSplitSpend(input)) {
    flags.push("SPLIT_SPEND_SUSPECTED: multiple near-threshold same-category spends — requires review.");
    escalate("CRITICAL");
  }

  if (input.vendorBankChanged) {
    flags.push("VENDOR_BANK_CHANGE: payment hold until bank details independently verified.");
    escalate("CRITICAL");
  }

  if (input.isNewVendor) {
    flags.push("NEW_VENDOR: vendor master/approval and quote check required.");
    escalate("HIGH");
  }

  if (input.proofStatus === "disputed") {
    flags.push("PROOF_DISPUTED: spend cannot be treated as verified.");
    escalate("HIGH");
  } else if (input.proofStatus === "missing" && (aboveThreshold || input.isNewVendor)) {
    flags.push("PROOF_MISSING: proof required before this spend is verified.");
    escalate("HIGH");
  }

  // Decision derives from the worst signal.
  const risk: SpendRiskLevel = RISK_ORDER[Math.max(...risks.map((r) => RISK_ORDER.indexOf(r)))];
  let decision: SpendDecisionType;
  const requiresOwnerApproval = aboveThreshold || selfApproved || risk === "CRITICAL";
  if (input.vendorBankChanged || detectSplitSpend(input)) {
    decision = "HOLD";
  } else if (selfApproved) {
    decision = "REQUIRE_OWNER_APPROVAL";
  } else if (input.proofStatus === "disputed") {
    decision = "INVESTIGATE";
  } else if (requiresOwnerApproval) {
    decision = "REQUIRE_OWNER_APPROVAL";
  } else if (risk === "MEDIUM" || input.isNewVendor) {
    decision = "REQUIRE_PROOF";
  } else {
    decision = "AUTO_LOG";
  }

  // Emergency exception: allow continuity spend but force post-proof + later review.
  if (input.emergency && (decision === "HOLD" || decision === "REQUIRE_OWNER_APPROVAL")) {
    if (!input.vendorBankChanged) {
      decision = "REQUIRE_PROOF";
      reasons.push("Emergency continuity spend permitted with mandatory post-proof and reassessment.");
    } else {
      reasons.push("Emergency cannot bypass vendor bank-change verification.");
    }
  }

  const requiredProof =
    decision === "REQUIRE_PROOF" ||
    decision === "HOLD" ||
    decision === "INVESTIGATE" ||
    input.proofStatus === "missing" ||
    aboveThreshold;

  return {
    riskLevel: risk,
    decision,
    flags,
    requiredProof,
    requiresOwnerApproval,
    reasons,
  };
}
