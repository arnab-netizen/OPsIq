/**
 * Owner Cashflow (Module 5 Slice 2) — deterministic OPPORTUNITY findings.
 *
 * Pure: maps Slice 1 cashflow metrics → `OwnerFinding[]` (findingType
 * "opportunity"). Opportunities are emitted ONLY when supporting inputs exist (a
 * real, computed metric). When the data isn't there, no opportunity is
 * fabricated. "Under pressure" opportunities require an actual liquidity signal.
 */
import {
  clampScore,
  clampConfidence,
  type OwnerFinding,
  type OwnerSeverity,
} from "@/domain/owner-spine/contracts";
import type { CashflowSnapshotInput, CashflowDerivedMetrics } from "./types";
import type { CashflowThresholds } from "./thresholds";

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
    urgencyScore: clampScore(args.urgencyScore),
    findingType: "opportunity",
    evidence: args.evidence,
    missingData: [],
    verificationMetric: args.verificationMetric,
  };
}

const pct = (v: number) => `${v}%`;

export function buildCashflowOpportunityFindings(
  input: CashflowSnapshotInput,
  m: CashflowDerivedMetrics,
  t: CashflowThresholds
): OwnerFinding[] {
  const findings: OwnerFinding[] = [];
  const conf = clampConfidence(m.dataConfidenceScore / 100);
  void input;

  // Collect overdue receivables → free cash (only if overdue receivables exist)
  if (m.overdueReceivablesPct !== null && m.overdueReceivablesPct > 0) {
    findings.push(
      opportunity({
        code: "CF_OPP_COLLECT_OVERDUE",
        title: "Collect overdue receivables to free cash",
        summary:
          "Past-due receivables are cash already earned; a focused collection push converts them to liquidity quickly.",
        sourceMetric: "overdueReceivablesPct",
        sourceValue: m.overdueReceivablesPct,
        threshold: t.highOverdueReceivablesPct,
        severity: m.overdueReceivablesPct > t.highOverdueReceivablesPct ? "medium" : "low",
        confidence: conf,
        impactScore: clampScore(m.overdueReceivablesPct),
        urgencyScore: 50,
        evidence: [`overdueReceivablesPct = ${pct(m.overdueReceivablesPct)}`],
        verificationMetric: "overdueReceivablesPct",
      })
    );
  }

  // Defer / negotiate payables (only when payables exist)
  if (m.payablesPressurePct !== null && m.payablesPressurePct > 0) {
    findings.push(
      opportunity({
        code: "CF_OPP_DEFER_PAYABLES",
        title: "Negotiate or stagger non-critical payables",
        summary:
          "Phasing or renegotiating non-critical payables spreads outflow and protects near-term liquidity.",
        sourceMetric: "payablesPressurePct",
        sourceValue: m.payablesPressurePct,
        threshold: t.highPayablesPressurePct,
        severity: m.payablesPressurePct > t.highPayablesPressurePct ? "medium" : "low",
        confidence: conf,
        impactScore: clampScore(m.payablesPressurePct / 2),
        urgencyScore: 35,
        evidence: [`payablesPressurePct = ${pct(m.payablesPressurePct)}`],
        verificationMetric: "payablesPressurePct",
      })
    );
  }

  // Reduce owner withdrawal — only under actual liquidity pressure
  if (
    m.ownerWithdrawalPressurePct !== null &&
    m.ownerWithdrawalPressurePct > 0 &&
    m.cashflowDangerScore > 0
  ) {
    findings.push(
      opportunity({
        code: "CF_OPP_REDUCE_OWNER_WITHDRAWAL",
        title: "Trim owner withdrawal while cash is tight",
        summary:
          "Deferring part of the owner draw this period directly preserves cash until liquidity recovers.",
        sourceMetric: "ownerWithdrawalPressurePct",
        sourceValue: m.ownerWithdrawalPressurePct,
        threshold: t.highOwnerWithdrawalPressurePct,
        severity:
          m.ownerWithdrawalPressurePct > t.highOwnerWithdrawalPressurePct ? "medium" : "low",
        confidence: conf,
        impactScore: clampScore(m.ownerWithdrawalPressurePct),
        urgencyScore: 40,
        evidence: [
          `ownerWithdrawalPressurePct = ${pct(m.ownerWithdrawalPressurePct)}`,
          `cashflowDangerScore = ${m.cashflowDangerScore}`,
        ],
        verificationMetric: "ownerWithdrawalPressurePct",
      })
    );
  }

  // Data quality improvement opportunity (confidence below 100)
  if (m.dataConfidenceScore < 100) {
    findings.push(
      opportunity({
        code: "CF_OPP_DATA_QUALITY",
        title: "Improve data completeness for a sharper cash diagnosis",
        summary:
          "Some inputs are missing or stale; supplying them increases the confidence of every cash recommendation.",
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
