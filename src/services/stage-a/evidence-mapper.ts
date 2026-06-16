import { EvidenceItem, DiagnosisType } from "@/domain/consulting-engine/types";

export interface EvidenceMapping {
  hypothesis: DiagnosisType;
  supporting: Array<{ evidenceId: string; strength: number; reasoning: string }>;
  conflicting: Array<{ evidenceId: string; strength: number; reasoning: string }>;
  neutral: Array<{ evidenceId: string; reasoning: string }>;
  coverage: number; // Percentage of evidence reviewed
}

export class EvidenceMapper {
  mapEvidence(
    hypothesis: DiagnosisType,
    allEvidence: EvidenceItem[]
  ): EvidenceMapping {
    const supporting: Array<{ evidenceId: string; strength: number; reasoning: string }> = [];
    const conflicting: Array<{ evidenceId: string; strength: number; reasoning: string }> = [];
    const neutral: Array<{ evidenceId: string; reasoning: string }> = [];

    // Map each evidence item to the hypothesis
    const usedIds = new Set<string>();

    for (const evidence of allEvidence) {
      const relation = this.classifyEvidence(evidence, hypothesis);

      switch (relation.type) {
        case "supporting":
          supporting.push({
            evidenceId: evidence.id,
            strength: relation.strength,
            reasoning: relation.reasoning,
          });
          usedIds.add(evidence.id);
          break;

        case "conflicting":
          conflicting.push({
            evidenceId: evidence.id,
            strength: relation.strength,
            reasoning: relation.reasoning,
          });
          usedIds.add(evidence.id);
          break;

        case "neutral":
          neutral.push({
            evidenceId: evidence.id,
            reasoning: relation.reasoning,
          });
          usedIds.add(evidence.id);
          break;
      }
    }

    const coverage = Math.round((usedIds.size / Math.max(allEvidence.length, 1)) * 100);

    return {
      hypothesis,
      supporting,
      conflicting,
      neutral,
      coverage,
    };
  }

  private classifyEvidence(
    evidence: EvidenceItem,
    hypothesis: DiagnosisType
  ): { type: "supporting" | "conflicting" | "neutral"; strength: number; reasoning: string } {
    const dimension = evidence.dimension;
    const finding = evidence.finding.toLowerCase();

    // Map dimensions to hypotheses (simplified rules)
    const supportingMappings: Record<string, DiagnosisType[]> = {
      financial_health: [
        DiagnosisType.UNIT_ECONOMICS_BREAKDOWN,
        DiagnosisType.CASH_RUNWAY_CRISIS,
      ],
      operational_efficiency: [
        DiagnosisType.OPERATIONAL_BOTTLENECK,
        DiagnosisType.UNIT_ECONOMICS_BREAKDOWN,
      ],
      customer_retention: [
        DiagnosisType.CUSTOMER_RETENTION_EROSION,
        DiagnosisType.GO_TO_MARKET_MISALIGNMENT,
      ],
      quality_delivery: [
        DiagnosisType.TRUST_QUALITY_CRISIS,
        DiagnosisType.QUALITY_CONTROL_FAILURE,
      ],
      market_position: [
        DiagnosisType.GO_TO_MARKET_MISALIGNMENT,
        DiagnosisType.DEMAND_FORECASTING_MISMATCH,
      ],
      team_capability: [
        DiagnosisType.OPERATIONAL_BOTTLENECK,
        DiagnosisType.GOVERNANCE_COMPLIANCE_FAILURE,
      ],
    };

    const supportingHypotheses = supportingMappings[dimension] || [];

    // Determine if this evidence supports, conflicts, or is neutral
    if (supportingHypotheses.includes(hypothesis)) {
      // Supporting evidence
      const strength = this.calculateStrength(evidence, "supporting");
      return {
        type: "supporting",
        strength,
        reasoning: `${dimension} evidence supports ${hypothesis}`,
      };
    }

    // Check for conflicting evidence (opposite dimension)
    const conflictingHypotheses = this.getConflictingHypotheses(hypothesis);
    if (conflictingHypotheses.some((h) => supportingHypotheses.includes(h))) {
      // Conflicting evidence
      const strength = this.calculateStrength(evidence, "conflicting");
      return {
        type: "conflicting",
        strength,
        reasoning: `${dimension} evidence may contradict ${hypothesis}`,
      };
    }

    // Otherwise neutral
    return {
      type: "neutral",
      strength: 0,
      reasoning: `${dimension} evidence is neutral to ${hypothesis}`,
    };
  }

  private calculateStrength(evidence: EvidenceItem, relation: "supporting" | "conflicting"): number {
    let strength = 5; // Base strength

    // Adjust based on confidence level
    if (evidence.confidence === "HIGH") strength = 8;
    if (evidence.confidence === "MEDIUM") strength = 5;
    if (evidence.confidence === "LOW") strength = 3;
    if (evidence.confidence === "PROVISIONAL") strength = 2;

    // Critical evidence increases strength
    if (evidence.isCritical) strength = Math.min(10, strength + 2);

    // Cap at 10
    return Math.min(10, strength);
  }

  private getConflictingHypotheses(hypothesis: DiagnosisType): DiagnosisType[] {
    // Simple mapping of conflicting hypotheses
    const conflicts: Record<DiagnosisType, DiagnosisType[]> = {
      [DiagnosisType.OPERATIONAL_BOTTLENECK]: [DiagnosisType.DEMAND_FORECASTING_MISMATCH],
      [DiagnosisType.DEMAND_FORECASTING_MISMATCH]: [DiagnosisType.OPERATIONAL_BOTTLENECK],
      [DiagnosisType.UNIT_ECONOMICS_BREAKDOWN]: [DiagnosisType.GO_TO_MARKET_MISALIGNMENT],
      [DiagnosisType.GO_TO_MARKET_MISALIGNMENT]: [DiagnosisType.UNIT_ECONOMICS_BREAKDOWN],
      [DiagnosisType.QUALITY_CONTROL_FAILURE]: [DiagnosisType.DEMAND_FORECASTING_MISMATCH],
      [DiagnosisType.CUSTOMER_RETENTION_EROSION]: [DiagnosisType.BRAND_EROSION],
      [DiagnosisType.BRAND_EROSION]: [DiagnosisType.CUSTOMER_RETENTION_EROSION],
      [DiagnosisType.TRUST_QUALITY_CRISIS]: [DiagnosisType.GO_TO_MARKET_MISALIGNMENT],
      [DiagnosisType.STRATEGIC_PRICING_ERROR]: [DiagnosisType.DEMAND_FORECASTING_MISMATCH],
      [DiagnosisType.GOVERNANCE_COMPLIANCE_FAILURE]: [DiagnosisType.OPERATIONAL_BOTTLENECK],
      [DiagnosisType.CASH_RUNWAY_CRISIS]: [DiagnosisType.DEMAND_FORECASTING_MISMATCH],
      [DiagnosisType.UNKNOWN]: [],
    };

    return conflicts[hypothesis] || [];
  }
}
