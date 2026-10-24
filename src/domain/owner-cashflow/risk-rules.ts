/**
 * Owner Cashflow (Module 5 Slice 2) — deterministic RISK findings.
 *
 * Pure: maps Slice 1 cashflow metrics → `OwnerFinding[]` (findingType "risk")
 * using the Owner Intelligence Spine contract. A rule emits ONLY when its metric
 * is computable and crosses its threshold (or, for data findings, when data is
 * missing/invalid). Nothing is invented: `sourceValue` is set only from a real
 * metric; missing inputs surface as `missingData` + a missing-data finding.
 */
import {
  clampScore,
  clampConfidence,
  type OwnerFinding,
  type OwnerSeverity,
} from "@/domain/owner-spine/contracts";
import type { CashflowSnapshotInput, CashflowDerivedMetrics } from "./types";
import type { CashflowThresholds } from "./thresholds";
import { isValidCurrency, criticalRequirementCount, CASH_POSITION_FIELD_LABEL } from "./data-confidence";
import { num } from "./metrics";

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
    domain: "cashflow",
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
 * Build all triggered cashflow risk findings for one snapshot. Metric-derived
 * findings carry the data-confidence as their confidence (so missing data lowers
 * trust); data/currency findings are themselves certain.
 */
export function buildCashflowRiskFindings(
  input: CashflowSnapshotInput,
  m: CashflowDerivedMetrics,
  t: CashflowThresholds
): OwnerFinding[] {
  const findings: OwnerFinding[] = [];
  const conf = clampConfidence(m.dataConfidenceScore / 100);

  // Invalid currency (certain)
  if (!isValidCurrency(input.currency)) {
    findings.push(
      risk({
        code: "CF_INVALID_CURRENCY",
        title: "Reporting currency is invalid",
        summary:
          "The snapshot currency is missing or not a valid 3–8 letter code; cash outputs cannot be trusted until fixed.",
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
    const severity: OwnerSeverity = criticalRequirementCount(m.missingRequiredInputs) >= 2 ? "high" : "medium";
    // The cash position is established only from BOTH components: name the unknown one(s), never imply zero cash.
    const cashGap = m.missingRequiredInputs.filter((k) => k in CASH_POSITION_FIELD_LABEL).map((k) => CASH_POSITION_FIELD_LABEL[k]);
    findings.push(
      risk({
        code: "CF_MISSING_CRITICAL_DATA",
        title: "Critical cashflow inputs are missing",
        summary:
          "Key inputs needed for a trustworthy liquidity diagnosis are missing; provide them to raise confidence.",
        sourceMetric: "dataConfidenceScore",
        sourceValue: m.dataConfidenceScore,
        severity,
        confidence: 1,
        impactScore: 40,
        evidence: [
          `missing: ${m.missingRequiredInputs.join(", ")}`,
          ...(cashGap.length > 0 ? [`total cash is not established: ${cashGap.join(" and ")} not recorded (enter 0 if you hold none)`] : []),
          `dataConfidenceScore = ${m.dataConfidenceScore}`,
        ],
        missingData: m.missingRequiredInputs,
        verificationMetric: "dataConfidenceScore",
      })
    );
  }

  // Cash runway bands (only when burning → runway computable)
  if (m.cashRunwayDays !== null) {
    if (m.cashRunwayDays < t.insolventCashRunwayDays) {
      findings.push(
        risk({
          code: "CF_INSOLVENT_RUNWAY",
          title: "Cash runs out within days",
          summary:
            "At the current net burn, cash is nearly exhausted; an immediate cash action is required to avoid missed payments.",
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
          code: "CF_LOW_RUNWAY",
          title: "Cash runway is critically low",
          summary:
            "Cash covers only a short window at the current net burn; reduce outflow or accelerate collections now.",
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
          code: "CF_LOW_RUNWAY",
          title: "Cash runway is getting short",
          summary:
            "Cash buffer is below the safe threshold at the current net burn; tighten outflow and improve collections.",
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

  // Urgent payment risk: near-term dues (salary/rent/vendor/tax/emi) vs cash
  if (m.urgentPaymentRiskPct !== null) {
    if (m.urgentPaymentRiskPct >= t.criticalUrgentPaymentRiskPct) {
      findings.push(
        risk({
          code: "CF_URGENT_PAYMENT_RISK",
          title: "Near-term dues exceed available cash",
          summary:
            "Salary, rent, vendor and other near-term obligations are larger than total cash; some payments cannot be met without new cash.",
          sourceMetric: "urgentPaymentRiskPct",
          sourceValue: m.urgentPaymentRiskPct,
          threshold: t.criticalUrgentPaymentRiskPct,
          severity: "critical",
          confidence: conf,
          impactScore: 95,
          urgencyScore: 100,
          evidence: [
            `urgentPaymentRiskPct = ${pct(m.urgentPaymentRiskPct)} ≥ ${pct(t.criticalUrgentPaymentRiskPct)}`,
            m.nearTermObligations !== null && m.totalCash !== null
              ? `nearTermObligations = ${m.nearTermObligations} vs totalCash = ${m.totalCash}`
              : "",
          ].filter(Boolean),
          verificationMetric: "urgentPaymentRiskPct",
        })
      );
    } else if (m.urgentPaymentRiskPct > t.highUrgentPaymentRiskPct) {
      findings.push(
        risk({
          code: "CF_URGENT_PAYMENT_RISK",
          title: "Near-term dues are a high share of cash",
          summary:
            "Salary, rent and other near-term obligations consume most of available cash, leaving little buffer for shocks.",
          sourceMetric: "urgentPaymentRiskPct",
          sourceValue: m.urgentPaymentRiskPct,
          threshold: t.highUrgentPaymentRiskPct,
          severity: "high",
          confidence: conf,
          impactScore: 70,
          evidence: [
            `urgentPaymentRiskPct = ${pct(m.urgentPaymentRiskPct)} > ${pct(t.highUrgentPaymentRiskPct)}`,
          ],
          verificationMetric: "urgentPaymentRiskPct",
        })
      );
    }
  }

  // Vendor cutoff risk: payables vs cash
  if (m.payablesPressurePct !== null) {
    if (m.payablesPressurePct >= t.criticalPayablesPressurePct) {
      findings.push(
        risk({
          code: "CF_VENDOR_CUTOFF_RISK",
          title: "Payables exceed available cash",
          summary:
            "Money owed to vendors is larger than total cash; vendor cutoff or supply disruption is likely without negotiation.",
          sourceMetric: "payablesPressurePct",
          sourceValue: m.payablesPressurePct,
          threshold: t.criticalPayablesPressurePct,
          severity: "high",
          confidence: conf,
          impactScore: 75,
          evidence: [
            `payablesPressurePct = ${pct(m.payablesPressurePct)} ≥ ${pct(t.criticalPayablesPressurePct)}`,
          ],
          verificationMetric: "payablesPressurePct",
        })
      );
    } else if (m.payablesPressurePct > t.highPayablesPressurePct) {
      findings.push(
        risk({
          code: "CF_VENDOR_CUTOFF_RISK",
          title: "Payables are high relative to cash",
          summary:
            "Outstanding payables consume a large share of cash; vendor-cutoff and liquidity risk are elevated.",
          sourceMetric: "payablesPressurePct",
          sourceValue: m.payablesPressurePct,
          threshold: t.highPayablesPressurePct,
          severity: "medium",
          confidence: conf,
          impactScore: 50,
          evidence: [
            `payablesPressurePct = ${pct(m.payablesPressurePct)} > ${pct(t.highPayablesPressurePct)}`,
          ],
          verificationMetric: "payablesPressurePct",
        })
      );
    }
  }

  // Debt / EMI default risk: this period's EMI vs cash
  const emi = num(input.upcomingEmi);
  if (emi !== null && emi > 0 && m.totalCash !== null && m.totalCash > 0) {
    const emiPressurePct = Math.round((emi / m.totalCash) * 1000) / 10;
    if (emiPressurePct > t.highDebtPaymentPressurePct) {
      const severity: OwnerSeverity = emiPressurePct >= 100 ? "critical" : "high";
      findings.push(
        risk({
          code: "CF_DEBT_DEFAULT_RISK",
          title: "Loan/EMI payment is a high share of cash",
          summary:
            "This period's loan/EMI payment consumes a large share of available cash; missing it risks default and penalties.",
          sourceMetric: "debtPaymentPressurePct",
          sourceValue: emiPressurePct,
          threshold: t.highDebtPaymentPressurePct,
          severity,
          confidence: conf,
          impactScore: severity === "critical" ? 85 : 60,
          evidence: [
            `upcomingEmi = ${emi} vs totalCash = ${m.totalCash} (${pct(emiPressurePct)} of cash)`,
          ],
          verificationMetric: "debtPaymentPressurePct",
        })
      );
    }
  }

  // High overdue receivables
  if (m.overdueReceivablesPct !== null && m.overdueReceivablesPct > t.highOverdueReceivablesPct) {
    findings.push(
      risk({
        code: "CF_HIGH_OVERDUE_RECEIVABLES",
        title: "Too much receivable money is overdue",
        summary:
          "A large share of receivables is past due; this is cash already earned but stuck, straining liquidity.",
        sourceMetric: "overdueReceivablesPct",
        sourceValue: m.overdueReceivablesPct,
        threshold: t.highOverdueReceivablesPct,
        severity: "medium",
        confidence: conf,
        impactScore: 50,
        evidence: [
          `overdueReceivablesPct = ${pct(m.overdueReceivablesPct)} > ${pct(t.highOverdueReceivablesPct)}`,
        ],
        verificationMetric: "overdueReceivablesPct",
      })
    );
  }

  // Slow collections (days of sales outstanding)
  if (m.collectionGapDays !== null && m.collectionGapDays > t.highCollectionGapDays) {
    findings.push(
      risk({
        code: "CF_SLOW_COLLECTIONS",
        title: "Collections are too slow",
        summary:
          "Receivables take a long time to convert to cash at the current collection rate; tighten terms and follow-up.",
        sourceMetric: "collectionGapDays",
        sourceValue: m.collectionGapDays,
        threshold: t.highCollectionGapDays,
        severity: "medium",
        confidence: conf,
        impactScore: 40,
        evidence: [
          `collectionGapDays = ${m.collectionGapDays} > ${t.highCollectionGapDays}`,
        ],
        verificationMetric: "collectionGapDays",
      })
    );
  }

  // Owner withdrawal pressure
  if (
    m.ownerWithdrawalPressurePct !== null &&
    m.ownerWithdrawalPressurePct > t.highOwnerWithdrawalPressurePct
  ) {
    findings.push(
      risk({
        code: "CF_OWNER_WITHDRAWAL_PRESSURE",
        title: "Owner withdrawal is a high share of cash",
        summary:
          "Planned owner draw consumes a large share of available cash; deferring part of it preserves liquidity.",
        sourceMetric: "ownerWithdrawalPressurePct",
        sourceValue: m.ownerWithdrawalPressurePct,
        threshold: t.highOwnerWithdrawalPressurePct,
        severity: "medium",
        confidence: conf,
        impactScore: 45,
        evidence: [
          `ownerWithdrawalPressurePct = ${pct(m.ownerWithdrawalPressurePct)} > ${pct(t.highOwnerWithdrawalPressurePct)}`,
        ],
        verificationMetric: "ownerWithdrawalPressurePct",
      })
    );
  }

  return findings;
}
