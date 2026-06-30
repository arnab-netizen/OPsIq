/**
 * OpsIQ ACTION-STATUS POLICY — the canonical, explicit definition of the safe action-status spectrum.
 *
 * A pure decision function over typed safety/evidence/materiality signals. It encodes the policy:
 *   blocked → need_more_data → (safe-action downgrade) → owner_decision_required → cautious_proceed/proceed.
 *
 * Hard guarantees (tested):
 *   - blocked and need_more_data are evaluated FIRST and can never be overridden by a safe-action signal,
 *     so OpsIQ never proceeds/cautious-proceeds while critical evidence is missing or an action is unsafe;
 *   - proceed is restricted to low-risk, routine, reversible, SOP-approved actions with proof/reassessment
 *     and no material risk and no owner approval required;
 *   - cautious_proceed is restricted to reversible low/medium-risk actions with proof/reassessment AND a
 *     stop-loss threshold, within an approved SOP, with owner approval not required or already granted;
 *   - owner_decision_required holds for financially/structurally material actions and standing-instruction
 *     or high-risk-financial cases unless a fully-safe action downgrades them.
 *
 * No autonomy, no model, no DB, no Date.now.
 */
import type { OwnerActionStatus } from "./supervisor-summary";

/** Signals describing the RECOMMENDED action — present only when the runtime has classified it as safe. */
export interface SafeActionSignals {
  riskLevel: "low" | "medium" | "high";
  routine: boolean;
  reversible: boolean;
  withinApprovedSOP: boolean;
  /** Owner approval is not required for this action, OR has already been granted (e.g. standing instruction). */
  ownerApprovalNotRequiredOrGranted: boolean;
  evidenceSufficient: boolean;
  cashImpactSafe: boolean;
  staffCapacityOk: boolean;
  customerQualityControlled: boolean;
  hasStopLoss: boolean;
  hasProofReassessment: boolean;
  noMaterialComplianceRisk: boolean;
}

export interface PolicySignals {
  // ── hard safety (→ blocked) ──
  unsafe: boolean;
  complianceOrProofBoundaryWithoutReview: boolean;
  disputedOrFakeProof: boolean;
  badContractHighRisk: boolean;
  cashHardBlock: boolean;
  staffOrCustomerSafetyRisk: boolean;
  highRiskActionWithMissingData: boolean;
  likelyBadOutcomeIfFollowed: boolean;
  // ── evidence (→ need_more_data) ──
  criticalDataMissing: boolean;
  confidenceNone: boolean;
  materialAssumptions: boolean;
  weakOrOneSidedSource: boolean;
  confidenceBelowThreshold: boolean;
  highImpactInsufficientEvidence: boolean;
  // ── materiality (→ owner_decision_required) ──
  financiallyMaterial: boolean;
  changesStaffingPayroll: boolean;
  changesPricingMaterially: boolean;
  b2bContractTerms: boolean;
  brandComplianceLegalBoundary: boolean;
  reversibleButMaterial: boolean;
  ownerApprovalRequiredByStandingInstruction: boolean;
  highRiskFinancialConstraint: boolean;
  // ── safe-action enabler (optional) ──
  safeAction?: SafeActionSignals;
  // ── fallback confidence (preserves the legacy supervisor path when safeAction is absent) ──
  confidence: "none" | "low" | "medium" | "high";
}

export interface PolicyDecision {
  status: OwnerActionStatus;
  reasons: string[];
}

function isBlocked(s: PolicySignals): string | null {
  if (s.unsafe) return "unsafe action";
  if (s.complianceOrProofBoundaryWithoutReview) return "compliance/professional-review boundary without review";
  if (s.disputedOrFakeProof) return "fake or disputed proof";
  if (s.badContractHighRisk) return "bad contract/payment terms with high risk";
  if (s.cashHardBlock) return "cash/runway hard block";
  if (s.staffOrCustomerSafetyRisk) return "staff/customer safety risk";
  if (s.highRiskActionWithMissingData) return "high-risk action with missing critical data";
  if (s.likelyBadOutcomeIfFollowed) return "likely bad outcome if followed";
  return null;
}

function needsMoreData(s: PolicySignals): string | null {
  if (s.criticalDataMissing) return "required data is missing";
  if (s.confidenceNone) return "confidence cannot reach threshold";
  if (s.materialAssumptions) return "assumptions are material";
  if (s.weakOrOneSidedSource) return "source is weak/one-sided";
  if (s.confidenceBelowThreshold) return "confidence below threshold";
  if (s.highImpactInsufficientEvidence) return "high decision impact with insufficient evidence";
  return null;
}

function ownerDecision(s: PolicySignals): string | null {
  if (s.financiallyMaterial) return "action is financially material";
  if (s.changesStaffingPayroll) return "action changes staffing/payroll";
  if (s.changesPricingMaterially) return "action changes pricing materially";
  if (s.b2bContractTerms) return "action involves B2B contract terms";
  if (s.brandComplianceLegalBoundary) return "action affects brand/compliance/legal/professional boundaries";
  if (s.reversibleButMaterial) return "action is reversible but material";
  if (s.ownerApprovalRequiredByStandingInstruction) return "owner approval required by standing instruction";
  if (s.highRiskFinancialConstraint) return "high-risk financial constraint";
  return null;
}

/** Common safety floor for any non-owner action that may proceed. */
function safeFloor(a: SafeActionSignals): boolean {
  return a.reversible && a.withinApprovedSOP && a.ownerApprovalNotRequiredOrGranted
    && a.evidenceSufficient && a.cashImpactSafe && a.staffCapacityOk
    && a.customerQualityControlled && a.noMaterialComplianceRisk && a.hasProofReassessment;
}

/** PROCEED: low-risk, routine, reversible, SOP-approved, evidence sufficient, proof/reassessment, no material risk. */
export function isProceedSafe(a: SafeActionSignals): boolean {
  return a.riskLevel === "low" && a.routine && safeFloor(a);
}

/** CAUTIOUS_PROCEED: reversible low/medium risk with proof/reassessment AND a stop-loss threshold, within SOP. */
export function isCautiousProceedSafe(a: SafeActionSignals): boolean {
  return a.riskLevel !== "high" && a.hasStopLoss && safeFloor(a);
}

/**
 * Decide the owner action status. Order is strict: blocked and need_more_data dominate and can NEVER be
 * overridden by a safe action. A fully-safe action may downgrade an owner-decision to cautious_proceed /
 * proceed; otherwise the materiality and legacy-confidence rules apply.
 */
export function decideActionStatus(s: PolicySignals): PolicyDecision {
  const blocked = isBlocked(s);
  if (blocked) return { status: "blocked", reasons: [blocked] };

  const needData = needsMoreData(s);
  if (needData) return { status: "need_more_data", reasons: [needData] };

  // A genuinely-safe action may proceed / cautious-proceed even where an owner decision would otherwise apply.
  if (s.safeAction) {
    if (isProceedSafe(s.safeAction)) return { status: "proceed", reasons: ["low-risk routine reversible SOP-approved action with proof/reassessment"] };
    if (isCautiousProceedSafe(s.safeAction)) return { status: "cautious_proceed", reasons: ["reversible safe action with proof/reassessment and a stop-loss threshold"] };
  }

  const owner = ownerDecision(s);
  if (owner) return { status: "owner_decision_required", reasons: [owner] };

  // Legacy fallback (no safe action, no owner decision): cautious when confidence is not high.
  if (s.confidence === "low" || s.confidence === "medium") return { status: "cautious_proceed", reasons: ["evidence sufficient but confidence held below high"] };
  return { status: "proceed", reasons: ["no binding constraint and confidence is high"] };
}
