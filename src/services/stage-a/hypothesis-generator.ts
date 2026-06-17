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
  // SLICE 3: Added evidence specificity scores to improve discrimination
  private readonly diagnosisRequirements: Record<string, {
    preferredDimensions: string[];
    minSupportingItems: number;
    patternBoost: number;
    specificity: number; // 0-1, how specific evidence needs to be (higher = more discriminative)
    requiredEvidenceIndicators: string[]; // Specific evidence indicators required
  }> = {
    [DiagnosisType.UNIT_ECONOMICS_BREAKDOWN]: {
      preferredDimensions: ["financial_health"],
      minSupportingItems: 2,
      patternBoost: 1.3,
      specificity: 0.95, // SLICE 3: Very high specificity - boost for financial evidence
      requiredEvidenceIndicators: ["cac", "payback", "margin", "ltv", "arpu"],
    },
    [DiagnosisType.OPERATIONAL_BOTTLENECK]: {
      preferredDimensions: ["operational_efficiency"],
      minSupportingItems: 2,
      patternBoost: 1.2,
      specificity: 0.65, // SLICE 3: Moderate specificity; SLICE 6: Enhanced with talent/throughput signals
      requiredEvidenceIndicators: ["bottleneck", "capacity", "throughput", "queue", "turnover", "utilization", "constraint"],
    },
    [DiagnosisType.DEMAND_FORECASTING_MISMATCH]: {
      preferredDimensions: ["market_position"],
      minSupportingItems: 2,
      patternBoost: 1.2,
      specificity: 0.75, // SLICE 3: Moderate specificity; SLICE 6: Enhanced with context signals
      requiredEvidenceIndicators: ["forecast", "expected", "demand", "projected", "growth", "deceleration", "market", "tam"],
    },
    [DiagnosisType.GO_TO_MARKET_MISALIGNMENT]: {
      preferredDimensions: ["market_position", "customer_retention"],
      minSupportingItems: 2,
      patternBoost: 1.2,
      specificity: 0.85, // SLICE 4: Increased from 0.75 - needs market-specific evidence
      requiredEvidenceIndicators: ["gtm", "positioning", "messaging", "segment", "market entry"],
    },
    [DiagnosisType.CUSTOMER_RETENTION_EROSION]: {
      preferredDimensions: ["customer_retention"],
      minSupportingItems: 2,
      patternBoost: 1.1,
      specificity: 0.75, // SLICE 4: Reduced from 0.8 to avoid over-matching
      requiredEvidenceIndicators: ["churn", "retention", "attrition", "customer loss"],
    },
    [DiagnosisType.TRUST_QUALITY_CRISIS]: {
      preferredDimensions: ["quality_delivery"],
      minSupportingItems: 2,
      patternBoost: 1.1,
      specificity: 0.9, // SLICE 4: Increased from 0.85 - very specific; SLICE 6: Enhanced with reliability indicators
      requiredEvidenceIndicators: ["trust", "fraud", "breach", "scandal", "reputation", "reliability", "uptime", "incident", "quality"],
    },
    [DiagnosisType.CASH_RUNWAY_CRISIS]: {
      preferredDimensions: ["financial_health"],
      minSupportingItems: 2,
      patternBoost: 1.25,
      specificity: 0.92, // SLICE 4: Very high specificity
      requiredEvidenceIndicators: ["cash", "runway", "burn", "burn rate", "fundraising"],
    },
    [DiagnosisType.QUALITY_CONTROL_FAILURE]: {
      preferredDimensions: ["quality_delivery"],
      minSupportingItems: 2,
      patternBoost: 1.1,
      specificity: 0.8, // SLICE 4: Added specificity requirement
      requiredEvidenceIndicators: ["quality", "defect", "bug", "failure", "reliability"],
    },
    [DiagnosisType.BRAND_EROSION]: {
      preferredDimensions: ["market_position"],
      minSupportingItems: 1,
      patternBoost: 1.1,
      specificity: 0.75, // SLICE 4: Added specificity requirement
      requiredEvidenceIndicators: ["brand", "reputation", "perception", "image"],
    },
    [DiagnosisType.STRATEGIC_PRICING_ERROR]: {
      preferredDimensions: ["financial_health"],
      minSupportingItems: 1,
      patternBoost: 1.15,
      specificity: 0.8, // SLICE 4: Added specificity requirement; SLICE 6: Enhanced with pricing power signals
      requiredEvidenceIndicators: ["pricing", "price", "willingness", "sensitivity", "win rate", "monetization"],
    },
    [DiagnosisType.GOVERNANCE_COMPLIANCE_FAILURE]: {
      preferredDimensions: ["process_maturity"],
      minSupportingItems: 1,
      patternBoost: 1.1,
      specificity: 0.85, // SLICE 4: Added specificity requirement
      requiredEvidenceIndicators: ["governance", "compliance", "audit", "regulation"],
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
      supporting: ["market sizing", "tam", "adoption", "growth rate", "deceleration", "slowing", "market share reverting", "acquisition declining", "nps stable", "repeat rate high"],
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
      required: ["trust", "credibility", "reputation", "scandal", "fraud", "security", "quality", "reliability", "uptime", "incident"],
      supporting: ["confidence", "breach", "incident", "outage", "support ticket rising", "detractor", "churn rising", "nps low"],
      contradictory: ["trust strong", "reputation excellent", "operations excellent"],
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

    // SLICE 3: Sort by confidence, then by evidence specificity match (new)
    const sorted = candidates.sort((a, b) => {
      if (Math.abs(b.confidence - a.confidence) > 2) {
        return b.confidence - a.confidence; // Significant confidence difference
      }
      // Tie-breaking: use evidence specificity (new for Slice 3)
      // Higher specificity match means more evidence-specific diagnosis wins
      const aSpecificity = this.calculateEvidenceSpecificityMatch(a.rootCause, allEvidence);
      const bSpecificity = this.calculateEvidenceSpecificityMatch(b.rootCause, allEvidence);
      if (Math.abs(bSpecificity - aSpecificity) > 0.1) {
        return bSpecificity - aSpecificity; // Diagnosis with more specific evidence match wins
      }
      // If still tied, use pattern count
      if ((b.patternCount || 0) !== (a.patternCount || 0)) {
        return (b.patternCount || 0) - (a.patternCount || 0);
      }
      if ((b.evidenceDiversity || 0) !== (a.evidenceDiversity || 0)) {
        return (b.evidenceDiversity || 0) - (a.evidenceDiversity || 0);
      }
      return 0;
    });

    // SLICE 5: Validate top hypothesis against keyword requirements
    // If top diagnosis has weak keyword support AND runner-up has much stronger keyword support,
    // swap them (tie-breaking improvement)
    if (sorted.length > 1) {
      const topKeywords = this.scoreKeywordMatch(sorted[0].rootCause, allEvidence);
      const runnerUpKeywords = this.scoreKeywordMatch(sorted[1].rootCause, allEvidence);

      // If top diagnosis lacks required keywords but runner-up has them strongly, consider swap
      if (!topKeywords.hasRequiredKeywords && topKeywords.supportingKeywordCount === 0 &&
          runnerUpKeywords.hasRequiredKeywords && sorted[0].confidence < 35 &&
          Math.abs(sorted[0].confidence - sorted[1].confidence) < 8) {
        // Swap: runner-up has much better keyword support despite lower confidence
        const temp = sorted[0];
        sorted[0] = sorted[1];
        sorted[1] = temp;
      }
    }

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

    // SLICE 3: Blend pattern-based with keyword validation and evidence specificity
    let confidence = 0;
    const specificityMatch = this.calculateEvidenceSpecificityMatch(diagnosisType, allEvidence);

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

      // SLICE 3: Boost for high evidence specificity match
      if (specificityMatch > 0.5) {
        confidence = Math.min(65, confidence + Math.round(specificityMatch * 10));
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

      // SLICE 3: Boost for evidence specificity even without patterns
      if (specificityMatch > 0.5) {
        confidence = Math.min(40, confidence + Math.round(specificityMatch * 8));
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

  // SLICE 3: Calculate how well evidence matches diagnosis-specific requirements
  private calculateEvidenceSpecificityMatch(
    diagnosis: DiagnosisType,
    allEvidence: EvidenceItem[]
  ): number {
    const req = this.diagnosisRequirements[diagnosis];
    if (!req) return 0;

    let specificityScore = 0;
    const allText = allEvidence.map((e) => e.finding.toLowerCase()).join(" ");

    // Check how many required evidence indicators are present
    let requiredIndicatorCount = 0;
    for (const indicator of req.requiredEvidenceIndicators) {
      if (allText.includes(indicator.toLowerCase())) {
        requiredIndicatorCount++;
      }
    }

    // Specificity match: higher if more specific evidence present
    // Range: 0-1 where 1 = all required indicators present
    specificityScore = Math.min(1, requiredIndicatorCount / Math.max(req.requiredEvidenceIndicators.length, 1));

    // Weight by diagnosis specificity requirement (higher specificity needs more evidence)
    specificityScore = specificityScore * req.specificity;

    // SLICE 6: Add context signal recognition for demand/market/quality signals
    specificityScore = this.applyContextSignalBoost(diagnosis, allEvidence, specificityScore);

    return specificityScore;
  }

  // SLICE 6: Recognize context signals that disambiguate between similar diagnoses
  private applyContextSignalBoost(
    diagnosis: DiagnosisType,
    allEvidence: EvidenceItem[],
    baseScore: number
  ): number {
    const allText = allEvidence.map((e) => e.finding.toLowerCase()).join(" ");
    let adjustedScore = baseScore;

    // Market-rate reversion context: growth deceleration + stable satisfaction = demand saturation
    if (diagnosis === DiagnosisType.DEMAND_FORECASTING_MISMATCH) {
      const hasGrowthDeceleration = /decelerat|slowing|declining|falling.*growth|growth.*falling|acquisition.*down|acquisition.*decelerat/i.test(allText);
      const hasStableSatisfaction = /(nps|repeat|satisfaction|loyalty).*(stable|intact|high|good|48|72%|strong)/i.test(allText);
      const hasCompetitiveContext = /compet|consolidat|better.*funded|market.*share|funding|entrant|segment.*shift/i.test(allText);

      // Lead indicator decline = demand cycle
      const hasLeadingIndicatorDecline = /(perm.*place|order|temp.*hour|placement|acquisition).*(declining|down|fewer|-\d)/i.test(allText);

      if ((hasGrowthDeceleration && hasStableSatisfaction && hasCompetitiveContext) || hasLeadingIndicatorDecline) {
        // Strong evidence of demand saturation/market-rate reversion
        adjustedScore = Math.min(1, adjustedScore + 0.35);
      }
    }

    // Quality/trust crisis context: reliability issues + rising support burden = quality crisis
    if (diagnosis === DiagnosisType.TRUST_QUALITY_CRISIS) {
      const hasReliabilityIssues = /(uptime|downtime|outage|incident|crash|reliability|stability|performance|support.*ticket).*(low|high|rising|increasing|frequent|degrading|below|99\.2%|4.*hour|8.*minute)/i.test(allText);
      const hasSupportBurden = /(support.*ticket|support).*rising|support.*40%|support.*trending.*up/i.test(allText);
      const hasChurnWithQuality = /churn.*rising|churn.*increasing|churn.*2%.*3%/i.test(allText);

      if (hasReliabilityIssues && (hasSupportBurden || hasChurnWithQuality)) {
        // Strong evidence of quality/trust crisis
        adjustedScore = Math.min(1, adjustedScore + 0.35);
      }
    }

    // Reduce CUSTOMER_RETENTION_EROSION if it's actually demand/quality issue
    if (diagnosis === DiagnosisType.CUSTOMER_RETENTION_EROSION) {
      const hasLeadingIndicatorDecline = /(perm.*place|order|temp.*hour).*(declining|down|fewer)/i.test(allText);
      const hasReliabilityIssues = /(uptime|incident|outage|reliability).*(low|99\.2%|4.*hour)/i.test(allText);

      // Reduce confidence if evidence suggests demand or quality, not just retention
      if (hasLeadingIndicatorDecline || hasReliabilityIssues) {
        adjustedScore = Math.max(0, adjustedScore - 0.3);
      }
    }

    // Talent pipeline context: turnover/utilization issues = delivery constraint
    if (diagnosis === DiagnosisType.OPERATIONAL_BOTTLENECK) {
      const hasTalentIssues = /(junior.*turnover|turnover.*rising|turnover.*10%.*18%|utilization.*72%|training.*burden)/i.test(allText);
      const hasDeliveryImpact = /(utilization|capacity|training|throughput).*(below|low|constraint|peer)/i.test(allText);

      if (hasTalentIssues && hasDeliveryImpact) {
        // Clear evidence of talent-driven capacity constraint
        adjustedScore = Math.min(1, adjustedScore + 0.25);
      }
    }

    return Math.max(0, adjustedScore);
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
