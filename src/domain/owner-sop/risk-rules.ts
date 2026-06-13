/**
 * Owner SOP & Execution Accountability (Module 7 Slice 2) — deterministic RISK
 * findings.
 *
 * Pure: maps Slice 1 execution metrics → `OwnerFinding[]` (findingType "risk")
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
import type { SopSnapshotInput, SopDerivedMetrics } from "./types";
import type { SopThresholds } from "./thresholds";
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
    domain: "sop",
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
 * Build all triggered execution risk findings for one snapshot. Metric-derived
 * findings carry the data-confidence as their confidence; data/currency findings
 * are themselves certain.
 */
export function buildSopRiskFindings(
  input: SopSnapshotInput,
  m: SopDerivedMetrics,
  t: SopThresholds
): OwnerFinding[] {
  const findings: OwnerFinding[] = [];
  const conf = clampConfidence(m.dataConfidenceScore / 100);

  // Invalid currency (certain)
  if (!isValidCurrency(input.currency)) {
    findings.push(
      risk({
        code: "SOP_INVALID_CURRENCY",
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
        code: "SOP_MISSING_CRITICAL_DATA",
        title: "Critical execution inputs are missing",
        summary:
          "Key inputs needed for a trustworthy execution diagnosis are missing; provide them to raise confidence.",
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

  // Low completion bands (follow-through failure — the core accountability risk)
  if (m.completionRatePct !== null) {
    if (m.completionRatePct < t.criticalCompletionRatePct) {
      findings.push(
        risk({
          code: "SOP_LOW_COMPLETION",
          title: "Assigned work is not getting done",
          summary:
            "A large share of assigned actions is not completed; execution is breaking down and decisions are not turning into results.",
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
          code: "SOP_LOW_COMPLETION",
          title: "Completion rate is below target",
          summary:
            "Not enough assigned actions are completed; tighten assignment, due dates, and follow-up to recover follow-through.",
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

  // Low verification bands ("done" without proof it worked)
  if (m.verificationRatePct !== null) {
    if (m.verificationRatePct < t.criticalVerificationRatePct) {
      findings.push(
        risk({
          code: "SOP_LOW_VERIFICATION",
          title: "Completed work is not being verified",
          summary:
            "Most completed actions are marked done without confirmation they worked; you cannot trust the completion numbers.",
          sourceMetric: "verificationRatePct",
          sourceValue: m.verificationRatePct,
          threshold: t.criticalVerificationRatePct,
          severity: "high",
          confidence: conf,
          impactScore: 60,
          evidence: [`verificationRatePct = ${pct(m.verificationRatePct)} < ${pct(t.criticalVerificationRatePct)}`],
          verificationMetric: "verificationRatePct",
        })
      );
    } else if (m.verificationRatePct < t.lowVerificationRatePct) {
      findings.push(
        risk({
          code: "SOP_LOW_VERIFICATION",
          title: "Verification rate is below target",
          summary:
            "Too many completed actions go unverified; require proof of outcome on the highest-impact actions.",
          sourceMetric: "verificationRatePct",
          sourceValue: m.verificationRatePct,
          threshold: t.lowVerificationRatePct,
          severity: "medium",
          confidence: conf,
          impactScore: 45,
          evidence: [`verificationRatePct = ${pct(m.verificationRatePct)} < ${pct(t.lowVerificationRatePct)}`],
          verificationMetric: "verificationRatePct",
        })
      );
    }
  }

  // Overdue bands (work piling up past its due date)
  if (m.overdueRatePct !== null) {
    if (m.overdueRatePct > t.criticalOverdueRatePct) {
      findings.push(
        risk({
          code: "SOP_HIGH_OVERDUE",
          title: "A large share of work is overdue",
          summary:
            "Too many actions have blown their due dates; the backlog is compounding and the owner is the bottleneck or accountability is absent.",
          sourceMetric: "overdueRatePct",
          sourceValue: m.overdueRatePct,
          threshold: t.criticalOverdueRatePct,
          severity: "critical",
          confidence: conf,
          impactScore: 70,
          evidence: [`overdueRatePct = ${pct(m.overdueRatePct)} > ${pct(t.criticalOverdueRatePct)}`],
          verificationMetric: "overdueRatePct",
        })
      );
    } else if (m.overdueRatePct > t.highOverdueRatePct) {
      findings.push(
        risk({
          code: "SOP_HIGH_OVERDUE",
          title: "Overdue actions are above target",
          summary: "Due dates are slipping; reassign or unblock the overdue actions before the backlog grows.",
          sourceMetric: "overdueRatePct",
          sourceValue: m.overdueRatePct,
          threshold: t.highOverdueRatePct,
          severity: "high",
          confidence: conf,
          impactScore: 50,
          evidence: [`overdueRatePct = ${pct(m.overdueRatePct)} > ${pct(t.highOverdueRatePct)}`],
          verificationMetric: "overdueRatePct",
        })
      );
    }
  }

  // Repeated failure bands (same thing failing again — a missing SOP signal)
  if (m.repeatedFailureRatePct !== null) {
    if (m.repeatedFailureRatePct > t.criticalRepeatedFailureRatePct) {
      findings.push(
        risk({
          code: "SOP_REPEATED_FAILURES",
          title: "The same actions keep failing",
          summary:
            "A large share of actions failed again after a prior attempt; this is a systemic process gap, not a one-off — it needs an SOP, not another reminder.",
          sourceMetric: "repeatedFailureRatePct",
          sourceValue: m.repeatedFailureRatePct,
          threshold: t.criticalRepeatedFailureRatePct,
          severity: "critical",
          confidence: conf,
          impactScore: 70,
          evidence: [`repeatedFailureRatePct = ${pct(m.repeatedFailureRatePct)} > ${pct(t.criticalRepeatedFailureRatePct)}`],
          verificationMetric: "repeatedFailureRatePct",
        })
      );
    } else if (m.repeatedFailureRatePct > t.highRepeatedFailureRatePct) {
      findings.push(
        risk({
          code: "SOP_REPEATED_FAILURES",
          title: "Repeated failures are above target",
          summary:
            "Some actions are failing more than once; convert the recurring failure into a documented SOP with a quality standard.",
          sourceMetric: "repeatedFailureRatePct",
          sourceValue: m.repeatedFailureRatePct,
          threshold: t.highRepeatedFailureRatePct,
          severity: "high",
          confidence: conf,
          impactScore: 50,
          evidence: [`repeatedFailureRatePct = ${pct(m.repeatedFailureRatePct)} > ${pct(t.highRepeatedFailureRatePct)}`],
          verificationMetric: "repeatedFailureRatePct",
        })
      );
    }
  }

  // High dispute (completion is contested — accountability ambiguity)
  if (m.disputeRatePct !== null && m.disputeRatePct > t.highDisputeRatePct) {
    findings.push(
      risk({
        code: "SOP_HIGH_DISPUTE",
        title: "Completions are frequently disputed",
        summary:
          "Too many 'completed' actions are contested; the quality standard or definition of done is unclear — tighten the acceptance criteria.",
        sourceMetric: "disputeRatePct",
        sourceValue: m.disputeRatePct,
        threshold: t.highDisputeRatePct,
        severity: "medium",
        confidence: conf,
        impactScore: 45,
        evidence: [`disputeRatePct = ${pct(m.disputeRatePct)} > ${pct(t.highDisputeRatePct)}`],
        verificationMetric: "disputeRatePct",
      })
    );
  }

  // High reassignment (work bouncing between people — ownership weakness)
  if (m.reassignmentRatePct !== null && m.reassignmentRatePct > t.highReassignmentRatePct) {
    findings.push(
      risk({
        code: "SOP_HIGH_REASSIGNMENT",
        title: "Actions are being reassigned too often",
        summary:
          "Work bounces between people before it gets done; unclear ownership wastes time — fix role responsibility on the recurring offenders.",
        sourceMetric: "reassignmentRatePct",
        sourceValue: m.reassignmentRatePct,
        threshold: t.highReassignmentRatePct,
        severity: "medium",
        confidence: conf,
        impactScore: 40,
        evidence: [`reassignmentRatePct = ${pct(m.reassignmentRatePct)} > ${pct(t.highReassignmentRatePct)}`],
        verificationMetric: "reassignmentRatePct",
      })
    );
  }

  // Low proof compliance (required proof not provided)
  if (m.proofCompliancePct !== null && m.proofCompliancePct < t.lowProofCompliancePct) {
    findings.push(
      risk({
        code: "SOP_LOW_PROOF_COMPLIANCE",
        title: "Required proof is often missing",
        summary:
          "Actions that require proof of completion are being closed without it; without proof you cannot tell real execution from claimed execution.",
        sourceMetric: "proofCompliancePct",
        sourceValue: m.proofCompliancePct,
        threshold: t.lowProofCompliancePct,
        severity: "medium",
        confidence: conf,
        impactScore: 45,
        evidence: [`proofCompliancePct = ${pct(m.proofCompliancePct)} < ${pct(t.lowProofCompliancePct)}`],
        verificationMetric: "proofCompliancePct",
      })
    );
  }

  // SOP coverage gaps (recurring processes with no documented SOP)
  if (m.sopCoveragePct !== null) {
    if (m.sopCoveragePct < t.criticalSopCoveragePct) {
      findings.push(
        risk({
          code: "SOP_LOW_COVERAGE",
          title: "Most recurring processes have no SOP",
          summary:
            "The business runs on memory, not documented process; execution quality depends on specific people and collapses when they are absent.",
          sourceMetric: "sopCoveragePct",
          sourceValue: m.sopCoveragePct,
          threshold: t.criticalSopCoveragePct,
          severity: "high",
          confidence: conf,
          impactScore: 60,
          evidence: [`sopCoveragePct = ${pct(m.sopCoveragePct)} < ${pct(t.criticalSopCoveragePct)}`],
          verificationMetric: "sopCoveragePct",
        })
      );
    } else if (m.sopCoveragePct < t.lowSopCoveragePct) {
      findings.push(
        risk({
          code: "SOP_LOW_COVERAGE",
          title: "SOP coverage is below target",
          summary: "Several recurring processes lack a documented SOP; document the highest-frequency one first.",
          sourceMetric: "sopCoveragePct",
          sourceValue: m.sopCoveragePct,
          threshold: t.lowSopCoveragePct,
          severity: "medium",
          confidence: conf,
          impactScore: 40,
          evidence: [`sopCoveragePct = ${pct(m.sopCoveragePct)} < ${pct(t.lowSopCoveragePct)}`],
          verificationMetric: "sopCoveragePct",
        })
      );
    }
  }

  return findings;
}
