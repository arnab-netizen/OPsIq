/**
 * Owner SOP & Execution Accountability (Module 7 Slice 2) — deterministic
 * OPPORTUNITY findings.
 *
 * Pure: maps Slice 1 execution metrics → `OwnerFinding[]` (findingType
 * "opportunity"). Opportunities are emitted ONLY when supporting inputs exist (a
 * real, computed metric). When the data isn't there, no opportunity is fabricated.
 */
import {
  clampScore,
  clampConfidence,
  type OwnerFinding,
  type OwnerSeverity,
} from "@/domain/owner-spine/contracts";
import type { SopSnapshotInput, SopDerivedMetrics } from "./types";
import type { SopThresholds } from "./thresholds";

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
    urgencyScore: clampScore(args.urgencyScore),
    findingType: "opportunity",
    evidence: args.evidence,
    missingData: [],
    verificationMetric: args.verificationMetric,
  };
}

const pct = (v: number) => `${v}%`;

export function buildSopOpportunityFindings(
  input: SopSnapshotInput,
  m: SopDerivedMetrics,
  t: SopThresholds
): OwnerFinding[] {
  const findings: OwnerFinding[] = [];
  const conf = clampConfidence(m.dataConfidenceScore / 100);
  void input;

  // Clear overdue backlog (only when there is overdue work)
  if (m.overdueRatePct !== null && m.overdueRatePct > 0) {
    findings.push(
      opportunity({
        code: "SOP_OPP_CLEAR_OVERDUE",
        title: "Clear the overdue backlog",
        summary:
          "Overdue actions are decisions already made but not executed; clearing them converts past intent into results without new analysis.",
        sourceMetric: "overdueRatePct",
        sourceValue: m.overdueRatePct,
        threshold: t.highOverdueRatePct,
        severity: m.overdueRatePct > t.highOverdueRatePct ? "medium" : "low",
        confidence: conf,
        impactScore: clampScore(m.overdueRatePct * 2),
        urgencyScore: 45,
        evidence: [`overdueRatePct = ${pct(m.overdueRatePct)}`],
        verificationMetric: "overdueRatePct",
      })
    );
  }

  // Convert repeated failures into SOPs (only when failures recur)
  if (m.repeatedFailureRatePct !== null && m.repeatedFailureRatePct > 0) {
    findings.push(
      opportunity({
        code: "SOP_OPP_CONVERT_TO_SOP",
        title: "Convert repeated failures into SOPs",
        summary:
          "Each recurring failure is a predictable, eliminable cost; documenting it as an SOP with a quality standard stops it permanently.",
        sourceMetric: "repeatedFailureRatePct",
        sourceValue: m.repeatedFailureRatePct,
        threshold: t.highRepeatedFailureRatePct,
        severity: m.repeatedFailureRatePct > t.highRepeatedFailureRatePct ? "medium" : "low",
        confidence: conf,
        impactScore: clampScore(m.repeatedFailureRatePct * 3),
        urgencyScore: 40,
        evidence: [`repeatedFailureRatePct = ${pct(m.repeatedFailureRatePct)}`],
        verificationMetric: "repeatedFailureRatePct",
      })
    );
  }

  // Close the SOP coverage gap (only when coverage is below 100)
  if (m.sopCoveragePct !== null && m.sopCoveragePct < 100) {
    findings.push(
      opportunity({
        code: "SOP_OPP_CLOSE_COVERAGE_GAP",
        title: "Document the next recurring process",
        summary:
          "Undocumented recurring processes are key-person risk; documenting the highest-frequency one makes execution repeatable and delegable.",
        sourceMetric: "sopCoveragePct",
        sourceValue: m.sopCoveragePct,
        threshold: t.lowSopCoveragePct,
        severity: m.sopCoveragePct < t.lowSopCoveragePct ? "medium" : "low",
        confidence: conf,
        impactScore: clampScore(100 - m.sopCoveragePct),
        urgencyScore: 35,
        evidence: [`sopCoveragePct = ${pct(m.sopCoveragePct)}`],
        verificationMetric: "sopCoveragePct",
      })
    );
  }

  // Raise verification discipline (only when verification is below 100)
  if (m.verificationRatePct !== null && m.verificationRatePct < 100) {
    findings.push(
      opportunity({
        code: "SOP_OPP_RAISE_VERIFICATION",
        title: "Verify more completed work",
        summary:
          "Unverified completions hide whether the work actually moved the metric; verifying more turns activity into proven outcomes.",
        sourceMetric: "verificationRatePct",
        sourceValue: m.verificationRatePct,
        threshold: t.lowVerificationRatePct,
        severity: m.verificationRatePct < t.lowVerificationRatePct ? "medium" : "low",
        confidence: conf,
        impactScore: clampScore((100 - m.verificationRatePct) / 2),
        urgencyScore: 30,
        evidence: [`verificationRatePct = ${pct(m.verificationRatePct)}`],
        verificationMetric: "verificationRatePct",
      })
    );
  }

  // Data quality improvement opportunity (confidence below 100)
  if (m.dataConfidenceScore < 100) {
    findings.push(
      opportunity({
        code: "SOP_OPP_DATA_QUALITY",
        title: "Improve data completeness for a sharper execution diagnosis",
        summary:
          "Some inputs are missing or stale; supplying them increases the confidence of every execution recommendation.",
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
