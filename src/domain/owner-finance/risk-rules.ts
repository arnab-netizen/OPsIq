/**
 * Owner Finance (Module 2 Slice 3) — deterministic RISK findings.
 *
 * Pure: maps Slice 2 metrics → `OwnerFinding[]` (findingType "risk") using the
 * Owner Intelligence Spine contract. A rule emits ONLY when its metric is
 * computable and crosses its threshold (or, for data findings, when data is
 * missing/invalid). Nothing is invented: `sourceValue` is set only from a real
 * metric; missing inputs surface as `missingData` + a missing-data finding.
 */
import { clampScore, clampConfidence, type OwnerFinding, type OwnerSeverity } from "@/domain/owner-spine/contracts";
import type { FinancialSnapshotInput, FinancialDerivedMetrics } from "./types";
import type { FinanceThresholds } from "./thresholds";
import { isValidCurrency } from "./data-confidence";

/** Default urgency by severity (deterministic baseline). */
const SEVERITY_URGENCY: Record<OwnerSeverity, number> = {
  low: 20,
  medium: 45,
  high: 70,
  critical: 90,
};

interface FindingArgs {
  code: string;
  title: string;
  summary: string;
  sourceMetric: string;
  sourceValue?: number | null;
  threshold?: number | null;
  severity: OwnerSeverity;
  confidence: number;
  impactScore: number;
  urgencyScore?: number;
  evidence: string[];
  missingData?: string[];
  verificationMetric: string;
}

function risk(args: FindingArgs): OwnerFinding {
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
    urgencyScore: clampScore(args.urgencyScore ?? SEVERITY_URGENCY[args.severity]),
    findingType: "risk",
    evidence: args.evidence,
    missingData: args.missingData ?? [],
    verificationMetric: args.verificationMetric,
  };
}

const pct = (v: number) => `${v}%`;

/**
 * Build all triggered finance risk findings for one snapshot. `baseConfidence`
 * is the data-confidence (0..1) applied to metric-derived findings so missing
 * data lowers their confidence; data/currency findings are themselves certain.
 */
export function buildFinanceRiskFindings(
  input: FinancialSnapshotInput,
  m: FinancialDerivedMetrics,
  t: FinanceThresholds
): OwnerFinding[] {
  const findings: OwnerFinding[] = [];
  const conf = clampConfidence(m.dataConfidenceScore / 100);

  // Invalid currency (certain)
  if (!isValidCurrency(input.currency)) {
    findings.push(
      risk({
        code: "FIN_INVALID_CURRENCY",
        title: "Reporting currency is invalid",
        summary: "The snapshot currency is missing or not a valid 3–8 letter code; monetary outputs cannot be trusted until fixed.",
        sourceMetric: "currency",
        sourceValue: null,
        severity: "medium",
        confidence: 1,
        impactScore: 30,
        evidence: [`currency = "${String(input.currency)}" is not a valid code`],
        missingData: ["currency"],
        verificationMetric: "currency",
      })
    );
  }

  // Missing critical data (certain about the absence)
  if (m.missingRequiredInputs.length > 0) {
    const severity: OwnerSeverity = m.missingRequiredInputs.length >= 2 ? "high" : "medium";
    findings.push(
      risk({
        code: "FIN_MISSING_CRITICAL_DATA",
        title: "Critical financial inputs are missing",
        summary: "Key inputs needed for a trustworthy financial diagnosis are missing; provide them to raise confidence.",
        sourceMetric: "dataConfidenceScore",
        sourceValue: m.dataConfidenceScore,
        severity,
        confidence: 1,
        impactScore: 40,
        evidence: [`missing: ${m.missingRequiredInputs.join(", ")}`, `dataConfidenceScore = ${m.dataConfidenceScore}`],
        missingData: m.missingRequiredInputs,
        verificationMetric: "dataConfidenceScore",
      })
    );
  }

  // Negative gross margin
  if (m.grossMarginPct !== null && m.grossMarginPct < 0) {
    findings.push(
      risk({
        code: "FIN_NEGATIVE_GROSS_MARGIN",
        title: "Selling below direct cost (negative gross margin)",
        summary: "Each sale loses money before overheads; pricing or direct costs must change.",
        sourceMetric: "grossMarginPct",
        sourceValue: m.grossMarginPct,
        threshold: 0,
        severity: "critical",
        confidence: conf,
        impactScore: 95,
        evidence: [`grossMarginPct = ${pct(m.grossMarginPct)}`],
        verificationMetric: "grossMarginPct",
      })
    );
  }

  // Negative net margin
  if (m.netMarginPct !== null && m.netMarginPct < 0) {
    findings.push(
      risk({
        code: "FIN_NEGATIVE_NET_MARGIN",
        title: "Business is running at a net loss",
        summary: "Total costs exceed revenue for the period; without change, cash depletes.",
        sourceMetric: "netMarginPct",
        sourceValue: m.netMarginPct,
        threshold: 0,
        severity: "critical",
        confidence: conf,
        impactScore: 90,
        evidence: [`netMarginPct = ${pct(m.netMarginPct)}`, m.netProfit !== null ? `netProfit = ${m.netProfit}` : ""].filter(Boolean),
        verificationMetric: "netMarginPct",
      })
    );
  }

  // Revenue below break-even
  const revenue = typeof input.revenue === "number" && Number.isFinite(input.revenue) ? input.revenue : null;
  if (revenue !== null && m.breakEvenRevenue !== null && revenue < m.breakEvenRevenue) {
    findings.push(
      risk({
        code: "FIN_BELOW_BREAK_EVEN",
        title: "Revenue is below break-even",
        summary: "Sales do not yet cover fixed + variable costs; revenue must rise or costs must fall to break even.",
        sourceMetric: "breakEvenRevenue",
        sourceValue: revenue,
        threshold: m.breakEvenRevenue,
        severity: "high",
        confidence: conf,
        impactScore: 80,
        evidence: [`revenue = ${revenue} < breakEvenRevenue = ${m.breakEvenRevenue}`],
        verificationMetric: "breakEvenRevenue",
      })
    );
  }

  // Cash runway bands
  if (m.cashRunwayDays !== null) {
    if (m.cashRunwayDays < t.insolventCashRunwayDays) {
      findings.push(
        risk({
          code: "FIN_INSOLVENT_RUNWAY",
          title: "Cash runs out within days",
          summary: "At the current burn, cash is nearly exhausted; immediate cash action is required.",
          sourceMetric: "cashRunwayDays",
          sourceValue: m.cashRunwayDays,
          threshold: t.insolventCashRunwayDays,
          severity: "critical",
          confidence: conf,
          impactScore: 100,
          urgencyScore: 100,
          evidence: [`cashRunwayDays = ${m.cashRunwayDays} < ${t.insolventCashRunwayDays}`],
          verificationMetric: "cashRunwayDays",
        })
      );
    } else if (m.cashRunwayDays < t.criticalCashRunwayDays) {
      findings.push(
        risk({
          code: "FIN_LOW_RUNWAY",
          title: "Cash runway is critically low",
          summary: "Cash covers less than a month at the current burn; reduce burn or raise cash.",
          sourceMetric: "cashRunwayDays",
          sourceValue: m.cashRunwayDays,
          threshold: t.criticalCashRunwayDays,
          severity: "critical",
          confidence: conf,
          impactScore: 80,
          evidence: [`cashRunwayDays = ${m.cashRunwayDays} < ${t.criticalCashRunwayDays}`],
          verificationMetric: "cashRunwayDays",
        })
      );
    } else if (m.cashRunwayDays < t.lowCashRunwayDays) {
      findings.push(
        risk({
          code: "FIN_LOW_RUNWAY",
          title: "Cash runway is getting short",
          summary: "Cash buffer is below the safe threshold; monitor and improve cash conversion.",
          sourceMetric: "cashRunwayDays",
          sourceValue: m.cashRunwayDays,
          threshold: t.lowCashRunwayDays,
          severity: "high",
          confidence: conf,
          impactScore: 55,
          evidence: [`cashRunwayDays = ${m.cashRunwayDays} < ${t.lowCashRunwayDays}`],
          verificationMetric: "cashRunwayDays",
        })
      );
    }
  }

  // Absolute cash cushion warning: fires when cash < 14 days of total costs,
  // regardless of profitability (plugs the gap where cashRunwayDays is null
  // for marginally-profitable but cash-critical businesses).
  if (
    m.cashDaysOfCosts !== null &&
    m.cashRunwayDays === null && // only when runway check did not already fire
    m.cashDaysOfCosts < 14
  ) {
    findings.push(
      risk({
        code: "FIN_LOW_ABSOLUTE_CASH",
        title: "Cash on hand covers less than 2 weeks of costs",
        summary: "Even though the business is not in a net-loss position, cash reserves are critically thin; any disruption to revenue would immediately impair operations.",
        sourceMetric: "cashDaysOfCosts",
        sourceValue: m.cashDaysOfCosts,
        threshold: 14,
        severity: m.cashDaysOfCosts < 7 ? "critical" : "high",
        confidence: conf,
        impactScore: 75,
        evidence: [`cashDaysOfCosts = ${m.cashDaysOfCosts} days < 14-day minimum`],
        verificationMetric: "cashDaysOfCosts",
      })
    );
  }

  // High fixed cost burden
  if (m.fixedCostBurdenPct !== null && m.fixedCostBurdenPct > t.highFixedCostBurdenPct) {
    findings.push(
      risk({
        code: "FIN_HIGH_FIXED_COST_BURDEN",
        title: "Fixed costs are too high relative to revenue",
        summary: "Fixed overheads consume a large share of revenue, leaving little margin buffer.",
        sourceMetric: "fixedCostBurdenPct",
        sourceValue: m.fixedCostBurdenPct,
        threshold: t.highFixedCostBurdenPct,
        severity: "high",
        confidence: conf,
        impactScore: 55,
        evidence: [`fixedCostBurdenPct = ${pct(m.fixedCostBurdenPct)} > ${pct(t.highFixedCostBurdenPct)}`],
        verificationMetric: "fixedCostBurdenPct",
      })
    );
  }

  // High payroll burden
  if (m.payrollBurdenPct !== null && m.payrollBurdenPct > t.highPayrollBurdenPct) {
    findings.push(
      risk({
        code: "FIN_HIGH_PAYROLL_BURDEN",
        title: "Payroll is a high share of revenue",
        summary: "Wage cost relative to revenue is high; review productivity and staffing vs output.",
        sourceMetric: "payrollBurdenPct",
        sourceValue: m.payrollBurdenPct,
        threshold: t.highPayrollBurdenPct,
        severity: "medium",
        confidence: conf,
        impactScore: 45,
        evidence: [`payrollBurdenPct = ${pct(m.payrollBurdenPct)} > ${pct(t.highPayrollBurdenPct)}`],
        verificationMetric: "payrollBurdenPct",
      })
    );
  }

  // Debt / EMI pressure
  if (m.debtServicePressurePct !== null) {
    if (m.debtServicePressurePct > t.criticalDebtServicePressurePct) {
      findings.push(
        risk({
          code: "FIN_HIGH_DEBT_PRESSURE",
          title: "Debt repayments consume a dangerous share of revenue",
          summary: "EMI/debt service is very high relative to revenue, squeezing operating cash.",
          sourceMetric: "debtServicePressurePct",
          sourceValue: m.debtServicePressurePct,
          threshold: t.criticalDebtServicePressurePct,
          severity: "critical",
          confidence: conf,
          impactScore: 85,
          evidence: [`debtServicePressurePct = ${pct(m.debtServicePressurePct)} > ${pct(t.criticalDebtServicePressurePct)}`],
          verificationMetric: "debtServicePressurePct",
        })
      );
    } else if (m.debtServicePressurePct > t.highDebtServicePressurePct) {
      findings.push(
        risk({
          code: "FIN_HIGH_DEBT_PRESSURE",
          title: "Debt repayments are a high share of revenue",
          summary: "EMI/debt service is high relative to revenue; review restructuring or prepayment.",
          sourceMetric: "debtServicePressurePct",
          sourceValue: m.debtServicePressurePct,
          threshold: t.highDebtServicePressurePct,
          severity: "high",
          confidence: conf,
          impactScore: 60,
          evidence: [`debtServicePressurePct = ${pct(m.debtServicePressurePct)} > ${pct(t.highDebtServicePressurePct)}`],
          verificationMetric: "debtServicePressurePct",
        })
      );
    }
  }

  // Overdue / high receivables
  if (m.receivablesPressurePct !== null && m.receivablesPressurePct > t.highReceivablesPressurePct) {
    findings.push(
      risk({
        code: "FIN_HIGH_RECEIVABLES",
        title: "Too much cash is stuck in receivables",
        summary: "A large share of revenue is uncollected; collection risk and cash strain are elevated.",
        sourceMetric: "receivablesPressurePct",
        sourceValue: m.receivablesPressurePct,
        threshold: t.highReceivablesPressurePct,
        severity: "medium",
        confidence: conf,
        impactScore: 45,
        evidence: [`receivablesPressurePct = ${pct(m.receivablesPressurePct)} > ${pct(t.highReceivablesPressurePct)}`],
        verificationMetric: "receivablesPressurePct",
      })
    );
  }

  // Payables pressure
  if (m.payablesPressurePct !== null && m.payablesPressurePct > t.highPayablesPressurePct) {
    findings.push(
      risk({
        code: "FIN_HIGH_PAYABLES",
        title: "Payables are high relative to revenue",
        summary: "Outstanding payables are large; vendor-cutoff and liquidity risk are elevated.",
        sourceMetric: "payablesPressurePct",
        sourceValue: m.payablesPressurePct,
        threshold: t.highPayablesPressurePct,
        severity: "medium",
        confidence: conf,
        impactScore: 40,
        evidence: [`payablesPressurePct = ${pct(m.payablesPressurePct)} > ${pct(t.highPayablesPressurePct)}`],
        verificationMetric: "payablesPressurePct",
      })
    );
  }

  // Discount leakage
  if (m.discountLeakagePct !== null && m.discountLeakagePct > t.highDiscountLeakagePct) {
    findings.push(
      risk({
        code: "FIN_DISCOUNT_LEAKAGE",
        title: "Discounts are eroding revenue",
        summary: "Discount as a share of revenue is high; margin is leaking through price concessions.",
        sourceMetric: "discountLeakagePct",
        sourceValue: m.discountLeakagePct,
        threshold: t.highDiscountLeakagePct,
        severity: "medium",
        confidence: conf,
        impactScore: 45,
        evidence: [`discountLeakagePct = ${pct(m.discountLeakagePct)} > ${pct(t.highDiscountLeakagePct)}`],
        verificationMetric: "discountLeakagePct",
      })
    );
  }

  // Refund / rework leakage (uses cost leakage ratio as the umbrella signal)
  if (m.refundReworkLeakagePct !== null && m.refundReworkLeakagePct > 0 && m.costLeakageRatioPct !== null && m.costLeakageRatioPct > t.highCostLeakageRatioPct) {
    findings.push(
      risk({
        code: "FIN_REFUND_REWORK_LEAKAGE",
        title: "Refunds/rework/complaints are leaking money",
        summary: "Quality-related costs are a notable share of revenue; reducing them recovers margin.",
        sourceMetric: "refundReworkLeakagePct",
        sourceValue: m.refundReworkLeakagePct,
        threshold: t.highCostLeakageRatioPct,
        severity: "medium",
        confidence: conf,
        impactScore: 45,
        evidence: [`refundReworkLeakagePct = ${pct(m.refundReworkLeakagePct)}`, `costLeakageRatioPct = ${pct(m.costLeakageRatioPct)} > ${pct(t.highCostLeakageRatioPct)}`],
        verificationMetric: "refundReworkLeakagePct",
      })
    );
  }

  return findings;
}
