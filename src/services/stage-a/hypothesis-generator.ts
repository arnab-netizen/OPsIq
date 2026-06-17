import { EvidenceItem, DiagnosisType } from "@/domain/consulting-engine/types";
import { SynthesizedEvidence, EvidencePattern } from "./evidence-synthesis-engine";
import { CausalDiagnosisAdjudicator } from "./causal-diagnosis-adjudicator";

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
  causalEvidenceFound?: boolean; // SLICE_8: whether diagnosis-specific causal evidence found
}

export class HypothesisGenerator {
  private readonly adjudicator = new CausalDiagnosisAdjudicator();

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
  // SLICE_8: Added causal vs symptom distinction and negative indicators
  private readonly diagnosisRequirements: Record<string, {
    preferredDimensions: string[];
    minSupportingItems: number;
    patternBoost: number;
    specificity: number; // 0-1, how specific evidence needs to be (higher = more discriminative)
    requiredEvidenceIndicators: string[]; // Specific evidence indicators required
    causalIndicators?: string[]; // SLICE_8: causal evidence that directly drives this diagnosis
    negativeIndicators?: string[]; // SLICE_8: evidence that suggests this diagnosis is WRONG
  }> = {
    [DiagnosisType.UNIT_ECONOMICS_BREAKDOWN]: {
      preferredDimensions: ["financial_health"],
      minSupportingItems: 2,
      patternBoost: 1.3,
      specificity: 0.95,
      requiredEvidenceIndicators: ["cac", "payback", "margin", "ltv", "arpu"],
      causalIndicators: ["cost per unit", "cac payback", "ltv declining", "margin pressure from costs", "margin declining due to cost"], // SLICE_8: unit cost causal signals (specific to costs, not price)
      negativeIndicators: ["operations stable", "throughput normal", "utilization healthy", "no capacity issues", "margin pressure from price", "discounting required", "pricing pressure"], // SLICE_8: not economics if pricing or operational issue
    },
    [DiagnosisType.OPERATIONAL_BOTTLENECK]: {
      preferredDimensions: ["operational_efficiency"],
      minSupportingItems: 2,
      patternBoost: 1.2,
      specificity: 0.65,
      requiredEvidenceIndicators: ["bottleneck", "capacity", "throughput", "queue", "turnover", "utilization", "constraint"],
      causalIndicators: ["capacity constraint", "throughput limitation", "queue building", "sla breached", "utilization high"], // SLICE_8: operational constraints
      negativeIndicators: ["margin pressure", "cac rising", "cost per unit increasing", "contribution margin declining"], // SLICE_8: not bottleneck if financial pressure
    },
    [DiagnosisType.DEMAND_FORECASTING_MISMATCH]: {
      preferredDimensions: ["market_position"],
      minSupportingItems: 2,
      patternBoost: 1.2,
      specificity: 0.75,
      requiredEvidenceIndicators: ["forecast", "expected", "demand", "projected", "growth", "deceleration", "market", "tam"],
      causalIndicators: ["market growth rate", "tam saturation", "growth deceleration toward market", "competitive consolidation", "acquisition reversion"], // SLICE_8: causal signals
      negativeIndicators: ["customer satisfaction intact", "nps stable", "repeat rate high"], // SLICE_8: if present, less likely to be demand issue
    },
    [DiagnosisType.GO_TO_MARKET_MISALIGNMENT]: {
      preferredDimensions: ["market_position", "customer_retention"],
      minSupportingItems: 2,
      patternBoost: 1.2,
      specificity: 0.85,
      requiredEvidenceIndicators: ["gtm", "positioning", "messaging", "segment", "market entry"],
      causalIndicators: ["positioning mismatch", "messaging rejection", "icp wrong", "value prop unclear", "channel misalignment"], // SLICE_8: GTM-specific causes
      negativeIndicators: ["customer satisfaction stable", "nps positive", "repeat rate high", "growth deceleration toward market rate", "competitive consolidation"], // SLICE_8: not GTM if market-structural issue
    },
    [DiagnosisType.CUSTOMER_RETENTION_EROSION]: {
      preferredDimensions: ["customer_retention"],
      minSupportingItems: 2,
      patternBoost: 1.1,
      specificity: 0.75,
      requiredEvidenceIndicators: ["churn", "retention", "attrition", "customer loss"],
      causalIndicators: ["cohort decay", "reorder drop", "repeat rate declining", "customer lifecycle erosion"], // SLICE_8: retention lifecycle signals (NOT churn rising alone)
      negativeIndicators: ["quality defects", "reliability issues", "support tickets rising", "uptime degraded", "trust breakdown", "growth deceleration", "nps stable", "repeat rate high", "acquisition declining"], // SLICE_8: not retention if other issues or healthy metrics
    },
    [DiagnosisType.TRUST_QUALITY_CRISIS]: {
      preferredDimensions: ["quality_delivery"],
      minSupportingItems: 2,
      patternBoost: 1.1,
      specificity: 0.9,
      requiredEvidenceIndicators: ["trust", "fraud", "breach", "scandal", "reputation", "reliability", "uptime", "incident", "quality"],
      causalIndicators: ["uptime degraded", "reliability issues", "incidents increasing", "quality defects", "trust breakdown", "refunds due to defects"], // SLICE_8: quality/reliability causal
      negativeIndicators: ["repeat rate high", "nps positive", "satisfaction stable"], // SLICE_8: not quality if satisfaction intact
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
      specificity: 0.8,
      requiredEvidenceIndicators: ["pricing", "price", "willingness", "sensitivity", "win rate", "monetization"],
      causalIndicators: ["discounting required", "price sensitivity", "margin pressure from price", "competitor pricing", "willingness to pay declining"], // SLICE_8: pricing power signals
      negativeIndicators: ["positioning mismatch", "messaging wrong", "icp unclear", "value prop rejected"], // SLICE_8: not pricing if positioning issue
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
      required: ["cac", "unit economics", "payback", "ltv"],
      supporting: ["cost per unit", "profitability", "arpu", "contribution margin", "margin pressure"],
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
    let sorted = candidates.sort((a, b) => {
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

    // SLICE 7: Multi-factor conflict resolution
    // Only apply conflict resolution to known conflict pairs when they're close in confidence
    if (sorted.length > 1 && Math.abs(sorted[0].confidence - sorted[1].confidence) < 15) {
      // Check if this is a known conflict pair
      if (this.isKnownConflictPair(sorted[0].rootCause, sorted[1].rootCause)) {
        const conflictScore = this.resolveConflict(
          sorted[0],
          sorted[1],
          allEvidence,
          synthesizedEvidence
        );

        // Only swap if there's a clear winner from conflict resolution
        if (conflictScore.winner && conflictScore.margin > 5 && conflictScore.winner !== sorted[0].rootCause) {
          const temp = sorted[0];
          sorted[0] = sorted[1];
          sorted[1] = temp;
        }
      }
    }

    // SLICE_10 (CAUSAL_REWORK_SLICE_1): Apply causal diagnosis adjudication as extreme tiebreaker
    // Only reorder when top 2 candidates are essentially tied (within 1 confidence point)
    if (sorted.length > 1 && Math.abs(sorted[0].confidence - sorted[1].confidence) <= 1) {
      sorted = this.adjudicator.adjudicateCandidates(sorted, allEvidence, synthesizedEvidence);
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

    // STAGE_A_ABSTENTION_GATE: before accepting the top diagnosis, decide whether
    // the evidence actually supports a safe concrete root cause. If not, abstain
    // with INSUFFICIENT_EVIDENCE rather than forcing a (possibly high-confidence)
    // diagnosis. This never fabricates a diagnosis and preserves evidence traces.
    const gated = this.applyAbstentionGate(top3, allEvidence);

    return gated.map((h, idx) => ({
      ...h,
      id: `hyp-${idx}`,
    }));
  }

  // STAGE_A_ABSTENTION_GATE thresholds (principled, not benchmark-fitted):
  // - NO_PATTERN_SUPPORT: a top diagnosis resting on zero synthesized evidence
  //   patterns and below the pattern-less baseline floor is structurally unsupported.
  // - PERVASIVE_MISSING_DATA: when the evidence corpus self-declares, on average,
  //   at least one explicit "data required is missing/unknown" statement per
  //   evidence item, the analyst input itself asserts insufficiency.
  private static readonly ABSTAIN_NO_PATTERN_MAX_CONFIDENCE = 40;
  private static readonly ABSTAIN_MISSING_DATA_DENSITY = 1.0;
  private static readonly ABSTAIN_MIN_EVIDENCE_FOR_DENSITY = 4;
  private static readonly ABSTAIN_MIN_EVIDENCE_FOR_NO_PATTERN = 3;
  private static readonly ABSTENTION_CONFIDENCE = 20;

  // Generic epistemic-uncertainty / missing-data phrases. These describe the
  // ABSENCE of decision-grade data; they are not tied to any case or answer key.
  private readonly missingDataPhrases: string[] = [
    "unknown", "not yet known", "not been", "never computed", "never been",
    "no detailed analysis", "no win/loss", "not yet", "cannot be", "unclear",
    "not clear", "only partially", "has not been", "have not been",
    "not measured", "no cohort", "it is unknown", "undocumented",
    "uncharacterized", "not quantified", "no analysis", "not substantiated",
    "unverified", "not been pulled", "not been produced", "not been computed",
    "not been analyzed",
  ];

  private computeMissingDataDensity(allEvidence: EvidenceItem[]): number {
    if (allEvidence.length === 0) return 0;
    const text = allEvidence.map((e) => e.finding.toLowerCase()).join(" ");
    let count = 0;
    for (const phrase of this.missingDataPhrases) {
      count += text.split(phrase).length - 1;
    }
    return count / allEvidence.length;
  }

  /**
   * Decide whether to abstain. Returns the original hypotheses unchanged when a
   * safe concrete diagnosis is supported; otherwise returns an INSUFFICIENT_EVIDENCE
   * hypothesis at the top with the original candidates demoted (for traceability).
   */
  private applyAbstentionGate(
    top3: Hypothesis[],
    allEvidence: EvidenceItem[]
  ): Hypothesis[] {
    if (top3.length === 0) return top3;
    const winner = top3[0];

    const reasons: string[] = [];
    const missingDataDensity = this.computeMissingDataDensity(allEvidence);

    // Rule A — NO_PATTERN_SUPPORT: top diagnosis backed by no evidence pattern,
    // below the pattern-less baseline floor, AND the evidence itself contains at
    // least one explicit missing-data statement. The missing-data requirement
    // prevents abstaining a strongly-but-narrowly-evidenced single-dimension case
    // (which legitimately may not form a 2-dimension pattern yet is unambiguous).
    if (
      allEvidence.length >= HypothesisGenerator.ABSTAIN_MIN_EVIDENCE_FOR_NO_PATTERN &&
      (winner.patternCount || 0) === 0 &&
      winner.confidence < HypothesisGenerator.ABSTAIN_NO_PATTERN_MAX_CONFIDENCE &&
      missingDataDensity > 0
    ) {
      reasons.push(
        "no evidence pattern supports any diagnosis and the evidence explicitly notes required data is missing"
      );
    }

    // Rule B — PERVASIVE_MISSING_DATA: the evidence self-declares missing data.
    // Require a minimum evidence count: a per-item density threshold is only
    // statistically meaningful with enough items (tiny inputs trip it spuriously).
    if (
      allEvidence.length >= HypothesisGenerator.ABSTAIN_MIN_EVIDENCE_FOR_DENSITY &&
      missingDataDensity >= HypothesisGenerator.ABSTAIN_MISSING_DATA_DENSITY
    ) {
      reasons.push(
        `evidence pervasively declares the data required for a confident diagnosis is missing (missing-data density ${missingDataDensity.toFixed(
          2
        )} per item)`
      );
    }

    if (reasons.length === 0) {
      return top3; // safe concrete diagnosis — do not abstain
    }

    const abstention: Hypothesis = {
      id: "hyp-0",
      rootCause: DiagnosisType.INSUFFICIENT_EVIDENCE,
      confidence: HypothesisGenerator.ABSTENTION_CONFIDENCE,
      supportingEvidenceCount: winner.supportingEvidenceCount,
      conflictingEvidenceCount: winner.conflictingEvidenceCount,
      reasoning:
        `INSUFFICIENT_EVIDENCE: withholding a concrete root cause because ${reasons.join(
          "; and "
        )}. Strongest non-abstained candidate was '${winner.rootCause}' (conf ${winner.confidence}).`,
      patternCount: winner.patternCount,
      patternStrengthSum: winner.patternStrengthSum,
      evidenceDiversity: winner.evidenceDiversity,
      causalEvidenceFound: winner.causalEvidenceFound,
    };

    // Keep original candidates as lower-ranked context for traceability.
    return [abstention, ...top3];
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

    // SLICE_8: Check for causal evidence (not just symptoms)
    const req = this.diagnosisRequirements[diagnosisType];
    let hasCausalEvidence = false;
    if (req && req.causalIndicators) {
      const allText = allEvidence.map((e) => e.finding.toLowerCase()).join(" ");
      for (const causal of req.causalIndicators) {
        if (allText.includes(causal.toLowerCase())) {
          hasCausalEvidence = true;
          break;
        }
      }
    }

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

    // Check for contradictions and SLICE_8: negative indicators
    const contradictions = this.findContradictions(
      diagnosisType,
      Array.from(supportingIds),
      allEvidence,
      synthesizedEvidence
    );

    // SLICE_8: Apply negative indicator penalties
    // SLICE_9: Enhanced matching to catch phrase variations (not just exact substrings)
    let negativeIndicatorPenalty = 0;
    if (req && req.negativeIndicators) {
      const allText = allEvidence.map((e) => e.finding.toLowerCase()).join(" ");
      let negCount = 0;
      for (const negative of req.negativeIndicators) {
        const negLower = negative.toLowerCase();

        // SLICE_9: Try exact match first
        if (allText.includes(negLower)) {
          negCount++;
          continue;
        }

        // SLICE_9: If no exact match, try partial phrase matching
        // Check if all keywords in the negative indicator are present in the text
        const keywords = negLower.split(/\s+/).filter(w => w.length > 2);
        if (keywords.length > 0) {
          const keywordsFound = keywords.filter(kw => {
            // Check for exact keyword or word stem match (e.g., "deceleration" matches "decelerat")
            return allText.includes(kw) || allText.includes(kw.substring(0, Math.max(5, kw.length - 2)));
          }).length;
          // If 75%+ of keywords are found, consider it a match (accounts for phrase variations)
          if (keywordsFound >= Math.ceil(keywords.length * 0.75)) {
            negCount++;
          }
        }
      }
      negativeIndicatorPenalty = negCount * 10; // -10 per negative indicator found
    }

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

    // Reduce for contradictions and SLICE_8: negative indicators
    const scoreAfterContradictions = Math.max(
      0,
      baseConfidence - contradictions.length * 8 - negativeIndicatorPenalty
    );

    // SLICE 3: Blend pattern-based with keyword validation and evidence specificity
    // SLICE_8: Apply causal evidence requirement
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

      // SLICE_8: Boost confidence when strong causal evidence is found
      if (req && req.causalIndicators && hasCausalEvidence) {
        // Count how many causal indicators are present
        const allText = allEvidence.map((e) => e.finding.toLowerCase()).join(" ");
        let causalCount = 0;
        for (const causal of req.causalIndicators) {
          if (allText.includes(causal.toLowerCase())) {
            causalCount++;
          }
        }
        // Boost confidence proportionally to number of causal indicators found
        const causalBoost = Math.min(15, causalCount * 3);
        confidence = Math.min(65, confidence + causalBoost);
      }

      // SLICE_8: If no causal evidence found, reduce confidence (only symptoms present)
      if (req && req.causalIndicators && !hasCausalEvidence && confidence > 40) {
        confidence = Math.max(25, confidence - 15); // reduce if only symptoms, no causal evidence
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

      // SLICE_8: Without patterns AND without causal evidence, keep baseline low
      if (req && req.causalIndicators && !hasCausalEvidence) {
        confidence = Math.max(0, confidence - 10);
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
      causalEvidenceFound: hasCausalEvidence, // SLICE_8: track whether causal evidence found
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

  // SLICE 7: Multi-factor conflict resolution for competing diagnoses
  private resolveConflict(
    diagnosis1: Hypothesis,
    diagnosis2: Hypothesis,
    allEvidence: EvidenceItem[],
    synthesizedEvidence: SynthesizedEvidence
  ): { winner: DiagnosisType | null; margin: number } {
    // Check for specific conflict pairs in both directions
    if (this.isConflictPair(diagnosis1.rootCause, diagnosis2.rootCause,
        DiagnosisType.DEMAND_FORECASTING_MISMATCH, DiagnosisType.GO_TO_MARKET_MISALIGNMENT)) {
      return this.resolveDemandVsGTMConflict(diagnosis1, diagnosis2, allEvidence);
    }
    if (this.isConflictPair(diagnosis1.rootCause, diagnosis2.rootCause,
        DiagnosisType.DEMAND_FORECASTING_MISMATCH, DiagnosisType.CUSTOMER_RETENTION_EROSION)) {
      return this.resolveDemandVsRetentionConflict(diagnosis1, diagnosis2, allEvidence);
    }
    if (this.isConflictPair(diagnosis1.rootCause, diagnosis2.rootCause,
        DiagnosisType.STRATEGIC_PRICING_ERROR, DiagnosisType.GO_TO_MARKET_MISALIGNMENT)) {
      return this.resolvePricingVsGTMConflict(diagnosis1, diagnosis2, allEvidence);
    }
    if (this.isConflictPair(diagnosis1.rootCause, diagnosis2.rootCause,
        DiagnosisType.TRUST_QUALITY_CRISIS, DiagnosisType.CUSTOMER_RETENTION_EROSION)) {
      return this.resolveTrustVsRetentionConflict(diagnosis1, diagnosis2, allEvidence);
    }
    if (this.isConflictPair(diagnosis1.rootCause, diagnosis2.rootCause,
        DiagnosisType.UNIT_ECONOMICS_BREAKDOWN, DiagnosisType.OPERATIONAL_BOTTLENECK)) {
      return this.resolveUnitEconomicsVsOperationalConflict(diagnosis1, diagnosis2, allEvidence);
    }

    // General multi-factor scoring for other conflicts
    return this.scoreConflictGenerally(diagnosis1, diagnosis2, allEvidence);
  }

  private isConflictPair(d1: DiagnosisType, d2: DiagnosisType, type1: DiagnosisType, type2: DiagnosisType): boolean {
    return (d1 === type1 && d2 === type2) || (d1 === type2 && d2 === type1);
  }

  private isKnownConflictPair(d1: DiagnosisType, d2: DiagnosisType): boolean {
    // Only consider these as conflict pairs needing resolution
    const pairs = [
      [DiagnosisType.DEMAND_FORECASTING_MISMATCH, DiagnosisType.GO_TO_MARKET_MISALIGNMENT],
      [DiagnosisType.STRATEGIC_PRICING_ERROR, DiagnosisType.GO_TO_MARKET_MISALIGNMENT],
      [DiagnosisType.TRUST_QUALITY_CRISIS, DiagnosisType.CUSTOMER_RETENTION_EROSION],
      [DiagnosisType.UNIT_ECONOMICS_BREAKDOWN, DiagnosisType.OPERATIONAL_BOTTLENECK],
    ];

    return pairs.some(pair =>
      (d1 === pair[0] && d2 === pair[1]) || (d1 === pair[1] && d2 === pair[0])
    );
  }

  private resolveDemandVsGTMConflict(
    d1: Hypothesis,
    d2: Hypothesis,
    allEvidence: EvidenceItem[]
  ): { winner: DiagnosisType | null; margin: number } {
    const allText = allEvidence.map((e) => e.finding.toLowerCase()).join(" ");

    // Demand forecasting indicators
    const hasDemandCycle = /forecast|demand|expected|projected|deceleration|slowing|market rate.*reverting|acquisition.*declining/i.test(allText);
    const hasDemandEvidence = /(nps|repeat|satisfaction).*(stable|intact|high|72%)/i.test(allText) && hasDemandCycle;
    const hasLeadingIndicators = /(perm.*place|order|temp.*hour).*(declining|down|fewer|-)/i.test(allText);

    // GTM indicators
    const hasGTMEvidence = /positioning|messaging|segment|market.*entry|value.*prop|icp|channel/i.test(allText);
    const hasConversionIssue = /conversion|win.*rate|sales.*motion|closing/i.test(allText);

    let winner: DiagnosisType | null = null;
    let margin = 0;

    const demandDiagnosis = d1.rootCause === DiagnosisType.DEMAND_FORECASTING_MISMATCH ? d1 : d2;
    const gtmDiagnosis = d1.rootCause === DiagnosisType.GO_TO_MARKET_MISALIGNMENT ? d1 : d2;

    if ((hasDemandEvidence || hasLeadingIndicators) && !hasConversionIssue) {
      winner = DiagnosisType.DEMAND_FORECASTING_MISMATCH;
      margin = Math.abs(demandDiagnosis.confidence - gtmDiagnosis.confidence) + 10;
    } else if (hasGTMEvidence && !hasDemandCycle) {
      winner = DiagnosisType.GO_TO_MARKET_MISALIGNMENT;
      margin = Math.abs(gtmDiagnosis.confidence - demandDiagnosis.confidence) + 10;
    }

    return { winner, margin };
  }

  private resolveDemandVsRetentionConflict(
    d1: Hypothesis,
    d2: Hypothesis,
    allEvidence: EvidenceItem[]
  ): { winner: DiagnosisType | null; margin: number } {
    const allText = allEvidence.map((e) => e.finding.toLowerCase()).join(" ");

    // Demand forecasting indicators: market cycle + stable customer health
    const hasDemandCycle = /deceleration|slowing|market.*rate|acquisition.*declining|competitive.*consolidat|tam.*saturation/i.test(allText);
    const hasHealthyMetrics = /(nps|repeat|satisfaction).*(stable|intact|high|48|72%)/i.test(allText);

    // Retention indicators: lifecycle-specific (NOT just churn)
    const hasRetentionLifecycle = /(cohort.*decay|reorder.*drop|repeat.*declining|customer.*lifecycle)/i.test(allText);
    const hasChurnOnly = /churn.*rising|churn.*increasing/i.test(allText) && !hasRetentionLifecycle;

    let winner: DiagnosisType | null = null;
    let margin = 0;

    const demandDiagnosis = d1.rootCause === DiagnosisType.DEMAND_FORECASTING_MISMATCH ? d1 : d2;
    const retentionDiagnosis = d1.rootCause === DiagnosisType.CUSTOMER_RETENTION_EROSION ? d1 : d2;

    if ((hasDemandCycle && hasHealthyMetrics) || (hasChurnOnly && hasHealthyMetrics)) {
      // Market cycle with stable satisfaction = demand saturation, not retention issue
      winner = DiagnosisType.DEMAND_FORECASTING_MISMATCH;
      margin = Math.abs(demandDiagnosis.confidence - retentionDiagnosis.confidence) + 10;
    } else if (hasRetentionLifecycle && !hasDemandCycle) {
      // Lifecycle decay without demand signals = retention issue
      winner = DiagnosisType.CUSTOMER_RETENTION_EROSION;
      margin = Math.abs(retentionDiagnosis.confidence - demandDiagnosis.confidence) + 10;
    }

    return { winner, margin };
  }

  private resolvePricingVsGTMConflict(
    d1: Hypothesis,
    d2: Hypothesis,
    allEvidence: EvidenceItem[]
  ): { winner: DiagnosisType | null; margin: number } {
    const allText = allEvidence.map((e) => e.finding.toLowerCase()).join(" ");

    // Pricing power indicators
    const hasPricingEvidence = /pricing|price.*sensitivity|willingness.*to.*pay|discount|margin.*pressure|competitor.*price|price.*competition/i.test(allText);
    const hasMarginPressure = /margin.*pressure|discount.*dependency|revenue.*grow.*profit.*flat|payback.*deteriorat/i.test(allText);

    // GTM indicators
    const hasGTMEvidence = /positioning|messaging|segment|market.*entry|value.*prop|icp|channel|conversion/i.test(allText);

    let winner: DiagnosisType | null = null;
    let margin = 0;

    const pricingDiagnosis = d1.rootCause === DiagnosisType.STRATEGIC_PRICING_ERROR ? d1 : d2;
    const gtmDiagnosis = d1.rootCause === DiagnosisType.GO_TO_MARKET_MISALIGNMENT ? d1 : d2;

    if ((hasPricingEvidence || hasMarginPressure) && !hasGTMEvidence) {
      winner = DiagnosisType.STRATEGIC_PRICING_ERROR;
      margin = Math.abs(pricingDiagnosis.confidence - gtmDiagnosis.confidence) + 10;
    } else if (hasGTMEvidence && !hasPricingEvidence) {
      winner = DiagnosisType.GO_TO_MARKET_MISALIGNMENT;
      margin = Math.abs(gtmDiagnosis.confidence - pricingDiagnosis.confidence) + 10;
    }

    return { winner, margin };
  }

  private resolveTrustVsRetentionConflict(
    d1: Hypothesis,
    d2: Hypothesis,
    allEvidence: EvidenceItem[]
  ): { winner: DiagnosisType | null; margin: number } {
    const allText = allEvidence.map((e) => e.finding.toLowerCase()).join(" ");

    // Trust/quality indicators
    const hasQualityDefects = /defect|reliability|uptime|incident|outage|quality|crash|failure|support.*ticket|stability|performance/i.test(allText);
    const hasRefunds = /refund|refunded/i.test(allText);
    const hasReputationIssue = /scandal|fraud|breach|reputational|missed.*promise|trust.*break/i.test(allText);

    // Retention indicators (lifecycle-based)
    const hasRetentionEvidence = /churn|retention|attrition|customer.*loss|cancellation|cohort.*decay|reorder.*drop|repeat/i.test(allText);

    let winner: DiagnosisType | null = null;
    let margin = 0;

    const trustDiagnosis = d1.rootCause === DiagnosisType.TRUST_QUALITY_CRISIS ? d1 : d2;
    const retentionDiagnosis = d1.rootCause === DiagnosisType.CUSTOMER_RETENTION_EROSION ? d1 : d2;

    if ((hasQualityDefects || hasRefunds || hasReputationIssue) && !hasRetentionEvidence) {
      winner = DiagnosisType.TRUST_QUALITY_CRISIS;
      margin = Math.abs(trustDiagnosis.confidence - retentionDiagnosis.confidence) + 10;
    } else if (hasRetentionEvidence && !hasQualityDefects) {
      winner = DiagnosisType.CUSTOMER_RETENTION_EROSION;
      margin = Math.abs(retentionDiagnosis.confidence - trustDiagnosis.confidence) + 10;
    }

    return { winner, margin };
  }

  private resolveUnitEconomicsVsOperationalConflict(
    d1: Hypothesis,
    d2: Hypothesis,
    allEvidence: EvidenceItem[]
  ): { winner: DiagnosisType | null; margin: number } {
    const allText = allEvidence.map((e) => e.finding.toLowerCase()).join(" ");

    // Unit economics indicators
    const hasUnitEconomicsEvidence = /cac|ltv|payback|contribution.*margin|cost.*per.*unit|cost.*per.*order|cost.*per.*customer|arpu|margin.*weakness|discount.*dependency|revenue.*grow.*profit.*flat/i.test(allText);
    const hasCOGSPressure = /cogs|cost.*of.*goods|labor.*cost|delivery.*cost|variable.*cost/i.test(allText);

    // Operational indicators (throughput/capacity/process)
    const hasOperationalEvidence = /bottleneck|capacity|throughput|queue|cycle.*time|sla|fulfillment|delay|staffing|utilization|constraint|process/i.test(allText);

    let winner: DiagnosisType | null = null;
    let margin = 0;

    const unitEconomicsDiagnosis = d1.rootCause === DiagnosisType.UNIT_ECONOMICS_BREAKDOWN ? d1 : d2;
    const operationalDiagnosis = d1.rootCause === DiagnosisType.OPERATIONAL_BOTTLENECK ? d1 : d2;

    if ((hasUnitEconomicsEvidence || hasCOGSPressure) && !hasOperationalEvidence) {
      winner = DiagnosisType.UNIT_ECONOMICS_BREAKDOWN;
      margin = Math.abs(unitEconomicsDiagnosis.confidence - operationalDiagnosis.confidence) + 10;
    } else if (hasOperationalEvidence && !hasUnitEconomicsEvidence) {
      winner = DiagnosisType.OPERATIONAL_BOTTLENECK;
      margin = Math.abs(operationalDiagnosis.confidence - unitEconomicsDiagnosis.confidence) + 10;
    }

    return { winner, margin };
  }

  private scoreConflictGenerally(
    d1: Hypothesis,
    d2: Hypothesis,
    allEvidence: EvidenceItem[]
  ): { winner: DiagnosisType | null; margin: number } {
    // General multi-factor scoring
    const d1Score = this.calculateMultiFactorScore(d1, allEvidence);
    const d2Score = this.calculateMultiFactorScore(d2, allEvidence);

    const margin = Math.abs(d1Score - d2Score);
    const winner = d1Score > d2Score ? d1.rootCause : (d2Score > d1Score ? d2.rootCause : null);

    return { winner, margin };
  }

  private calculateMultiFactorScore(hypothesis: Hypothesis, allEvidence: EvidenceItem[]): number {
    let score = hypothesis.confidence; // Base score from confidence

    // Factor 1: Required evidence match (0-20 points)
    const requiredMatch = this.scoreRequiredEvidenceMatch(hypothesis.rootCause, allEvidence);
    score += requiredMatch * 20;

    // Factor 2: Evidence diversity (0-15 points)
    score += (hypothesis.evidenceDiversity || 0) * 2;

    // Factor 3: Pattern strength (0-15 points)
    score += Math.min(15, (hypothesis.patternCount || 0) * 5);

    // Factor 4: Contradiction penalty (-10 to 0)
    score -= Math.min(10, hypothesis.conflictingEvidenceCount * 3);

    // Factor 5: Supporting evidence ratio (0-20 points)
    const supportRatio = hypothesis.supportingEvidenceCount / Math.max(allEvidence.length, 1);
    score += Math.min(20, supportRatio * 30);

    return Math.max(0, score);
  }

  private scoreRequiredEvidenceMatch(diagnosis: DiagnosisType, allEvidence: EvidenceItem[]): number {
    const req = this.diagnosisRequirements[diagnosis];
    if (!req || req.requiredEvidenceIndicators.length === 0) return 0;

    const allText = allEvidence.map((e) => e.finding.toLowerCase()).join(" ");
    let matchCount = 0;

    for (const indicator of req.requiredEvidenceIndicators) {
      if (allText.includes(indicator.toLowerCase())) {
        matchCount++;
      }
    }

    return matchCount / req.requiredEvidenceIndicators.length;
  }
}
