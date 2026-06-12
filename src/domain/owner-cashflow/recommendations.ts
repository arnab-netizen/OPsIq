/**
 * Owner Cashflow (Module 5 Slice 3) — deterministic recommendations.
 *
 * Pure: maps Slice 2 cashflow `OwnerFinding`s → traceable
 * `CashflowRecommendation`s. Every recommendation carries its source
 * metric/value/threshold, severity, expected impact, confidence, the required
 * owner action, and how to verify it. A finding with no template produces no
 * recommendation (reported as a missing action input by the planner) — nothing
 * is invented.
 */
import type { OwnerFinding, OwnerSeverity } from "@/domain/owner-spine/contracts";
import { clampScore, clampConfidence } from "@/domain/owner-spine/contracts";

export interface CashflowRecommendation {
  recommendationCode: string;
  findingCode: string;
  category: string;
  sourceMetric: string;
  sourceValue: number | null;
  threshold: number | null;
  severity: OwnerSeverity;
  expectedCashImpactScore: number; // 0..100
  urgencyScore: number; // 0..100 (carried from the finding)
  confidence: number; // 0..1
  requiredOwnerAction: string;
  verificationMetric: string;
  verificationMethod: string;
  expectedTimeframeDays: number;
  effortScore: number; // 0..100
  ownerRole: string;
  title: string;
  evidence: string[];
}

interface CashflowRecTemplate {
  recommendationCode: string;
  category: string;
  title: string;
  requiredOwnerAction: string;
  verificationMethod: string;
  expectedTimeframeDays: number;
  effortScore: number;
  ownerRole: string;
}

/**
 * Finding code → recommendation template. Categories cover the cashflow action
 * set: preserve cash, meet near-term dues, manage payables, reduce debt-default
 * risk, collect receivables, speed collections, control owner withdrawal, and
 * improve data quality.
 */
export const CASHFLOW_REC_TEMPLATES: Record<string, CashflowRecTemplate> = {
  CF_INSOLVENT_RUNWAY: {
    recommendationCode: "CFREC_PRESERVE_CASH_NOW",
    category: "preserve_cash",
    title: "Preserve cash immediately",
    requiredOwnerAction:
      "Freeze non-critical spend, pull forward collections, and arrange a cash buffer now.",
    verificationMethod: "Re-measure cashRunwayDays; target above the insolvency threshold.",
    expectedTimeframeDays: 5,
    effortScore: 50,
    ownerRole: "owner",
  },
  CF_LOW_RUNWAY: {
    recommendationCode: "CFREC_EXTEND_RUNWAY",
    category: "preserve_cash",
    title: "Extend cash runway",
    requiredOwnerAction: "Cut net burn and accelerate collections to extend the cash runway.",
    verificationMethod: "Re-measure cashRunwayDays; target above the low-runway threshold.",
    expectedTimeframeDays: 14,
    effortScore: 50,
    ownerRole: "owner",
  },
  CF_URGENT_PAYMENT_RISK: {
    recommendationCode: "CFREC_COVER_NEAR_TERM_DUES",
    category: "meet_near_term_dues",
    title: "Sequence and fund near-term dues",
    requiredOwnerAction:
      "Rank salary/rent/vendor/tax dues by criticality, fund the essential ones first, and stagger or arrange cash for the rest.",
    verificationMethod: "Re-measure urgentPaymentRiskPct next period; target below threshold.",
    expectedTimeframeDays: 7,
    effortScore: 45,
    ownerRole: "owner",
  },
  CF_VENDOR_CUTOFF_RISK: {
    recommendationCode: "CFREC_MANAGE_PAYABLES",
    category: "manage_payables",
    title: "Negotiate and sequence payables",
    requiredOwnerAction:
      "Negotiate vendor terms and sequence payments by criticality to avoid supply cutoff.",
    verificationMethod: "Re-measure payablesPressurePct next period; target below threshold.",
    expectedTimeframeDays: 14,
    effortScore: 40,
    ownerRole: "owner",
  },
  CF_DEBT_DEFAULT_RISK: {
    recommendationCode: "CFREC_PROTECT_DEBT_PAYMENT",
    category: "reduce_debt_default_risk",
    title: "Protect the loan/EMI payment",
    requiredOwnerAction:
      "Ring-fence cash for the EMI or arrange a short restructuring/deferral with the lender before the due date.",
    verificationMethod: "Confirm the EMI is paid and re-measure debtPaymentPressurePct next period.",
    expectedTimeframeDays: 7,
    effortScore: 45,
    ownerRole: "owner",
  },
  CF_HIGH_OVERDUE_RECEIVABLES: {
    recommendationCode: "CFREC_COLLECT_RECEIVABLES",
    category: "collect_receivables",
    title: "Collect overdue receivables",
    requiredOwnerAction: "Run a focused collection drive on the most overdue accounts.",
    verificationMethod: "Re-measure overdueReceivablesPct next period; target below threshold.",
    expectedTimeframeDays: 14,
    effortScore: 30,
    ownerRole: "owner",
  },
  CF_SLOW_COLLECTIONS: {
    recommendationCode: "CFREC_SPEED_COLLECTIONS",
    category: "speed_collections",
    title: "Speed up cash collection",
    requiredOwnerAction:
      "Tighten payment terms, invoice on time, and follow up earlier to shorten days-to-cash.",
    verificationMethod: "Re-measure collectionGapDays next period; target below threshold.",
    expectedTimeframeDays: 21,
    effortScore: 35,
    ownerRole: "owner",
  },
  CF_OWNER_WITHDRAWAL_PRESSURE: {
    recommendationCode: "CFREC_CONTROL_OWNER_WITHDRAWAL",
    category: "control_owner_withdrawal",
    title: "Right-size owner withdrawal",
    requiredOwnerAction: "Defer part of the owner draw this period until cash stabilises.",
    verificationMethod: "Re-measure ownerWithdrawalPressurePct next period; target below threshold.",
    expectedTimeframeDays: 7,
    effortScore: 15,
    ownerRole: "owner",
  },
  CF_INVALID_CURRENCY: {
    recommendationCode: "CFREC_FIX_CURRENCY",
    category: "improve_data_quality",
    title: "Set a valid reporting currency",
    requiredOwnerAction: "Set a valid 3–8 letter currency code on the snapshot.",
    verificationMethod: "Confirm currencyValid is true on the next snapshot.",
    expectedTimeframeDays: 3,
    effortScore: 10,
    ownerRole: "owner",
  },
  CF_MISSING_CRITICAL_DATA: {
    recommendationCode: "CFREC_IMPROVE_DATA_QUALITY",
    category: "improve_data_quality",
    title: "Provide missing cashflow inputs",
    requiredOwnerAction: "Enter the listed missing inputs to raise diagnosis confidence.",
    verificationMethod: "Re-measure dataConfidenceScore next snapshot; target higher.",
    expectedTimeframeDays: 7,
    effortScore: 20,
    ownerRole: "owner",
  },
  CF_OPP_COLLECT_OVERDUE: {
    recommendationCode: "CFREC_COLLECT_RECEIVABLES",
    category: "collect_receivables",
    title: "Convert overdue receivables to cash",
    requiredOwnerAction: "Run a collection push on past-due receivables to free cash.",
    verificationMethod: "Re-measure overdueReceivablesPct next period; target lower.",
    expectedTimeframeDays: 14,
    effortScore: 30,
    ownerRole: "owner",
  },
  CF_OPP_DEFER_PAYABLES: {
    recommendationCode: "CFREC_MANAGE_PAYABLES",
    category: "manage_payables",
    title: "Stagger non-critical payables",
    requiredOwnerAction:
      "Negotiate or phase non-critical payables to spread outflow and protect liquidity.",
    verificationMethod: "Re-measure payablesPressurePct next period; confirm outflow is staggered.",
    expectedTimeframeDays: 21,
    effortScore: 35,
    ownerRole: "owner",
  },
  CF_OPP_REDUCE_OWNER_WITHDRAWAL: {
    recommendationCode: "CFREC_CONTROL_OWNER_WITHDRAWAL",
    category: "control_owner_withdrawal",
    title: "Trim owner withdrawal while cash is tight",
    requiredOwnerAction: "Defer part of the owner draw this period to preserve cash.",
    verificationMethod: "Re-measure ownerWithdrawalPressurePct next period; target lower.",
    expectedTimeframeDays: 7,
    effortScore: 15,
    ownerRole: "owner",
  },
  CF_OPP_DATA_QUALITY: {
    recommendationCode: "CFREC_IMPROVE_DATA_QUALITY",
    category: "improve_data_quality",
    title: "Improve data completeness",
    requiredOwnerAction: "Supply the missing/stale inputs to sharpen the cash diagnosis.",
    verificationMethod: "Re-measure dataConfidenceScore next snapshot; target higher.",
    expectedTimeframeDays: 7,
    effortScore: 20,
    ownerRole: "owner",
  },
};

/** Build a traceable recommendation from a finding, or null if no template. */
export function buildCashflowRecommendation(finding: OwnerFinding): CashflowRecommendation | null {
  const tpl = CASHFLOW_REC_TEMPLATES[finding.code];
  if (!tpl) return null;
  return {
    recommendationCode: tpl.recommendationCode,
    findingCode: finding.code,
    category: tpl.category,
    sourceMetric: finding.sourceMetric,
    sourceValue: finding.sourceValue ?? null, // never invented
    threshold: finding.threshold ?? null,
    severity: finding.severity,
    expectedCashImpactScore: clampScore(finding.impactScore),
    urgencyScore: clampScore(finding.urgencyScore),
    confidence: clampConfidence(finding.confidence),
    requiredOwnerAction: tpl.requiredOwnerAction,
    verificationMetric: finding.verificationMetric ?? finding.sourceMetric,
    verificationMethod: tpl.verificationMethod,
    expectedTimeframeDays: tpl.expectedTimeframeDays,
    effortScore: clampScore(tpl.effortScore),
    ownerRole: tpl.ownerRole,
    title: tpl.title,
    evidence: finding.evidence,
  };
}

/** Build recommendations for every finding that has a template (in input order). */
export function buildCashflowRecommendations(findings: OwnerFinding[]): CashflowRecommendation[] {
  const recs: CashflowRecommendation[] = [];
  for (const f of findings) {
    const r = buildCashflowRecommendation(f);
    if (r) recs.push(r);
  }
  return recs;
}
