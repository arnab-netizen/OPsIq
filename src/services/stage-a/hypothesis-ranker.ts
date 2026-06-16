import { EvidenceItem } from "@/domain/consulting-engine/types";
import { Hypothesis } from "./hypothesis-generator";

export interface RankedHypothesis extends Hypothesis {
  supportingScore: number; // 0-10
  conflictScore: number; // 0-10
  netScore: number; // support - conflict, -10 to +10
  confidenceJustification: string;
  specificity: number; // 0-10, based on pattern count and evidence diversity
}

export class HypothesisRanker {
  rankHypotheses(
    hypotheses: Hypothesis[],
    allEvidence: EvidenceItem[]
  ): RankedHypothesis[] {
    const ranked = hypotheses.map((h) =>
      this.rankHypothesis(h, allEvidence)
    );

    // Sort by confidence descending
    return ranked.sort((a, b) => b.confidence - a.confidence);
  }

  private rankHypothesis(
    hypothesis: Hypothesis,
    allEvidence: EvidenceItem[]
  ): RankedHypothesis {
    // Calculate support and conflict scores based on evidence
    const supportScore = Math.min(
      10,
      (hypothesis.supportingEvidenceCount / Math.max(allEvidence.length, 1)) * 10
    );

    const conflictScore = Math.min(
      10,
      (hypothesis.conflictingEvidenceCount / Math.max(allEvidence.length, 1)) * 10
    );

    const netScore = supportScore - conflictScore;

    // Calculate specificity score (how many patterns + dimensions support this)
    const specificity = this.calculateSpecificity(hypothesis);

    // Recalculate confidence based on net score, evidence, and specificity
    const confidence = this.calculateConfidenceFromScore(
      netScore,
      hypothesis,
      specificity
    );

    const justification = this.generateJustification(
      hypothesis.supportingEvidenceCount,
      hypothesis.conflictingEvidenceCount,
      allEvidence.length,
      confidence,
      hypothesis.patternCount || 0
    );

    return {
      ...hypothesis,
      supportingScore: Math.round(supportScore * 10) / 10,
      conflictScore: Math.round(conflictScore * 10) / 10,
      netScore: Math.round(netScore * 10) / 10,
      specificity: Math.round(specificity * 10) / 10,
      confidence,
      confidenceJustification: justification,
    };
  }

  private calculateSpecificity(hypothesis: Hypothesis): number {
    // Specificity is based on how many patterns support + evidence diversity
    let specificity = 0;

    const patternCount = hypothesis.patternCount || 0;
    const diversity = hypothesis.evidenceDiversity || 0;

    // Multiple patterns boost specificity significantly
    if (patternCount >= 3) specificity = 8;
    else if (patternCount === 2) specificity = 6;
    else if (patternCount === 1) specificity = 4;
    else specificity = 2; // No patterns

    // Evidence diversity adds to specificity
    if (diversity >= 4) specificity = Math.min(10, specificity + 2);
    else if (diversity === 3) specificity = Math.min(10, specificity + 1);

    return specificity;
  }

  private calculateConfidenceFromScore(
    netScore: number,
    hypothesis: Hypothesis,
    specificity: number
  ): number {
    let confidence: number;

    // Base confidence from net score
    if (netScore > 5) {
      confidence = 55; // 55-65
    } else if (netScore > 3) {
      confidence = 45; // 45-55
    } else if (netScore > 1) {
      confidence = 35; // 35-45
    } else if (netScore > -1) {
      confidence = 25; // 25-35 (unclear)
    } else {
      confidence = 15; // 15-25 (contradicted)
    }

    // Add variance based on supporting evidence count
    if (hypothesis.supportingEvidenceCount >= 4) confidence = Math.min(65, confidence + 5);
    if (hypothesis.supportingEvidenceCount >= 6) confidence = Math.min(65, confidence + 5);

    // Add boost from specificity (multiple patterns = more confidence)
    const specificityBoost = (specificity / 10) * 10; // Up to +10
    confidence = Math.min(65, confidence + specificityBoost);

    // Reduce if contradictions present
    if (hypothesis.conflictingEvidenceCount > 3) confidence = Math.max(10, confidence - 10);

    // Reduce if no patterns (baseline scoring only)
    if ((hypothesis.patternCount || 0) === 0 && confidence > 15) {
      confidence = Math.max(10, confidence - 10); // Very uncertain
    }

    return Math.round(confidence);
  }

  private generateJustification(
    supportingCount: number,
    conflictCount: number,
    totalEvidence: number,
    confidence: number,
    patternCount: number
  ): string {
    const patternNote = patternCount > 0 ? ` (${patternCount} pattern${patternCount > 1 ? "s" : ""})` : "";
    return `Supporting: ${supportingCount} items, Conflicting: ${conflictCount} items, Total: ${totalEvidence}${patternNote}, Confidence = ${confidence}%`;
  }
}
