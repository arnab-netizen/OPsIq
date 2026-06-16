import { EvidenceItem, DiagnosisType } from "@/domain/consulting-engine/types";
import { SynthesizedEvidence, EvidencePattern } from "./evidence-synthesis-engine";

export interface Hypothesis {
  id: string;
  rootCause: DiagnosisType;
  confidence: number; // 0-65
  supportingEvidenceCount: number;
  conflictingEvidenceCount: number;
  reasoning: string;
}

export class HypothesisGenerator {
  private readonly allDiagnosisTypes = [
    DiagnosisType.OPERATIONAL_BOTTLENECK,
    DiagnosisType.QUALITY_CONTROL_FAILURE,
    DiagnosisType.CUSTOMER_RETENTION_EROSION,
    DiagnosisType.BRAND_EROSION,
    DiagnosisType.DEMAND_FORECASTING_MISMATCH,
    DiagnosisType.UNIT_ECONOMICS_BREAKDOWN,
    DiagnosisType.GO_TO_MARKET_MISALIGNMENT,
    DiagnosisType.STRATEGIC_PRICING_ERROR,
    DiagnosisType.GOVERNANCE_COMPLIANCE_FAILURE,
    DiagnosisType.TRUST_QUALITY_CRISIS,
    DiagnosisType.CASH_RUNWAY_CRISIS,
  ];

  generateHypotheses(
    synthesizedEvidence: SynthesizedEvidence,
    allEvidence: EvidenceItem[]
  ): Hypothesis[] {
    const candidates: Hypothesis[] = [];

    // Score each possible diagnosis
    for (const diagnosisType of this.allDiagnosisTypes) {
      const hypothesis = this.scoreHypothesis(
        diagnosisType,
        synthesizedEvidence,
        allEvidence
      );

      // Only include plausible hypotheses
      if (this.isPlausible(hypothesis, allEvidence)) {
        candidates.push(hypothesis);
      }
    }

    // Sort by confidence descending, take top 3
    const top3 = candidates
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);

    // Ensure we have exactly 3 (pad with lower-confidence ones if needed)
    while (top3.length < 3 && candidates.length > top3.length) {
      const remaining = candidates.filter((c) => !top3.includes(c));
      if (remaining.length > 0) {
        top3.push(remaining[0]);
      } else {
        break;
      }
    }

    return top3.map((h, idx) => ({
      ...h,
      id: `hyp-${idx}`,
    }));
  }

  private scoreHypothesis(
    diagnosisType: DiagnosisType,
    synthesizedEvidence: SynthesizedEvidence,
    allEvidence: EvidenceItem[]
  ): Hypothesis {
    // Find patterns that match this diagnosis
    const matchingPatterns = synthesizedEvidence.patterns.filter((p) =>
      p.potentialRootCauses.includes(diagnosisType)
    );

    // Count supporting evidence
    const supportingIds = new Set<string>();
    matchingPatterns.forEach((p) => {
      p.supportingItems.forEach((id) => supportingIds.add(id));
    });

    // Check for contradictions
    const contradictions = this.findContradictions(
      diagnosisType,
      Array.from(supportingIds),
      allEvidence
    );

    // Calculate confidence (0-65 cap)
    const rawScore =
      (supportingIds.size * 2) / Math.max(allEvidence.length, 1);
    const scoreAfterContradictions = Math.max(0, rawScore - contradictions.length * 0.15);
    const confidence = Math.min(65, Math.round(scoreAfterContradictions * 65));

    return {
      id: "", // will be set later
      rootCause: diagnosisType,
      confidence: Math.max(10, confidence), // min 10
      supportingEvidenceCount: supportingIds.size,
      conflictingEvidenceCount: contradictions.length,
      reasoning: this.generateReasoning(
        diagnosisType,
        supportingIds.size,
        contradictions.length
      ),
    };
  }

  private isPlausible(hypothesis: Hypothesis, allEvidence: EvidenceItem[]): boolean {
    // Must have at least 1 supporting item (more lenient for now)
    if (hypothesis.supportingEvidenceCount < 1) return false;

    // Cannot have too many contradictions (max 5)
    if (hypothesis.conflictingEvidenceCount > 5) return false;

    // Must have some logic (confidence > 5)
    if (hypothesis.confidence <= 5) return false;

    return true;
  }

  private findContradictions(
    diagnosis: DiagnosisType,
    supportingIds: string[],
    allEvidence: EvidenceItem[]
  ): string[] {
    // For now, simple contradiction detection
    // A finding contradicts if it seems to point to a different root cause
    const contradictions: string[] = [];

    // Find evidence items that don't support this diagnosis
    const supportingSet = new Set(supportingIds);
    allEvidence.forEach((e) => {
      if (!supportingSet.has(e.id)) {
        // Check if this evidence strongly points to a different diagnosis
        const dimensionStr = e.dimension;
        const finding = e.finding.toLowerCase();

        // Simple heuristic: if finding mentions specific cost issues,
        // it doesn't support operational bottleneck
        if (
          diagnosis === DiagnosisType.OPERATIONAL_BOTTLENECK &&
          dimensionStr === "financial_health"
        ) {
          if (finding.includes("unit") && finding.includes("economics")) {
            contradictions.push(e.id);
          }
        }
      }
    });

    return contradictions;
  }

  private generateReasoning(
    diagnosis: DiagnosisType,
    supportingCount: number,
    contradictionCount: number
  ): string {
    const diagnosisLabel = diagnosis.replace(/_/g, " ");
    return `${diagnosisLabel}: ${supportingCount} supporting evidence items, ${contradictionCount} contradictions`;
  }
}
