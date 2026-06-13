/**
 * Owner Operations (Module 4 Slice 2) — deterministic RISK findings.
 *
 * Pure: maps Slice 1 operations metrics → `OwnerFinding[]` (findingType "risk")
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
import type { OperationsSnapshotInput, OperationsDerivedMetrics } from "./types";
import type { OperationsThresholds } from "./thresholds";
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
    urgencyScore: clampScore(args.urgencyScore ?? SEVERITY_URGENCY[args.severity]),
    findingType: "risk",
    evidence: args.evidence,
    missingData: args.missingData ?? [],
    verificationMetric: args.verificationMetric,
  };
}

const pct = (v: number) => `${v}%`;

/**
 * Build all triggered operations risk findings for one snapshot. Metric-derived
 * findings carry the data-confidence as their confidence; data/currency findings
 * are themselves certain.
 */
export function buildOperationsRiskFindings(
  input: OperationsSnapshotInput,
  m: OperationsDerivedMetrics,
  t: OperationsThresholds
): OwnerFinding[] {
  const findings: OwnerFinding[] = [];
  const conf = clampConfidence(m.dataConfidenceScore / 100);

  // Invalid currency (certain)
  if (!isValidCurrency(input.currency)) {
    findings.push(
      risk({
        code: "OPS_INVALID_CURRENCY",
        title: "Reporting currency is invalid",
        summary:
          "The snapshot currency is missing or not a valid 3–8 letter code; fix it so monetary context is trustworthy.",
        sourceMetric: "currency",
        sourceValue: null,
        severity: "medium",
        confidence: 1,
        impactScore: 25,
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
        code: "OPS_MISSING_CRITICAL_DATA",
        title: "Critical operations inputs are missing",
        summary:
          "Key inputs needed for a trustworthy operations diagnosis are missing; provide them to raise confidence.",
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

  // Capacity bottleneck (equipment constraint)
  if (m.capacityUtilizationPct !== null) {
    if (m.capacityUtilizationPct > t.criticalCapacityUtilizationPct) {
      findings.push(
        risk({
          code: "OPS_CAPACITY_BOTTLENECK",
          title: "Demand exceeds capacity",
          summary:
            "Orders received are above what the equipment/process can handle; without adding capacity or shedding load, delays and quality failures compound.",
          sourceMetric: "capacityUtilizationPct",
          sourceValue: m.capacityUtilizationPct,
          threshold: t.criticalCapacityUtilizationPct,
          severity: "critical",
          confidence: conf,
          impactScore: 85,
          evidence: [
            `capacityUtilizationPct = ${pct(m.capacityUtilizationPct)} > ${pct(t.criticalCapacityUtilizationPct)}`,
          ],
          verificationMetric: "capacityUtilizationPct",
        })
      );
    } else if (m.capacityUtilizationPct > t.highCapacityUtilizationPct) {
      findings.push(
        risk({
          code: "OPS_CAPACITY_BOTTLENECK",
          title: "Capacity is nearly maxed out",
          summary:
            "Utilization is close to the ceiling, leaving no buffer for spikes; plan capacity before it becomes a hard bottleneck.",
          sourceMetric: "capacityUtilizationPct",
          sourceValue: m.capacityUtilizationPct,
          threshold: t.highCapacityUtilizationPct,
          severity: "high",
          confidence: conf,
          impactScore: 55,
          evidence: [
            `capacityUtilizationPct = ${pct(m.capacityUtilizationPct)} > ${pct(t.highCapacityUtilizationPct)}`,
          ],
          verificationMetric: "capacityUtilizationPct",
        })
      );
    }
  }

  // Low completion bands
  if (m.completionRatePct !== null) {
    if (m.completionRatePct < t.criticalCompletionRatePct) {
      findings.push(
        risk({
          code: "OPS_LOW_COMPLETION",
          title: "Orders are not getting completed",
          summary:
            "A large share of received orders is not completed in the period; throughput is failing and backlog is building.",
          sourceMetric: "completionRatePct",
          sourceValue: m.completionRatePct,
          threshold: t.criticalCompletionRatePct,
          severity: "critical",
          confidence: conf,
          impactScore: 80,
          evidence: [`completionRatePct = ${pct(m.completionRatePct)} < ${pct(t.criticalCompletionRatePct)}`],
          verificationMetric: "completionRatePct",
        })
      );
    } else if (m.completionRatePct < t.lowCompletionRatePct) {
      findings.push(
        risk({
          code: "OPS_LOW_COMPLETION",
          title: "Completion rate is below target",
          summary:
            "Not enough received orders are completed; tightening the workflow recovers throughput.",
          sourceMetric: "completionRatePct",
          sourceValue: m.completionRatePct,
          threshold: t.lowCompletionRatePct,
          severity: "high",
          confidence: conf,
          impactScore: 55,
          evidence: [`completionRatePct = ${pct(m.completionRatePct)} < ${pct(t.lowCompletionRatePct)}`],
          verificationMetric: "completionRatePct",
        })
      );
    }
  }

  // Delay bands
  if (m.delayRatePct !== null) {
    if (m.delayRatePct > t.criticalDelayRatePct) {
      findings.push(
        risk({
          code: "OPS_HIGH_DELAY",
          title: "Orders are badly delayed",
          summary:
            "A large share of orders is late; turnaround is broken, which hurts repeat purchase and reputation.",
          sourceMetric: "delayRatePct",
          sourceValue: m.delayRatePct,
          threshold: t.criticalDelayRatePct,
          severity: "critical",
          confidence: conf,
          impactScore: 75,
          evidence: [`delayRatePct = ${pct(m.delayRatePct)} > ${pct(t.criticalDelayRatePct)}`],
          verificationMetric: "delayRatePct",
        })
      );
    } else if (m.delayRatePct > t.highDelayRatePct) {
      findings.push(
        risk({
          code: "OPS_HIGH_DELAY",
          title: "Delays are above target",
          summary: "Too many orders run late; find and fix the slow stage to restore turnaround.",
          sourceMetric: "delayRatePct",
          sourceValue: m.delayRatePct,
          threshold: t.highDelayRatePct,
          severity: "high",
          confidence: conf,
          impactScore: 50,
          evidence: [`delayRatePct = ${pct(m.delayRatePct)} > ${pct(t.highDelayRatePct)}`],
          verificationMetric: "delayRatePct",
        })
      );
    }
  }

  // Rework bands
  if (m.reworkRatePct !== null) {
    if (m.reworkRatePct > t.criticalReworkRatePct) {
      findings.push(
        risk({
          code: "OPS_HIGH_REWORK",
          title: "Rework is out of control",
          summary:
            "A large share of completed work is redone; this is wasted capacity and margin — fix the root quality cause.",
          sourceMetric: "reworkRatePct",
          sourceValue: m.reworkRatePct,
          threshold: t.criticalReworkRatePct,
          severity: "critical",
          confidence: conf,
          impactScore: 70,
          evidence: [`reworkRatePct = ${pct(m.reworkRatePct)} > ${pct(t.criticalReworkRatePct)}`],
          verificationMetric: "reworkRatePct",
        })
      );
    } else if (m.reworkRatePct > t.highReworkRatePct) {
      findings.push(
        risk({
          code: "OPS_HIGH_REWORK",
          title: "Rework is high",
          summary: "Redone work wastes capacity and margin; reducing the top defect recovers both.",
          sourceMetric: "reworkRatePct",
          sourceValue: m.reworkRatePct,
          threshold: t.highReworkRatePct,
          severity: "medium",
          confidence: conf,
          impactScore: 45,
          evidence: [`reworkRatePct = ${pct(m.reworkRatePct)} > ${pct(t.highReworkRatePct)}`],
          verificationMetric: "reworkRatePct",
        })
      );
    }
  }

  // High complaint rate (quality leakage)
  if (m.complaintRatePct !== null && m.complaintRatePct > t.highComplaintRatePct) {
    findings.push(
      risk({
        code: "OPS_HIGH_COMPLAINT_RATE",
        title: "Complaints are high relative to orders",
        summary:
          "Quality complaints are above the safe bar; fixing the top complaint protects repeat purchase and reputation.",
        sourceMetric: "complaintRatePct",
        sourceValue: m.complaintRatePct,
        threshold: t.highComplaintRatePct,
        severity: "medium",
        confidence: conf,
        impactScore: 45,
        evidence: [`complaintRatePct = ${pct(m.complaintRatePct)} > ${pct(t.highComplaintRatePct)}`],
        verificationMetric: "complaintRatePct",
      })
    );
  }

  // Delivery bottleneck
  if (m.deliverySuccessRatePct !== null) {
    if (m.deliverySuccessRatePct < t.criticalDeliverySuccessRatePct) {
      findings.push(
        risk({
          code: "OPS_DELIVERY_FAILURE",
          title: "Deliveries are failing",
          summary:
            "A large share of deliveries fail; this loses completed work at the last step — fix routing/handoff/coverage.",
          sourceMetric: "deliverySuccessRatePct",
          sourceValue: m.deliverySuccessRatePct,
          threshold: t.criticalDeliverySuccessRatePct,
          severity: "critical",
          confidence: conf,
          impactScore: 70,
          evidence: [
            `deliverySuccessRatePct = ${pct(m.deliverySuccessRatePct)} < ${pct(t.criticalDeliverySuccessRatePct)}`,
          ],
          verificationMetric: "deliverySuccessRatePct",
        })
      );
    } else if (m.deliverySuccessRatePct < t.lowDeliverySuccessRatePct) {
      findings.push(
        risk({
          code: "OPS_DELIVERY_FAILURE",
          title: "Delivery success is below target",
          summary: "Delivery failures are above the safe bar; tighten the last-mile handoff.",
          sourceMetric: "deliverySuccessRatePct",
          sourceValue: m.deliverySuccessRatePct,
          threshold: t.lowDeliverySuccessRatePct,
          severity: "medium",
          confidence: conf,
          impactScore: 45,
          evidence: [
            `deliverySuccessRatePct = ${pct(m.deliverySuccessRatePct)} < ${pct(t.lowDeliverySuccessRatePct)}`,
          ],
          verificationMetric: "deliverySuccessRatePct",
        })
      );
    }
  }

  // SOP non-compliance
  if (m.sopCompliancePct !== null) {
    if (m.sopCompliancePct < t.criticalSopCompliancePct) {
      findings.push(
        risk({
          code: "OPS_SOP_NONCOMPLIANCE",
          title: "SOPs are largely not being followed",
          summary:
            "Process discipline has broken down; without SOP adherence, quality and turnaround are unpredictable.",
          sourceMetric: "sopCompliancePct",
          sourceValue: m.sopCompliancePct,
          threshold: t.criticalSopCompliancePct,
          severity: "high",
          confidence: conf,
          impactScore: 60,
          evidence: [`sopCompliancePct = ${pct(m.sopCompliancePct)} < ${pct(t.criticalSopCompliancePct)}`],
          verificationMetric: "sopCompliancePct",
        })
      );
    } else if (m.sopCompliancePct < t.lowSopCompliancePct) {
      findings.push(
        risk({
          code: "OPS_SOP_NONCOMPLIANCE",
          title: "SOP compliance is below target",
          summary: "Process steps are being skipped; reinforce the SOP on the weakest step.",
          sourceMetric: "sopCompliancePct",
          sourceValue: m.sopCompliancePct,
          threshold: t.lowSopCompliancePct,
          severity: "medium",
          confidence: conf,
          impactScore: 40,
          evidence: [`sopCompliancePct = ${pct(m.sopCompliancePct)} < ${pct(t.lowSopCompliancePct)}`],
          verificationMetric: "sopCompliancePct",
        })
      );
    }
  }

  // High idle (staff productivity)
  if (m.idleRatePct !== null && m.idleRatePct > t.highIdleRatePct) {
    findings.push(
      risk({
        code: "OPS_HIGH_IDLE",
        title: "Staff idle time is high",
        summary:
          "A large share of paid hours is idle; rebalancing schedules to demand recovers productivity and margin.",
        sourceMetric: "idleRatePct",
        sourceValue: m.idleRatePct,
        threshold: t.highIdleRatePct,
        severity: "medium",
        confidence: conf,
        impactScore: 40,
        evidence: [`idleRatePct = ${pct(m.idleRatePct)} > ${pct(t.highIdleRatePct)}`],
        verificationMetric: "idleRatePct",
      })
    );
  }

  // Inventory constraint
  if (m.inventoryShortageCount !== null && m.inventoryShortageCount > 0) {
    findings.push(
      risk({
        code: "OPS_INVENTORY_SHORTAGE",
        title: "Inventory shortages are constraining work",
        summary:
          "Stockouts are interrupting fulfilment; set reorder points on the items that ran out to stop the constraint.",
        sourceMetric: "inventoryShortageCount",
        sourceValue: m.inventoryShortageCount,
        threshold: 0,
        severity: "medium",
        confidence: conf,
        impactScore: 40,
        evidence: [`inventoryShortageCount = ${m.inventoryShortageCount}`],
        verificationMetric: "inventoryShortageCount",
      })
    );
  }

  return findings;
}
