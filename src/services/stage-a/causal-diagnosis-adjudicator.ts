import { DiagnosisType, EvidenceItem, ConfidenceLevel } from "@/domain/consulting-engine/types";
import { Hypothesis } from "./hypothesis-generator";
import { SynthesizedEvidence } from "./evidence-synthesis-engine";

export interface CausalAdjudicationScore {
  diagnosis: DiagnosisType;
  causalSupportScore: number; // 0-100: direct causal evidence
  symptomOnlyScore: number; // 0-100: symptom-only evidence
  contradictionScore: number; // 0-100: evidence contradicting diagnosis
  missingRequiredEvidencePenalty: number; // 0-50: penalty for missing key evidence
  upstreamPriorityScore: number; // 0-50: score based on causal hierarchy
  finalAdjudicationScore: number; // 0-100: final decision score
  explanation: string; // Why this diagnosis won/lost
  shouldFilter: boolean; // True if should be removed from consideration
  confidenceAdjustment: number; // -20 to +20: adjustment to original confidence
}

export class CausalDiagnosisAdjudicator {
  // Causal evidence keywords for each diagnosis
  private readonly causalEvidencePatterns: Record<string, {
    causal: RegExp[];
    symptoms: RegExp[];
    contradictions: RegExp[];
  }> = {
    [DiagnosisType.DEMAND_FORECASTING_MISMATCH]: {
      causal: [
        /market.*growth.*rate/i,
        /tam.*saturation/i,
        /growth.*deceleration.*toward.*market/i,
        /growth.*toward.*market.*rate/i,
        /acquisition.*revert/i,
        /competitive.*consolidat/i,
        /market.*share.*reverting/i,
      ],
      symptoms: [
        /revenue.*declining/i,
        /growth.*slowing/i,
        /market.*position.*weak/i,
      ],
      contradictions: [
        /customer.*satisfaction.*intact/i,
        /nps.*stable.*high/i,
        /repeat.*rate.*high/i,
      ],
    },
    [DiagnosisType.CUSTOMER_RETENTION_EROSION]: {
      causal: [
        /cohort.*decay/i,
        /reorder.*drop/i,
        /repeat.*rate.*declining/i,
        /customer.*lifecycle.*erosion/i,
        /customer.*satisfaction.*declining/i,
        /nps.*declining/i,
      ],
      symptoms: [
        /churn.*rising/i,
        /churn.*increasing/i,
        /customer.*loss/i,
      ],
      contradictions: [
        /growth.*deceleration.*toward.*market/i,
        /market.*saturation/i,
        /competitive.*consolidat/i,
        /nps.*stable.*high/i,
        /repeat.*rate.*high/i,
      ],
    },
    [DiagnosisType.GO_TO_MARKET_MISALIGNMENT]: {
      causal: [
        /positioning.*mismatch/i,
        /messaging.*rejection/i,
        /icp.*wrong/i,
        /value.*prop.*unclear/i,
        /channel.*misalignment/i,
        /market.*entry.*failed/i,
      ],
      symptoms: [
        /revenue.*weak/i,
        /win.*rate.*low/i,
      ],
      contradictions: [
        /growth.*deceleration.*toward.*market/i,
        /market.*saturation/i,
        /competitive.*consolidat/i,
        /nps.*stable.*high/i,
        /repeat.*rate.*high/i,
      ],
    },
    [DiagnosisType.UNIT_ECONOMICS_BREAKDOWN]: {
      causal: [
        /cost.*per.*unit/i,
        /cogs.*rising/i,
        /cac.*payback/i,
        /ltv.*declining.*cost/i,
        /margin.*pressure.*cost/i,
        /unit.*economics.*breaking/i,
      ],
      symptoms: [
        /profitability.*declining/i,
        /margins.*under.*pressure/i,
      ],
      contradictions: [
        /throughput.*normal/i,
        /utilization.*healthy/i,
        /capacity.*not.*constraint/i,
        /operations.*running.*smoothly/i,
      ],
    },
    [DiagnosisType.OPERATIONAL_BOTTLENECK]: {
      causal: [
        /capacity.*constraint/i,
        /throughput.*limitation/i,
        /queue.*building/i,
        /sla.*breach/i,
        /utilization.*high/i,
        /bottleneck/i,
      ],
      symptoms: [
        /throughput.*declining/i,
        /delays.*increasing/i,
      ],
      contradictions: [
        /margin.*pressure.*cost/i,
        /cac.*payback/i,
        /cost.*per.*unit/i,
      ],
    },
    [DiagnosisType.TRUST_QUALITY_CRISIS]: {
      causal: [
        /uptime.*degraded/i,
        /reliability.*issues/i,
        /incidents.*increasing/i,
        /quality.*defects/i,
        /trust.*breakdown/i,
        /refunds.*due.*defects/i,
      ],
      symptoms: [
        /support.*tickets.*rising/i,
        /complaints.*rising/i,
      ],
      contradictions: [
        /repeat.*rate.*high/i,
        /nps.*positive/i,
        /satisfaction.*stable/i,
      ],
    },
    [DiagnosisType.STRATEGIC_PRICING_ERROR]: {
      causal: [
        /discounting.*required/i,
        /price.*sensitivity/i,
        /margin.*pressure.*price/i,
        /competitor.*pricing/i,
        /willingness.*to.*pay.*declining/i,
      ],
      symptoms: [
        /revenue.*pressure/i,
      ],
      contradictions: [
        /positioning.*mismatch/i,
        /messaging.*wrong/i,
        /icp.*unclear/i,
      ],
    },
    [DiagnosisType.QUALITY_CONTROL_FAILURE]: {
      causal: [/quality.*defect/i, /bug/i, /failure/i, /reliability/i],
      symptoms: [/quality.*issue/i],
      contradictions: [/perfect.*quality/i, /zero.*defects/i],
    },
    [DiagnosisType.BRAND_EROSION]: {
      causal: [/brand.*damage/i, /reputation.*crisis/i],
      symptoms: [/brand.*weak/i],
      contradictions: [/strong.*brand/i, /reputation.*excellent/i],
    },
    [DiagnosisType.GOVERNANCE_COMPLIANCE_FAILURE]: {
      causal: [/compliance.*violation/i, /audit.*failure/i],
      symptoms: [/governance.*issue/i],
      contradictions: [/compliant/i],
    },
    [DiagnosisType.CASH_RUNWAY_CRISIS]: {
      causal: [/cash.*burn/i, /runway.*critical/i, /insolvency/i],
      symptoms: [/cash.*concern/i],
      contradictions: [/cash.*position.*strong/i, /well.*funded/i],
    },
  };

  adjudicateCandidates(
    candidates: Hypothesis[],
    allEvidence: EvidenceItem[],
    synthesizedEvidence: SynthesizedEvidence
  ): Hypothesis[] {
    if (candidates.length < 2) return candidates;

    const allText = allEvidence.map((e) => e.finding.toLowerCase()).join(" ");
    const adjudicationScores: Map<DiagnosisType, CausalAdjudicationScore> = new Map();

    // Score only top 2 candidates (for extreme tiebreaker use)
    const scoreA = this.scoreCandidate(candidates[0], allText, allEvidence, synthesizedEvidence);
    const scoreB = this.scoreCandidate(candidates[1], allText, allEvidence, synthesizedEvidence);
    adjudicationScores.set(candidates[0].rootCause, scoreA);
    adjudicationScores.set(candidates[1].rootCause, scoreB);

    // Check if causal adjudication would swap them
    const adjDiff = scoreB.finalAdjudicationScore - scoreA.finalAdjudicationScore;
    const shouldSwap = adjDiff > 5; // Clear causal advantage for second candidate

    let adjusted = [...candidates];
    if (shouldSwap) {
      const temp = adjusted[0];
      adjusted[0] = adjusted[1];
      adjusted[1] = temp;
    }

    // Apply small confidence adjustments to top 2
    for (let i = 0; i < Math.min(2, adjusted.length); i++) {
      const diagnosis = adjusted[i].rootCause;
      const score = adjudicationScores.get(diagnosis);
      if (score) {
        const newConfidence = Math.max(0, Math.min(65, adjusted[i].confidence + score.confidenceAdjustment));
        adjusted[i] = {
          ...adjusted[i],
          confidence: newConfidence,
        };
      }
    }

    return adjusted;
  }

  private scoreCandidate(
    candidate: Hypothesis,
    allText: string,
    allEvidence: EvidenceItem[],
    synthesizedEvidence: SynthesizedEvidence
  ): CausalAdjudicationScore {
    const patterns = this.causalEvidencePatterns[candidate.rootCause] || {
      causal: [],
      symptoms: [],
      contradictions: [],
    };

    // Count causal evidence
    const causalMatches = patterns.causal.filter((p) => p.test(allText)).length;
    const causalSupportScore = Math.min(100, causalMatches * 20); // 0-100 scale

    // Count symptom-only evidence
    const symptomMatches = patterns.symptoms.filter((p) => p.test(allText)).length;
    const symptomOnlyScore = Math.min(100, symptomMatches * 25);

    // Count contradictions (higher multiplier for stronger penalty)
    const contradictions = patterns.contradictions.filter((p) => p.test(allText)).length;
    const contradictionScore = Math.max(0, contradictions * 30); // 0-100 scale (higher = worse)

    // Check for missing required evidence
    const missingRequiredEvidencePenalty = this.calculateMissingEvidencePenalty(
      candidate.rootCause,
      allText,
      allEvidence
    );

    // Calculate upstream priority (causal hierarchy)
    const upstreamPriorityScore = this.calculateUpstreamPriority(
      candidate.rootCause,
      allText,
      allEvidence
    );

    // Apply hard rules for specific diagnosis pairs
    const shouldFilter = this.shouldFilterCandidate(
      candidate.rootCause,
      allText,
      causalSupportScore,
      symptomOnlyScore
    );

    // Calculate final adjudication score
    let finalScore = 50; // Neutral baseline

    if (causalSupportScore > 40) {
      // Has strong causal evidence
      finalScore = 70 + Math.min(30, causalSupportScore / 10);
    } else if (causalSupportScore > 0) {
      // Has some causal evidence
      finalScore = 60 + causalSupportScore / 5;
    } else if (symptomOnlyScore > 60) {
      // Symptom-only diagnosis: lower confidence significantly
      finalScore = 30 + symptomOnlyScore / 5;
    }

    // Apply penalties (stronger contradiction penalty for better discrimination)
    finalScore = Math.max(20, finalScore - contradictionScore / 2);
    finalScore = Math.max(20, finalScore - missingRequiredEvidencePenalty / 2);

    // Apply upstream priority boost
    finalScore = Math.min(85, finalScore + upstreamPriorityScore / 3);

    // Determine confidence adjustment (conservative: only small adjustments for tiebreaker use)
    let confidenceAdjustment = 0;
    if (finalScore >= 70 && causalSupportScore > 40) {
      confidenceAdjustment = +2; // Small boost for strong causal diagnoses
    } else if (finalScore < 35 && symptomOnlyScore > 60 && causalSupportScore === 0) {
      confidenceAdjustment = -3; // Small penalty for symptom-only diagnoses
    } else if (contradictionScore > 40) {
      confidenceAdjustment = -2; // Small penalty for contradicted diagnoses
    }

    const explanation = this.generateExplanation(
      candidate.rootCause,
      causalSupportScore,
      symptomOnlyScore,
      contradictionScore,
      upstreamPriorityScore,
      finalScore
    );

    return {
      diagnosis: candidate.rootCause,
      causalSupportScore,
      symptomOnlyScore,
      contradictionScore,
      missingRequiredEvidencePenalty,
      upstreamPriorityScore,
      finalAdjudicationScore: finalScore,
      explanation,
      shouldFilter,
      confidenceAdjustment,
    };
  }

  private calculateMissingEvidencePenalty(
    diagnosis: DiagnosisType,
    allText: string,
    allEvidence: EvidenceItem[]
  ): number {
    // Check for diagnosis-specific required dimensions
    const requiredDimensions: Record<DiagnosisType, string[]> = {
      [DiagnosisType.DEMAND_FORECASTING_MISMATCH]: ["market_position"],
      [DiagnosisType.CUSTOMER_RETENTION_EROSION]: ["customer_retention"],
      [DiagnosisType.GO_TO_MARKET_MISALIGNMENT]: ["market_position", "customer_retention"],
      [DiagnosisType.UNIT_ECONOMICS_BREAKDOWN]: ["financial_health"],
      [DiagnosisType.OPERATIONAL_BOTTLENECK]: ["operational_efficiency"],
      [DiagnosisType.TRUST_QUALITY_CRISIS]: ["quality_delivery"],
      [DiagnosisType.STRATEGIC_PRICING_ERROR]: ["financial_health"],
      [DiagnosisType.QUALITY_CONTROL_FAILURE]: ["quality_delivery"],
      [DiagnosisType.BRAND_EROSION]: ["market_position"],
      [DiagnosisType.GOVERNANCE_COMPLIANCE_FAILURE]: ["process_maturity"],
      [DiagnosisType.CASH_RUNWAY_CRISIS]: ["financial_health"],
      [DiagnosisType.UNKNOWN]: [],
    };

    const required = requiredDimensions[diagnosis] || [];
    const presentDimensions = new Set(allEvidence.map((e) => e.dimension as string));
    const missingCount = required.filter((d) => !presentDimensions.has(d)).length;

    return missingCount * 15; // 0-30+ penalty
  }

  private calculateUpstreamPriority(
    diagnosis: DiagnosisType,
    allText: string,
    allEvidence: EvidenceItem[]
  ): number {
    // Causal hierarchy: upstream causes score higher than downstream symptoms
    // Market saturation (demand) is upstream of GTM/retention
    // Cost is upstream of retention
    // Operational constraint is upstream of cost/retention

    if (diagnosis === DiagnosisType.DEMAND_FORECASTING_MISMATCH && /growth.*deceleration.*toward.*market|market.*saturation|tam.*saturation/i.test(allText)) {
      return 50; // Market saturation is an upstream root cause
    }

    if (diagnosis === DiagnosisType.UNIT_ECONOMICS_BREAKDOWN && /cost.*per.*unit|cogs.*rising/i.test(allText) && !/throughput.*limiting|capacity.*constraint/i.test(allText)) {
      return 40; // Cost is more upstream than retention
    }

    if (diagnosis === DiagnosisType.OPERATIONAL_BOTTLENECK && /capacity.*constraint|throughput.*limit/i.test(allText) && !/cost.*pressure.*price|cac.*payback/i.test(allText)) {
      return 35; // Operational constraint is upstream of cost
    }

    if (diagnosis === DiagnosisType.STRATEGIC_PRICING_ERROR && /discounting.*required|price.*sensitivity|margin.*pressure.*price/i.test(allText)) {
      return 30; // Pricing is upstream of GTM positioning
    }

    if (diagnosis === DiagnosisType.TRUST_QUALITY_CRISIS && /uptime.*degraded|reliability.*issues|quality.*defects/i.test(allText)) {
      return 35; // Quality is upstream of retention
    }

    return 0;
  }

  private shouldFilterCandidate(
    diagnosis: DiagnosisType,
    allText: string,
    causalSupportScore: number,
    symptomOnlyScore: number
  ): boolean {
    // Conservative: Don't filter diagnoses unless absolutely necessary
    // The adjudicator is meant to be a tiebreaker, not a broad filter
    return false;
  }

  private generateExplanation(
    diagnosis: DiagnosisType,
    causalScore: number,
    symptomScore: number,
    contradictionScore: number,
    upstreamScore: number,
    finalScore: number
  ): string {
    if (finalScore >= 70) {
      if (causalScore > 40) {
        return `Strong causal evidence (${causalScore.toFixed(0)}/100). Upstream priority score: ${upstreamScore.toFixed(0)}.`;
      } else {
        return `Good adjudication score (${finalScore.toFixed(0)}/100) with moderate causal support.`;
      }
    } else if (finalScore >= 50) {
      return `Neutral adjudication score (${finalScore.toFixed(0)}/100). Causal: ${causalScore.toFixed(0)}, Symptoms: ${symptomScore.toFixed(0)}.`;
    } else {
      if (symptomScore > 60 && causalScore === 0) {
        return `Symptom-only diagnosis (${symptomScore.toFixed(0)}/100 symptoms, 0/100 causal). Penalized for lack of root cause evidence.`;
      } else if (contradictionScore > 40) {
        return `Contradicted by evidence (contradiction score: ${contradictionScore.toFixed(0)}/100). Lower adjudication priority.`;
      } else {
        return `Low adjudication score (${finalScore.toFixed(0)}/100). Not supported by evidence hierarchy.`;
      }
    }
  }
}
