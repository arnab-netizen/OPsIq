/**
 * Owner Sales (Module 3 Slice 2) — deterministic RISK findings.
 *
 * Pure: maps Slice 1 sales metrics → `OwnerFinding[]` (findingType "risk") using
 * the Owner Intelligence Spine contract. A rule emits ONLY when its metric is
 * computable and crosses its threshold (or, for data findings, when data is
 * missing/invalid). Nothing is invented: `sourceValue` is set only from a real
 * metric; missing inputs surface as `missingData` + a missing-data finding.
 */
import {
  clampScore,
  clampConfidence,
  type OwnerFinding,
  type OwnerSeverity,
} from "@/domain/owner-spine/contracts";
import type { SalesSnapshotInput, SalesDerivedMetrics } from "./types";
import type { SalesThresholds } from "./thresholds";
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
    urgencyScore: clampScore(args.urgencyScore ?? SEVERITY_URGENCY[args.severity]),
    findingType: "risk",
    evidence: args.evidence,
    missingData: args.missingData ?? [],
    verificationMetric: args.verificationMetric,
  };
}

const pct = (v: number) => `${v}%`;

/**
 * Build all triggered sales risk findings for one snapshot. Metric-derived
 * findings carry the data-confidence as their confidence; data/currency findings
 * are themselves certain.
 */
export function buildSalesRiskFindings(
  input: SalesSnapshotInput,
  m: SalesDerivedMetrics,
  t: SalesThresholds
): OwnerFinding[] {
  const findings: OwnerFinding[] = [];
  const conf = clampConfidence(m.dataConfidenceScore / 100);

  // Invalid currency (certain)
  if (!isValidCurrency(input.currency)) {
    findings.push(
      risk({
        code: "SALES_INVALID_CURRENCY",
        title: "Reporting currency is invalid",
        summary:
          "The snapshot currency is missing or not a valid 3–8 letter code; monetary sales outputs cannot be trusted until fixed.",
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
        code: "SALES_MISSING_CRITICAL_DATA",
        title: "Critical sales inputs are missing",
        summary:
          "Key inputs needed for a trustworthy sales diagnosis are missing; provide them to raise confidence.",
        sourceMetric: "dataConfidenceScore",
        sourceValue: m.dataConfidenceScore,
        severity,
        confidence: 1,
        impactScore: 40,
        evidence: [
          `missing: ${m.missingRequiredInputs.join(", ")}`,
          `dataConfidenceScore = ${m.dataConfidenceScore}`,
        ],
        missingData: m.missingRequiredInputs,
        verificationMetric: "dataConfidenceScore",
      })
    );
  }

  // Lead → sale conversion bands
  if (m.leadToSaleConversionPct !== null) {
    if (m.leadToSaleConversionPct < t.criticalConversionPct) {
      findings.push(
        risk({
          code: "SALES_LOW_CONVERSION",
          title: "Lead-to-sale conversion has collapsed",
          summary:
            "Almost no leads are becoming orders; the top of the funnel is leaking badly — qualification, follow-up, or offer needs urgent work.",
          sourceMetric: "leadToSaleConversionPct",
          sourceValue: m.leadToSaleConversionPct,
          threshold: t.criticalConversionPct,
          severity: "critical",
          confidence: conf,
          impactScore: 85,
          evidence: [
            `leadToSaleConversionPct = ${pct(m.leadToSaleConversionPct)} < ${pct(t.criticalConversionPct)}`,
          ],
          verificationMetric: "leadToSaleConversionPct",
        })
      );
    } else if (m.leadToSaleConversionPct < t.lowConversionPct) {
      findings.push(
        risk({
          code: "SALES_LOW_CONVERSION",
          title: "Lead-to-sale conversion is low",
          summary:
            "Too few leads convert to orders; tightening qualification and follow-up lifts sales without more spend.",
          sourceMetric: "leadToSaleConversionPct",
          sourceValue: m.leadToSaleConversionPct,
          threshold: t.lowConversionPct,
          severity: "high",
          confidence: conf,
          impactScore: 60,
          evidence: [
            `leadToSaleConversionPct = ${pct(m.leadToSaleConversionPct)} < ${pct(t.lowConversionPct)}`,
          ],
          verificationMetric: "leadToSaleConversionPct",
        })
      );
    }
  }

  // Poor follow-up: qualified leads not converting
  if (m.qualifiedConversionPct !== null && m.qualifiedConversionPct < t.lowQualifiedConversionPct) {
    findings.push(
      risk({
        code: "SALES_POOR_FOLLOW_UP",
        title: "Qualified leads are not being followed up",
        summary:
          "Even qualified leads convert poorly — a follow-up/closing gap, not a lead-quality problem. A disciplined follow-up cadence recovers these.",
        sourceMetric: "qualifiedConversionPct",
        sourceValue: m.qualifiedConversionPct,
        threshold: t.lowQualifiedConversionPct,
        severity: "medium",
        confidence: conf,
        impactScore: 50,
        evidence: [
          `qualifiedConversionPct = ${pct(m.qualifiedConversionPct)} < ${pct(t.lowQualifiedConversionPct)}`,
        ],
        verificationMetric: "qualifiedConversionPct",
      })
    );
  }

  // Repeat rate bands
  if (m.repeatRatePct !== null) {
    if (m.repeatRatePct < t.criticalRepeatRatePct) {
      findings.push(
        risk({
          code: "SALES_WEAK_REPEAT",
          title: "Customers are not coming back",
          summary:
            "Repeat purchase has nearly stopped; the business is running on one-time buyers, which is expensive and fragile.",
          sourceMetric: "repeatRatePct",
          sourceValue: m.repeatRatePct,
          threshold: t.criticalRepeatRatePct,
          severity: "critical",
          confidence: conf,
          impactScore: 80,
          evidence: [`repeatRatePct = ${pct(m.repeatRatePct)} < ${pct(t.criticalRepeatRatePct)}`],
          verificationMetric: "repeatRatePct",
        })
      );
    } else if (m.repeatRatePct < t.weakRepeatRatePct) {
      findings.push(
        risk({
          code: "SALES_WEAK_REPEAT",
          title: "Repeat purchase rate is weak",
          summary:
            "Retention is below the healthy bar; improving repeat purchase is cheaper than acquiring new customers.",
          sourceMetric: "repeatRatePct",
          sourceValue: m.repeatRatePct,
          threshold: t.weakRepeatRatePct,
          severity: "high",
          confidence: conf,
          impactScore: 60,
          evidence: [`repeatRatePct = ${pct(m.repeatRatePct)} < ${pct(t.weakRepeatRatePct)}`],
          verificationMetric: "repeatRatePct",
        })
      );
    }
  }

  // Lost-customer leakage bands
  if (m.lostCustomerRatePct !== null) {
    if (m.lostCustomerRatePct > t.criticalLostCustomerRatePct) {
      findings.push(
        risk({
          code: "SALES_LOST_CUSTOMER_LEAKAGE",
          title: "Customers are churning fast",
          summary:
            "A large share of the customer base is being lost; without a win-back/retention push the base shrinks.",
          sourceMetric: "lostCustomerRatePct",
          sourceValue: m.lostCustomerRatePct,
          threshold: t.criticalLostCustomerRatePct,
          severity: "critical",
          confidence: conf,
          impactScore: 80,
          evidence: [
            `lostCustomerRatePct = ${pct(m.lostCustomerRatePct)} > ${pct(t.criticalLostCustomerRatePct)}`,
          ],
          verificationMetric: "lostCustomerRatePct",
        })
      );
    } else if (m.lostCustomerRatePct > t.highLostCustomerRatePct) {
      findings.push(
        risk({
          code: "SALES_LOST_CUSTOMER_LEAKAGE",
          title: "Customer churn is high",
          summary:
            "Customer losses are above the safe threshold; a retention/win-back action protects revenue.",
          sourceMetric: "lostCustomerRatePct",
          sourceValue: m.lostCustomerRatePct,
          threshold: t.highLostCustomerRatePct,
          severity: "high",
          confidence: conf,
          impactScore: 55,
          evidence: [
            `lostCustomerRatePct = ${pct(m.lostCustomerRatePct)} > ${pct(t.highLostCustomerRatePct)}`,
          ],
          verificationMetric: "lostCustomerRatePct",
        })
      );
    }
  }

  // High complaint-to-sale ratio
  if (m.complaintToSaleRatioPct !== null && m.complaintToSaleRatioPct > t.highComplaintToSalePct) {
    findings.push(
      risk({
        code: "SALES_HIGH_COMPLAINT_RATIO",
        title: "Complaints are high relative to orders",
        summary:
          "A high complaint-to-order ratio drags repeat purchase and word of mouth; fixing the top complaint protects future sales.",
        sourceMetric: "complaintToSaleRatioPct",
        sourceValue: m.complaintToSaleRatioPct,
        threshold: t.highComplaintToSalePct,
        severity: "medium",
        confidence: conf,
        impactScore: 45,
        evidence: [
          `complaintToSaleRatioPct = ${pct(m.complaintToSaleRatioPct)} > ${pct(t.highComplaintToSalePct)}`,
        ],
        verificationMetric: "complaintToSaleRatioPct",
      })
    );
  }

  // Discount overdependence
  if (m.discountDependencePct !== null && m.discountDependencePct > t.highDiscountDependencePct) {
    findings.push(
      risk({
        code: "SALES_DISCOUNT_DEPENDENCE",
        title: "Sales depend too much on discounts",
        summary:
          "A large share of revenue is given back as discounts; sales may be bought rather than earned, eroding margin.",
        sourceMetric: "discountDependencePct",
        sourceValue: m.discountDependencePct,
        threshold: t.highDiscountDependencePct,
        severity: "medium",
        confidence: conf,
        impactScore: 50,
        evidence: [
          `discountDependencePct = ${pct(m.discountDependencePct)} > ${pct(t.highDiscountDependencePct)}`,
        ],
        verificationMetric: "discountDependencePct",
      })
    );
  }

  // High refund rate
  if (m.refundRatePct !== null && m.refundRatePct > t.highRefundRatePct) {
    findings.push(
      risk({
        code: "SALES_HIGH_REFUND_RATE",
        title: "Refunds are eroding sales",
        summary:
          "Refunds are a notable share of revenue; reducing the root cause recovers sales and protects reputation.",
        sourceMetric: "refundRatePct",
        sourceValue: m.refundRatePct,
        threshold: t.highRefundRatePct,
        severity: "medium",
        confidence: conf,
        impactScore: 45,
        evidence: [`refundRatePct = ${pct(m.refundRatePct)} > ${pct(t.highRefundRatePct)}`],
        verificationMetric: "refundRatePct",
      })
    );
  }

  // Weak B2B pipeline (only when a pipeline is reported)
  if (m.b2bPipelineCoveragePct !== null && m.b2bPipelineCoveragePct < t.weakB2bPipelineCoveragePct) {
    findings.push(
      risk({
        code: "SALES_WEAK_B2B_PIPELINE",
        title: "B2B pipeline is thin",
        summary:
          "The B2B pipeline covers little of current revenue; without building it, future B2B sales stall.",
        sourceMetric: "b2bPipelineCoveragePct",
        sourceValue: m.b2bPipelineCoveragePct,
        threshold: t.weakB2bPipelineCoveragePct,
        severity: "medium",
        confidence: conf,
        impactScore: 45,
        evidence: [
          `b2bPipelineCoveragePct = ${pct(m.b2bPipelineCoveragePct)} < ${pct(t.weakB2bPipelineCoveragePct)}`,
        ],
        verificationMetric: "b2bPipelineCoveragePct",
      })
    );
  }

  return findings;
}
