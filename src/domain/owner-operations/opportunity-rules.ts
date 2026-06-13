/**
 * Owner Operations (Module 4 Slice 2) — deterministic OPPORTUNITY findings.
 *
 * Pure: maps Slice 1 operations metrics → `OwnerFinding[]` (findingType
 * "opportunity"). Opportunities are emitted ONLY when supporting inputs exist (a
 * real, computed metric). When the data isn't there, no opportunity is fabricated.
 */
import {
  clampScore,
  clampConfidence,
  type OwnerFinding,
  type OwnerSeverity,
} from "@/domain/owner-spine/contracts";
import type { OperationsSnapshotInput, OperationsDerivedMetrics } from "./types";
import type { OperationsThresholds } from "./thresholds";

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
    domain: "operations",
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

export function buildOperationsOpportunityFindings(
  input: OperationsSnapshotInput,
  m: OperationsDerivedMetrics,
  t: OperationsThresholds
): OwnerFinding[] {
  const findings: OwnerFinding[] = [];
  const conf = clampConfidence(m.dataConfidenceScore / 100);
  void input;

  // Recover delayed throughput (only when there are delays)
  if (m.delayRatePct !== null && m.delayRatePct > 0) {
    findings.push(
      opportunity({
        code: "OPS_OPP_RECOVER_DELAYS",
        title: "Recover delayed throughput",
        summary:
          "Late orders are completable revenue stuck in the pipeline; clearing the slow stage pulls them through.",
        sourceMetric: "delayRatePct",
        sourceValue: m.delayRatePct,
        threshold: t.highDelayRatePct,
        severity: m.delayRatePct > t.highDelayRatePct ? "medium" : "low",
        confidence: conf,
        impactScore: clampScore(m.delayRatePct * 2),
        urgencyScore: 45,
        evidence: [`delayRatePct = ${pct(m.delayRatePct)}`],
        verificationMetric: "delayRatePct",
      })
    );
  }

  // Cut rework (only when there is rework)
  if (m.reworkRatePct !== null && m.reworkRatePct > 0) {
    findings.push(
      opportunity({
        code: "OPS_OPP_CUT_REWORK",
        title: "Cut rework to free capacity",
        summary:
          "Rework consumes capacity twice; fixing the top defect returns that capacity to first-pass output.",
        sourceMetric: "reworkRatePct",
        sourceValue: m.reworkRatePct,
        threshold: t.highReworkRatePct,
        severity: m.reworkRatePct > t.highReworkRatePct ? "medium" : "low",
        confidence: conf,
        impactScore: clampScore(m.reworkRatePct * 3),
        urgencyScore: 40,
        evidence: [`reworkRatePct = ${pct(m.reworkRatePct)}`],
        verificationMetric: "reworkRatePct",
      })
    );
  }

  // Reclaim idle capacity (only when there is idle)
  if (m.idleRatePct !== null && m.idleRatePct > 0) {
    findings.push(
      opportunity({
        code: "OPS_OPP_RECLAIM_IDLE",
        title: "Reclaim idle staff capacity",
        summary:
          "Idle paid hours are recoverable output; aligning schedules to demand lifts orders per staff hour.",
        sourceMetric: "idleRatePct",
        sourceValue: m.idleRatePct,
        threshold: t.highIdleRatePct,
        severity: m.idleRatePct > t.highIdleRatePct ? "medium" : "low",
        confidence: conf,
        impactScore: clampScore(m.idleRatePct),
        urgencyScore: 35,
        evidence: [`idleRatePct = ${pct(m.idleRatePct)}`],
        verificationMetric: "idleRatePct",
      })
    );
  }

  // Close the SOP gap (only when compliance is below 100)
  if (m.sopCompliancePct !== null && m.sopCompliancePct < 100) {
    findings.push(
      opportunity({
        code: "OPS_OPP_CLOSE_SOP_GAP",
        title: "Close the SOP compliance gap",
        summary:
          "Each missed SOP step is a predictable defect/delay source; raising adherence stabilises quality and turnaround.",
        sourceMetric: "sopCompliancePct",
        sourceValue: m.sopCompliancePct,
        threshold: t.lowSopCompliancePct,
        severity: m.sopCompliancePct < t.lowSopCompliancePct ? "medium" : "low",
        confidence: conf,
        impactScore: clampScore(100 - m.sopCompliancePct),
        urgencyScore: 35,
        evidence: [`sopCompliancePct = ${pct(m.sopCompliancePct)}`],
        verificationMetric: "sopCompliancePct",
      })
    );
  }

  // Use spare capacity headroom (only when below the strain bar)
  if (m.capacityUtilizationPct !== null && m.capacityUtilizationPct < t.highCapacityUtilizationPct) {
    findings.push(
      opportunity({
        code: "OPS_OPP_USE_CAPACITY_HEADROOM",
        title: "Use spare capacity to take more orders",
        summary:
          "There is room below the capacity ceiling; this headroom can absorb more demand without new equipment.",
        sourceMetric: "capacityUtilizationPct",
        sourceValue: m.capacityUtilizationPct,
        threshold: t.highCapacityUtilizationPct,
        severity: "low",
        confidence: conf,
        impactScore: clampScore((t.highCapacityUtilizationPct - m.capacityUtilizationPct) / 2),
        urgencyScore: 25,
        evidence: [
          `capacityUtilizationPct = ${pct(m.capacityUtilizationPct)} < ${pct(t.highCapacityUtilizationPct)}`,
        ],
        verificationMetric: "capacityUtilizationPct",
      })
    );
  }

  // Data quality improvement opportunity (confidence below 100)
  if (m.dataConfidenceScore < 100) {
    findings.push(
      opportunity({
        code: "OPS_OPP_DATA_QUALITY",
        title: "Improve data completeness for a sharper operations diagnosis",
        summary:
          "Some inputs are missing or stale; supplying them increases the confidence of every operations recommendation.",
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
