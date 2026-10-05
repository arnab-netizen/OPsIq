/**
 * Owner Finance (Module 2 Slice 3) — deterministic OPPORTUNITY findings.
 *
 * Pure: maps Slice 2 metrics → `OwnerFinding[]` (findingType "opportunity").
 * Opportunities are emitted ONLY when supporting inputs exist (a real, computed
 * metric). When the data isn't there, no opportunity is fabricated.
 */
import { clampScore, clampConfidence, type OwnerFinding, type OwnerSeverity } from "@/domain/owner-spine/contracts";
import type { FinancialSnapshotInput, FinancialDerivedMetrics } from "./types";
import type { FinanceThresholds } from "./thresholds";
import { LIQUIDITY_UNCONFIRMED_STATEMENT } from "./liquidity";
import { IMPORTANT_FIELDS, IMPORTANT_FIELD_LABELS, fixedCostsCoveredByComponents } from "./data-confidence";

interface OppArgs {
  code: string;
  title: string;
  summary: string;
  sourceMetric: string;
  sourceValue?: number | null;
  threshold?: number | null;
  severity: OwnerSeverity;
  confidence: number;
  impactScore: number;
  urgencyScore: number;
  evidence: string[];
  missingData?: string[];
  verificationMetric: string;
}

function opportunity(args: OppArgs): OwnerFinding {
  return {
    domain: "finance",
    code: args.code,
    title: args.title,
    summary: args.summary,
    sourceMetric: args.sourceMetric,
    sourceValue: args.sourceValue ?? null,
    threshold: args.threshold ?? null,
    severity: args.severity,
    confidence: clampConfidence(args.confidence),
    impactScore: clampScore(args.impactScore),
    urgencyScore: clampScore(args.urgencyScore),
    findingType: "opportunity",
    evidence: args.evidence,
    missingData: args.missingData ?? [],
    verificationMetric: args.verificationMetric,
  };
}

const pct = (v: number) => `${v}%`;

/**
 * Priority ordering for missing IMPORTANT finance inputs: earlier entries unlock
 * more diagnostic signals in the current engine (risk findings + opportunity findings).
 * Fields that only produce computed metrics (no current rule fires on them) rank last.
 *
 * Priority basis:
 *   receivables       → receivablesPressurePct → FIN_HIGH_RECEIVABLES + FIN_OPP_RECEIVABLES_COLLECTION
 *   payables          → payablesPressurePct    → FIN_HIGH_PAYABLES
 *   discountAmount    → discountLeakagePct + costLeakageRatioPct → FIN_DISCOUNT_LEAKAGE + FIN_OPP_LEAKAGE_REDUCTION
 *   refundAmount      → refundReworkLeakagePct + costLeakageRatioPct → FIN_REFUND_REWORK_LEAKAGE
 *   costOfGoodsOrServices → grossMarginPct → FIN_NEGATIVE_GROSS_MARGIN
 *   loanEmiDebtPayments   → debtServicePressurePct → FIN_HIGH_DEBT_PRESSURE
 *   salaryPayroll     → payrollBurdenPct → FIN_HIGH_PAYROLL_BURDEN
 *   fixedCosts        → fixedCostBurdenPct (but covered by components when any are present)
 *   ownerWithdrawals, orderCount, customerCount → metric only (no current rule)
 */
const IMPORTANT_FIELD_PRIORITY_ORDER: (keyof typeof IMPORTANT_FIELD_LABELS)[] = [
  "receivables",
  "payables",
  "discountAmount",
  "refundAmount",
  "costOfGoodsOrServices",
  "loanEmiDebtPayments",
  "salaryPayroll",
  "fixedCosts",
  "ownerWithdrawals",
  "orderCount",
  "customerCount",
];

export function buildFinanceOpportunityFindings(
  input: FinancialSnapshotInput,
  m: FinancialDerivedMetrics,
  t: FinanceThresholds
): OwnerFinding[] {
  const findings: OwnerFinding[] = [];
  const conf = clampConfidence(m.dataConfidenceScore / 100);

  // Margin improvement opportunity: fires only when margin is weak-but-positive.
  // Negative margin is already covered by FIN_NEGATIVE_NET_MARGIN (risk) and
  // FIN_OPP_BREAK_EVEN_RECOVERY — adding a third "room to improve" signal on the
  // same metric with lower urgency produces conflicting triage for the owner.
  if (m.netMarginPct !== null && m.netMarginPct >= 0 && m.netMarginPct < t.healthyNetMarginPct) {
    findings.push(
      opportunity({
        code: "FIN_OPP_MARGIN_IMPROVEMENT",
        title: "Room to improve net margin",
        summary: "Net margin is below the healthy bar; targeted pricing/cost actions can lift profitability.",
        sourceMetric: "netMarginPct",
        sourceValue: m.netMarginPct,
        threshold: t.healthyNetMarginPct,
        severity: "medium",
        confidence: conf,
        impactScore: clampScore((t.healthyNetMarginPct - m.netMarginPct) * 2),
        urgencyScore: 35,
        evidence: [`netMarginPct = ${pct(m.netMarginPct)} < healthy ${pct(t.healthyNetMarginPct)}`],
        verificationMetric: "netMarginPct",
      })
    );
  }

  // Break-even recovery opportunity. Intentional dual-signal: FIN_BELOW_BREAK_EVEN (risk/high)
  // fires in risk-rules for the same condition. Two signals are kept because the risk
  // tells the owner WHAT is wrong; this opportunity tells them HOW to fix it.
  const revenue = typeof input.revenue === "number" && Number.isFinite(input.revenue) ? input.revenue : null;
  if (revenue !== null && m.breakEvenRevenue !== null && revenue < m.breakEvenRevenue) {
    const gap = Math.round(m.breakEvenRevenue - revenue);
    findings.push(
      opportunity({
        code: "FIN_OPP_BREAK_EVEN_RECOVERY",
        title: "Closing the gap to break-even",
        summary: "A defined revenue increase or cost reduction reaches break-even and stops the loss.",
        // sourceValue is revenue (break-even is the threshold) — labelling it
        // breakEvenRevenue presented revenue as a measured break-even value.
        sourceMetric: "revenue",
        sourceValue: revenue,
        threshold: m.breakEvenRevenue,
        severity: "high",
        confidence: conf,
        impactScore: 70,
        urgencyScore: 60,
        evidence: [`gap to break-even = ${gap} (revenue ${revenue} → ${m.breakEvenRevenue})`],
        verificationMetric: "breakEvenRevenue",
      })
    );
  }

  // Receivables collection opportunity: requires pressure above a material threshold.
  // Any positive receivables balance is normal operating state (net-30 terms etc.).
  // Only flag when receivables pressure exceeds half the "high" threshold.
  if (m.receivablesPressurePct !== null && m.receivablesPressurePct > t.highReceivablesPressurePct / 2) {
    findings.push(
      opportunity({
        code: "FIN_OPP_RECEIVABLES_COLLECTION",
        title: "Collect outstanding receivables to free cash",
        summary: "Uncollected revenue can be converted to cash via a focused collection push.",
        sourceMetric: "receivablesPressurePct",
        sourceValue: m.receivablesPressurePct,
        threshold: t.highReceivablesPressurePct,
        severity: m.receivablesPressurePct > t.highReceivablesPressurePct ? "medium" : "low",
        confidence: conf,
        impactScore: clampScore(m.receivablesPressurePct),
        urgencyScore: 40,
        evidence: [`receivablesPressurePct = ${pct(m.receivablesPressurePct)}`],
        verificationMetric: "receivablesPressurePct",
      })
    );
  }

  // Debt pressure reduction opportunity
  if (m.debtServicePressurePct !== null && m.debtServicePressurePct > t.highDebtServicePressurePct) {
    findings.push(
      opportunity({
        code: "FIN_OPP_DEBT_REDUCTION",
        title: "Reduce debt-service pressure",
        summary: "Restructuring or prepaying high-cost debt lowers fixed cash outflow and risk.",
        sourceMetric: "debtServicePressurePct",
        sourceValue: m.debtServicePressurePct,
        threshold: t.highDebtServicePressurePct,
        severity: "medium",
        confidence: conf,
        impactScore: clampScore(m.debtServicePressurePct),
        urgencyScore: 45,
        evidence: [`debtServicePressurePct = ${pct(m.debtServicePressurePct)} > ${pct(t.highDebtServicePressurePct)}`],
        verificationMetric: "debtServicePressurePct",
      })
    );
  }

  // Leakage reduction opportunity: requires at least 2% leakage ratio.
  // Below 2% is within normal operational tolerance (rounding, small discounts).
  if (m.costLeakageRatioPct !== null && m.costLeakageRatioPct >= 2) {
    findings.push(
      opportunity({
        code: "FIN_OPP_LEAKAGE_REDUCTION",
        title: "Recover margin by cutting cost leakage",
        summary: "Discounts/refunds/rework are recoverable margin; tightening them lifts profit directly.",
        sourceMetric: "costLeakageRatioPct",
        sourceValue: m.costLeakageRatioPct,
        threshold: t.highCostLeakageRatioPct,
        severity: m.costLeakageRatioPct > t.highCostLeakageRatioPct ? "medium" : "low",
        confidence: conf,
        impactScore: clampScore(m.costLeakageRatioPct * 3),
        urgencyScore: 40,
        evidence: [`costLeakageRatioPct = ${pct(m.costLeakageRatioPct)}`],
        verificationMetric: "costLeakageRatioPct",
      })
    );
  }

  // Revenue quality improvement opportunity
  if (m.revenueQualityScore !== null && m.revenueQualityScore < 80) {
    findings.push(
      opportunity({
        code: "FIN_OPP_REVENUE_QUALITY",
        title: "Improve revenue quality",
        summary: "Revenue quality is below target (discount dependence / concentration); diversify and de-discount.",
        sourceMetric: "revenueQualityScore",
        sourceValue: m.revenueQualityScore,
        threshold: 80,
        severity: "low",
        confidence: conf,
        impactScore: clampScore(80 - m.revenueQualityScore),
        urgencyScore: 25,
        evidence: [`revenueQualityScore = ${m.revenueQualityScore} < 80`],
        verificationMetric: "revenueQualityScore",
      })
    );
  }

  // Data quality improvement opportunity (confidence below 100)
  if (m.dataConfidenceScore < 100) {
    const coveredByComponents = fixedCostsCoveredByComponents(input);

    // Build missing list in priority order:
    //   1. Fields in IMPORTANT_FIELD_PRIORITY_ORDER that are missing (and not covered by components).
    //   2. Any IMPORTANT_FIELDS not in the priority list (forward-compatibility catch-all).
    function isMissingField(f: string): boolean {
      if (f === "fixedCosts" && coveredByComponents) return false;
      const v = input[f as keyof FinancialSnapshotInput];
      return v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v));
    }
    const priorityOrdered = IMPORTANT_FIELD_PRIORITY_ORDER.filter(isMissingField);
    const prioritySet = new Set(priorityOrdered);
    const remaining = IMPORTANT_FIELDS.filter((f) => !prioritySet.has(f) && isMissingField(f));
    const allMissingOrdered = [...priorityOrdered, ...remaining];

    // Use owner-facing labels (not camelCase keys) so the evidence line is actionable.
    const evidenceLine =
      m.missingRequiredInputs.length > 0
        ? `missing critical inputs: ${m.missingRequiredInputs.join(", ")}`
        : allMissingOrdered.length > 0
        ? `provide for sharper diagnosis: ${allMissingOrdered.map((f) => IMPORTANT_FIELD_LABELS[f] ?? f).join("; ")}`
        : "snapshot may be stale — refresh the data";
    findings.push(
      opportunity({
        code: "FIN_OPP_DATA_QUALITY",
        title: "Improve data completeness for a sharper diagnosis",
        summary: "Some inputs are missing or stale; supplying them increases the confidence of every recommendation.",
        sourceMetric: "dataConfidenceScore",
        sourceValue: m.dataConfidenceScore,
        threshold: 100,
        severity: "low",
        confidence: 1,
        impactScore: clampScore(100 - m.dataConfidenceScore),
        urgencyScore: 20,
        evidence: [`data confidence score is ${m.dataConfidenceScore} out of 100`, evidenceLine],
        missingData: allMissingOrdered, // priority-ordered field keys for recommendation builder
        verificationMetric: "dataConfidenceScore",
      })
    );
  }

  // Outstanding debt context: principal is recorded but the monthly repayment amount is
  // entirely absent (loanEmiDebtPayments === null/undefined). Only emit when EMI is genuinely
  // unknown — confirmed zero-repayment (loanEmiDebtPayments === 0) is valid and correct:
  // debtServicePressurePct = 0% is the right answer, not a data gap.
  const totalDebt = typeof input.totalDebtOutstanding === "number" && Number.isFinite(input.totalDebtOutstanding)
    ? input.totalDebtOutstanding
    : null;
  const emi = typeof input.loanEmiDebtPayments === "number" && Number.isFinite(input.loanEmiDebtPayments)
    ? input.loanEmiDebtPayments
    : null;
  if (totalDebt !== null && totalDebt > 0 && emi === null) {
    findings.push(
      opportunity({
        code: "FIN_NOTABLE_OUTSTANDING_DEBT",
        title: "Outstanding debt principal recorded — enter monthly repayment",
        summary:
          "A debt principal is recorded but no monthly repayment amount has been entered. The debt-service pressure metric cannot be computed until the EMI is provided (enter 0 if there is no fixed monthly repayment).",
        sourceMetric: "totalDebtOutstanding",
        sourceValue: totalDebt,
        threshold: null,
        severity: "low",
        confidence: 1,
        impactScore: 15,
        urgencyScore: 25,
        evidence: [
          `totalDebtOutstanding = ${totalDebt}`,
          "loanEmiDebtPayments not provided — debtServicePressurePct cannot be computed",
          "enter the monthly repayment amount (or 0 if there is no fixed schedule)",
        ],
        verificationMetric: "debtServicePressurePct",
      })
    );
  }

  // Liquidity is incomplete: physical cash is recorded but the bank balance is unknown, so total
  // liquid funds (and therefore cash runway) cannot be confirmed. A data request — never a survival
  // verdict, and never a claim that liquidity is zero. Enter 0 for the bank if there is none.
  if (m.liquidityStatus === "BANK_UNKNOWN") {
    findings.push(
      opportunity({
        code: "FIN_LIQUIDITY_UNCONFIRMED",
        title: "Add your bank balance to confirm how long your cash will last",
        summary: LIQUIDITY_UNCONFIRMED_STATEMENT,
        sourceMetric: "totalLiquidFunds",
        sourceValue: null,
        threshold: null,
        severity: "medium",
        confidence: 1,
        impactScore: 40,
        urgencyScore: 30,
        evidence: [
          "cash in hand is recorded; bank balance is not",
          "cash runway and days of cash cover need both cash in hand and the bank balance",
          "enter the bank balance (or 0 if you hold nothing in the bank) in Guided setup or Cashflow",
        ],
        missingData: ["bankBalance"],
        verificationMetric: "totalLiquidFunds",
      })
    );
  }

  return findings;
}
