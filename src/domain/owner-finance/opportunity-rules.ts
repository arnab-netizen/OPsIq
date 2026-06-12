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
    missingData: [],
    verificationMetric: args.verificationMetric,
  };
}

const pct = (v: number) => `${v}%`;

export function buildFinanceOpportunityFindings(
  input: FinancialSnapshotInput,
  m: FinancialDerivedMetrics,
  t: FinanceThresholds
): OwnerFinding[] {
  const findings: OwnerFinding[] = [];
  const conf = clampConfidence(m.dataConfidenceScore / 100);

  // Margin improvement opportunity (net margin below healthy bar but computable)
  if (m.netMarginPct !== null && m.netMarginPct < t.healthyNetMarginPct) {
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

  // Break-even recovery opportunity
  const revenue = typeof input.revenue === "number" && Number.isFinite(input.revenue) ? input.revenue : null;
  if (revenue !== null && m.breakEvenRevenue !== null && revenue < m.breakEvenRevenue) {
    const gap = Math.round(m.breakEvenRevenue - revenue);
    findings.push(
      opportunity({
        code: "FIN_OPP_BREAK_EVEN_RECOVERY",
        title: "Closing the gap to break-even",
        summary: "A defined revenue increase or cost reduction reaches break-even and stops the loss.",
        sourceMetric: "breakEvenRevenue",
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

  // Receivables collection opportunity (only if receivables present and > 0)
  if (m.receivablesPressurePct !== null && m.receivablesPressurePct > 0) {
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

  // Leakage reduction opportunity (cost leakage present and > 0)
  if (m.costLeakageRatioPct !== null && m.costLeakageRatioPct > 0) {
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
        evidence: [`dataConfidenceScore = ${m.dataConfidenceScore} < 100`, m.missingRequiredInputs.length > 0 ? `missing: ${m.missingRequiredInputs.join(", ")}` : "some non-critical fields missing"],
        verificationMetric: "dataConfidenceScore",
      })
    );
  }

  return findings;
}
