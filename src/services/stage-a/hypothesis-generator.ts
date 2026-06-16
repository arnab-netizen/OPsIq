import { EvidenceItem, DiagnosisType } from "@/domain/consulting-engine/types";
import { SynthesizedEvidence, EvidencePattern } from "./evidence-synthesis-engine";

export interface Hypothesis {
  id: string;
  rootCause: DiagnosisType;
  confidence: number; // 0-65
  supportingEvidenceCount: number;
  conflictingEvidenceCount: number;
  reasoning: string;
  patternCount?: number; // number of patterns supporting this hypothesis
  patternStrengthSum?: number; // sum of pattern strengths
  evidenceDiversity?: number; // how many different dimensions support this
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

  // Diagnosis-specific evidence requirements and boost factors
  private readonly diagnosisRequirements: Record<string, {
    preferredDimensions: string[];
    minSupportingItems: number;
    patternBoost: number;
  }> = {
    [DiagnosisType.UNIT_ECONOMICS_BREAKDOWN]: {
      preferredDimensions: ["financial_health"],
      minSupportingItems: 2,
      patternBoost: 1.3,
    },
    [DiagnosisType.OPERATIONAL_BOTTLENECK]: {
      preferredDimensions: ["operational_efficiency"],
      minSupportingItems: 2,
      patternBoost: 1.2,
    },
    [DiagnosisType.DEMAND_FORECASTING_MISMATCH]: {
      preferredDimensions: ["market_position"],
      minSupportingItems: 2,
      patternBoost: 1.2,
    },
    [DiagnosisType.GO_TO_MARKET_MISALIGNMENT]: {
      preferredDimensions: ["market_position", "customer_retention"],
      minSupportingItems: 2,
      patternBoost: 1.2,
    },
    [DiagnosisType.CUSTOMER_RETENTION_EROSION]: {
      preferredDimensions: ["customer_retention"],
      minSupportingItems: 2,
      patternBoost: 1.1,
    },
    [DiagnosisType.TRUST_QUALITY_CRISIS]: {
      preferredDimensions: ["quality_delivery"],
      minSupportingItems: 2,
      patternBoost: 1.1,
    },
  };

  // Keywords that specifically indicate each diagnosis
  private readonly diagnosisKeywords: Record<string, {
    required: string[];
    supporting: string[];
    contradictory: string[];
  }> = {
    [DiagnosisType.UNIT_ECONOMICS_BREAKDOWN]: {
      required: ["cac", "unit economics", "payback", "margin", "ltv", "contribution"],
      supporting: ["pricing", "profitability", "cost per unit", "arpu", "revenue"],
      contradictory: ["perfect operations", "zero issues", "no delays"],
    },
    [DiagnosisType.OPERATIONAL_BOTTLENECK]: {
      required: ["bottleneck", "capacity", "throughput", "cycle time", "queue", "constraint"],
      supporting: ["process", "workflow", "coordination", "dependency", "latency"],
      contradictory: ["financial metrics strong", "unit economics sound"],
    },
    [DiagnosisType.GO_TO_MARKET_MISALIGNMENT]: {
      required: ["gtm", "market entry", "positioning", "value prop", "messaging"],
      supporting: ["competitor", "differentiation", "segment", "market position"],
      contradictory: ["strong retention", "loyal customers"],
    },
    [DiagnosisType.DEMAND_FORECASTING_MISMATCH]: {
      required: ["forecast", "demand", "expected", "projected", "mismatch"],
      supporting: ["market sizing", "tam", "adoption", "growth rate"],
      contradictory: ["actual demand strong", "growth on track"],
    },
    [DiagnosisType.CUSTOMER_RETENTION_EROSION]: {
      required: ["churn", "retention", "attrition", "customer loss", "cancellation"],
      supporting: ["loyalty", "engagement", "satisfaction", "nps", "lifetime"],
      contradictory: ["growing customer base", "retention high"],
    },
    [DiagnosisType.QUALITY_CONTROL_FAILURE]: {
      required: ["quality", "defect", "bug", "failure", "reliability", "uptime"],
      supporting: ["issue", "problem", "error", "regression"],
      contradictory: ["perfect quality", "zero defects"],
    },
    [DiagnosisType.TRUST_QUALITY_CRISIS]: {
      required: ["trust", "credibility", "reputation", "scandal", "fraud", "security"],
      supporting: ["confidence", "breach", "incident"],
      contradictory: ["trust strong", "reputation excellent"],
    },
    [DiagnosisType.CASH_RUNWAY_CRISIS]: {
      required: ["cash", "runway", "burn", "burn rate", "fundraising", "capital"],
      supporting: ["liquidity", "solvency", "cash flow"],
      contradictory: ["cash position strong", "funded", "profitable"],
    },
  };

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

      // Include all hypotheses with reasonable confidence for ranking
      if (hypothesis.confidence > 0) {
        candidates.push(hypothesis);
      }
    }

    // If no candidates, return empty (will be handled as UNKNOWN by caller)
    if (candidates.length === 0) {
      return [];
    }

    // Sort by confidence descending, then by pattern count, then by evidence diversity
    const sorted = candidates.sort((a, b) => {
      if (Math.abs(b.confidence - a.confidence) > 2) {
        return b.confidence - a.confidence; // Significant confidence difference
      }
      // Tie-breaking for similar confidence
      if ((b.patternCount || 0) !== (a.patternCount || 0)) {
        return (b.patternCount || 0) - (a.patternCount || 0);
      }
      if ((b.evidenceDiversity || 0) !== (a.evidenceDiversity || 0)) {
        return (b.evidenceDiversity || 0) - (a.evidenceDiversity || 0);
      }
      // If still tied, lower confidence slightly to indicate uncertainty
      return 0;
    });

    // Take top 3, but adjust confidence downward if tied
    const top3: Hypothesis[] = [];
    for (let i = 0; i < Math.min(3, sorted.length); i++) {
      let h = { ...sorted[i] };
      if (i > 0 && Math.abs(h.confidence - top3[0].confidence) < 3) {
        // Tied or close to top, reduce confidence to indicate uncertainty
        h.confidence = Math.max(10, h.confidence - 5);
      }
      top3.push(h);
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

    // Count supporting evidence weighted by pattern strength
    const supportingIds = new Set<string>();
    let patternStrengthSum = 0;
    const supportingDimensions = new Set<string>();

    matchingPatterns.forEach((p) => {
      patternStrengthSum += (p.patternStrength || 1);
      p.supportingItems.forEach((id) => {
        supportingIds.add(id);
        // Track which dimensions support this hypothesis
        const evItem = allEvidence.find((e) => e.id === id);
        if (evItem) {
          supportingDimensions.add(evItem.dimension);
        }
      });
    });

    // Check for contradictions
    const contradictions = this.findContradictions(
      diagnosisType,
      Array.from(supportingIds),
      allEvidence,
      synthesizedEvidence
    );

    // Score keyword match to validate or refute the diagnosis
    const keywordMatch = this.scoreKeywordMatch(diagnosisType, allEvidence);

    // Calculate raw confidence with pattern weighting
    let baseConfidence = 0;
    if (supportingIds.size > 0) {
      // Base: percentage of evidence supporting
      baseConfidence =
        (supportingIds.size / Math.max(allEvidence.length, 1)) * 100;

      // Weight by pattern strength (more patterns = more confidence)
      const patternWeight = 1 + (matchingPatterns.length > 1 ? 0.2 : 0);
      baseConfidence = baseConfidence * patternWeight;

      // Apply diagnosis-specific boost
      const req = this.diagnosisRequirements[diagnosisType];
      if (req) {
        // Boost if preferred dimensions are present
        const dimensionsPresent = Array.from(supportingDimensions).filter((d) =>
          req.preferredDimensions.includes(d)
        ).length;
        if (dimensionsPresent > 0) {
          baseConfidence = baseConfidence * req.patternBoost;
        }
      }
    }

    // Reduce for contradictions
    const scoreAfterContradictions = Math.max(
      0,
      baseConfidence - contradictions.length * 8
    );

    // Blend pattern-based with keyword validation
    let confidence = 0;
    if (matchingPatterns.length > 0) {
      // Pattern-based diagnosis is primary
      confidence = Math.min(65, Math.round(scoreAfterContradictions));

      // Keyword validation helps confirm or refute
      if (keywordMatch.hasRequiredKeywords && keywordMatch.supportingKeywordCount > 0) {
        // Keywords confirm the diagnosis - boost slightly
        confidence = Math.min(65, confidence + 5);
      } else if (!keywordMatch.hasRequiredKeywords && keywordMatch.contradictoryKeywordCount > 0) {
        // Keywords contradict the diagnosis - reduce significantly
        confidence = Math.max(10, confidence - 15);
      }
    } else {
      // No patterns - use keyword-based scoring as fallback
      confidence = this.calculateBaselineScore(
        diagnosisType,
        synthesizedEvidence,
        allEvidence
      );

      // If keywords are present, boost baseline
      if (keywordMatch.hasRequiredKeywords) {
        confidence = Math.min(40, confidence + (keywordMatch.supportingKeywordCount > 0 ? 15 : 10));
      }
    }

    return {
      id: "", // will be set later
      rootCause: diagnosisType,
      confidence: Math.max(0, confidence), // can be 0 if evidence contradicts strongly
      supportingEvidenceCount: supportingIds.size,
      conflictingEvidenceCount: contradictions.length,
      patternCount: matchingPatterns.length,
      patternStrengthSum,
      evidenceDiversity: supportingDimensions.size,
      reasoning: this.generateReasoning(
        diagnosisType,
        supportingIds.size,
        contradictions.length,
        matchingPatterns.length
      ),
    };
  }

  private scoreKeywordMatch(
    diagnosis: DiagnosisType,
    allEvidence: EvidenceItem[]
  ): {
    hasRequiredKeywords: boolean;
    supportingKeywordCount: number;
    contradictoryKeywordCount: number;
  } {
    const keywords = this.diagnosisKeywords[diagnosis];
    if (!keywords) {
      return {
        hasRequiredKeywords: false,
        supportingKeywordCount: 0,
        contradictoryKeywordCount: 0,
      };
    }

    let hasRequiredKeywords = false;
    let supportingKeywordCount = 0;
    let contradictoryKeywordCount = 0;

    const allText = allEvidence.map((e) => e.finding.toLowerCase()).join(" ");

    // Check required keywords
    for (const keyword of keywords.required) {
      if (allText.includes(keyword.toLowerCase())) {
        hasRequiredKeywords = true;
        break;
      }
    }

    // Count supporting keywords
    for (const keyword of keywords.supporting) {
      if (allText.includes(keyword.toLowerCase())) {
        supportingKeywordCount++;
      }
    }

    // Count contradictory keywords
    for (const keyword of keywords.contradictory) {
      if (allText.includes(keyword.toLowerCase())) {
        contradictoryKeywordCount++;
      }
    }

    return { hasRequiredKeywords, supportingKeywordCount, contradictoryKeywordCount };
  }

  private calculateBaselineScore(
    diagnosisType: DiagnosisType,
    synthesizedEvidence: SynthesizedEvidence,
    allEvidence: EvidenceItem[]
  ): number {
    // For diagnoses without specific patterns, check if relevant dimensions exist
    const req = this.diagnosisRequirements[diagnosisType];
    if (!req) return 0; // Unknown diagnosis type gets 0

    // Check if preferred dimensions are present in examined dimensions
    const preferredDimensionsPresent = req.preferredDimensions.filter((d) =>
      synthesizedEvidence.dimensionsExamined.includes(d)
    ).length;

    if (preferredDimensionsPresent === 0) {
      // Relevant dimensions aren't even in evidence, very unlikely
      return 0;
    }

    // Baseline: diagnosis is plausible but not pattern-matched (10-15%)
    return 10;
  }

  private findContradictions(
    diagnosis: DiagnosisType,
    supportingIds: string[],
    allEvidence: EvidenceItem[],
    synthesizedEvidence: SynthesizedEvidence
  ): string[] {
    const contradictions: string[] = [];
    const supportingSet = new Set(supportingIds);

    allEvidence.forEach((e) => {
      if (!supportingSet.has(e.id)) {
        // Check if this evidence contradicts the diagnosis
        const dimensionStr = e.dimension;
        const finding = e.finding.toLowerCase();

        // Diagnosis-specific contradiction rules
        if (diagnosis === DiagnosisType.OPERATIONAL_BOTTLENECK) {
          // Contradicted by evidence of financial-only issues
          if (dimensionStr === "financial_health" && finding.includes("margin")) {
            // Only margin issue, not operational
            contradictions.push(e.id);
          }
        } else if (diagnosis === DiagnosisType.UNIT_ECONOMICS_BREAKDOWN) {
          // Contradicted by evidence of pure operational issues
          if (
            dimensionStr === "operational_efficiency" &&
            !finding.includes("cost") &&
            !finding.includes("margin")
          ) {
            // Pure efficiency, not economics
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
    contradictionCount: number,
    patternCount: number
  ): string {
    const diagnosisLabel = diagnosis.replace(/_/g, " ");
    const patternNote =
      patternCount > 0
        ? ` (${patternCount} pattern${patternCount > 1 ? "s" : ""})`
        : " (no patterns)";
    return `${diagnosisLabel}${patternNote}: ${supportingCount} supporting, ${contradictionCount} contradictions`;
  }
}
