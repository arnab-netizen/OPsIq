/**
 * Owner Sales (Module 3 Slice 2) — deterministic OPPORTUNITY findings.
 *
 * Pure: maps Slice 1 sales metrics → `OwnerFinding[]` (findingType
 * "opportunity"). Opportunities are emitted ONLY when supporting inputs exist (a
 * real, computed metric). When the data isn't there, no opportunity is fabricated.
 */
import {
  clampScore,
  clampConfidence,
  type OwnerFinding,
  type OwnerSeverity,
} from "@/domain/owner-spine/contracts";
import type { SalesSnapshotInput, SalesDerivedMetrics } from "./types";
import type { SalesThresholds } from "./thresholds";

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
    domain: "sales",
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

export function buildSalesOpportunityFindings(
  input: SalesSnapshotInput,
  m: SalesDerivedMetrics,
  t: SalesThresholds
): OwnerFinding[] {
  const findings: OwnerFinding[] = [];
  const conf = clampConfidence(m.dataConfidenceScore / 100);
  void input;

  // Raise conversion to the healthy bar (only when below it)
  if (m.leadToSaleConversionPct !== null && m.leadToSaleConversionPct < t.healthyConversionPct) {
    findings.push(
      opportunity({
        code: "SALES_OPP_RAISE_CONVERSION",
        title: "Raise lead-to-sale conversion",
        summary:
          "Conversion is below the healthy bar; a tighter qualification + follow-up process lifts sales from existing lead flow.",
        sourceMetric: "leadToSaleConversionPct",
        sourceValue: m.leadToSaleConversionPct,
        threshold: t.healthyConversionPct,
        severity: m.leadToSaleConversionPct < t.lowConversionPct ? "medium" : "low",
        confidence: conf,
        impactScore: clampScore((t.healthyConversionPct - m.leadToSaleConversionPct) * 2),
        urgencyScore: 40,
        evidence: [
          `leadToSaleConversionPct = ${pct(m.leadToSaleConversionPct)} < healthy ${pct(t.healthyConversionPct)}`,
        ],
        verificationMetric: "leadToSaleConversionPct",
      })
    );
  }

  // Improve retention (only when repeat is below the healthy bar)
  if (m.repeatRatePct !== null && m.repeatRatePct < t.healthyRepeatRatePct) {
    findings.push(
      opportunity({
        code: "SALES_OPP_IMPROVE_RETENTION",
        title: "Improve repeat purchase",
        summary:
          "Retention is below target; a repeat-purchase nudge (reminders, loyalty, service quality) is cheaper than new acquisition.",
        sourceMetric: "repeatRatePct",
        sourceValue: m.repeatRatePct,
        threshold: t.healthyRepeatRatePct,
        severity: m.repeatRatePct < t.weakRepeatRatePct ? "medium" : "low",
        confidence: conf,
        impactScore: clampScore(t.healthyRepeatRatePct - m.repeatRatePct),
        urgencyScore: 40,
        evidence: [`repeatRatePct = ${pct(m.repeatRatePct)} < healthy ${pct(t.healthyRepeatRatePct)}`],
        verificationMetric: "repeatRatePct",
      })
    );
  }

  // Win back lost customers (only when there is measurable churn)
  if (m.lostCustomerRatePct !== null && m.lostCustomerRatePct > 0) {
    findings.push(
      opportunity({
        code: "SALES_OPP_WINBACK",
        title: "Win back lost customers",
        summary:
          "Lost customers are a warm audience; a focused win-back outreach can recover a share of them quickly.",
        sourceMetric: "lostCustomerRatePct",
        sourceValue: m.lostCustomerRatePct,
        threshold: t.highLostCustomerRatePct,
        severity: m.lostCustomerRatePct > t.highLostCustomerRatePct ? "medium" : "low",
        confidence: conf,
        impactScore: clampScore(m.lostCustomerRatePct),
        urgencyScore: 45,
        evidence: [`lostCustomerRatePct = ${pct(m.lostCustomerRatePct)}`],
        verificationMetric: "lostCustomerRatePct",
      })
    );
  }

  // Tighten discounting (only when discounts are used)
  if (m.discountDependencePct !== null && m.discountDependencePct > 0) {
    findings.push(
      opportunity({
        code: "SALES_OPP_TIGHTEN_DISCOUNT",
        title: "Tighten discounting to protect margin",
        summary:
          "A share of revenue is given back as discounts; capping/targeting discounts recovers margin without losing most sales.",
        sourceMetric: "discountDependencePct",
        sourceValue: m.discountDependencePct,
        threshold: t.highDiscountDependencePct,
        severity: m.discountDependencePct > t.highDiscountDependencePct ? "medium" : "low",
        confidence: conf,
        impactScore: clampScore(m.discountDependencePct),
        urgencyScore: 35,
        evidence: [`discountDependencePct = ${pct(m.discountDependencePct)}`],
        verificationMetric: "discountDependencePct",
      })
    );
  }

  // Convert the B2B pipeline (only when a pipeline is reported)
  if (m.b2bPipelineCoveragePct !== null && m.b2bPipelineCoveragePct > 0) {
    findings.push(
      opportunity({
        code: "SALES_OPP_CONVERT_PIPELINE",
        title: "Convert the B2B pipeline",
        summary:
          "There is B2B pipeline to close; a focused push on the best accounts turns pipeline into booked revenue.",
        sourceMetric: "b2bPipelineCoveragePct",
        sourceValue: m.b2bPipelineCoveragePct,
        threshold: t.weakB2bPipelineCoveragePct,
        severity: "low",
        confidence: conf,
        impactScore: clampScore(m.b2bPipelineCoveragePct / 2),
        urgencyScore: 35,
        evidence: [`b2bPipelineCoveragePct = ${pct(m.b2bPipelineCoveragePct)}`],
        verificationMetric: "b2bPipelineCoveragePct",
      })
    );
  }

  // Data quality improvement opportunity (confidence below 100)
  if (m.dataConfidenceScore < 100) {
    findings.push(
      opportunity({
        code: "SALES_OPP_DATA_QUALITY",
        title: "Improve data completeness for a sharper sales diagnosis",
        summary:
          "Some inputs are missing or stale; supplying them increases the confidence of every sales recommendation.",
        sourceMetric: "dataConfidenceScore",
        sourceValue: m.dataConfidenceScore,
        threshold: 100,
        severity: "low",
        confidence: 1,
        impactScore: clampScore(100 - m.dataConfidenceScore),
        urgencyScore: 20,
        evidence: [
          `dataConfidenceScore = ${m.dataConfidenceScore} < 100`,
          m.missingRequiredInputs.length > 0
            ? `missing: ${m.missingRequiredInputs.join(", ")}`
            : "some non-critical fields missing",
        ],
        verificationMetric: "dataConfidenceScore",
      })
    );
  }

  return findings;
}
