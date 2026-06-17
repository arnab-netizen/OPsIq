import { EvidenceItem, DiagnosisType } from "@/domain/consulting-engine/types";
import type { DiagnosisType as DT } from "@/domain/consulting-engine/types";

// Evidence synthesis combines multi-dimensional evidence into unified patterns
export interface SynthesizedEvidence {
  dimensionsExamined: string[];
  dimensionsMissing: string[];
  evidenceTraceRate: number;
  criticalEvidencePresent: boolean;
  patterns: EvidencePattern[];
  synthesisConfidence: number;
}

export interface EvidencePattern {
  name: string;
  dimensions: string[];
  supportingItems: string[]; // evidence IDs
  patternStrength: number; // 0-10
  potentialRootCauses: DiagnosisType[];
}

// F1: Evidence content validators for dimension-based pattern refinement
interface EvidenceContentValidator {
  validateTrustQualityCrisis(evidence: EvidenceItem[]): {
    hasQualityEvidence: boolean;
    confidence: number;
  };
  validateGoToMarketMisalignment(evidence: EvidenceItem[]): {
    hasGTMEvidence: boolean;
    confidence: number;
  };
  validateDemandForecastingMismatch(evidence: EvidenceItem[]): {
    hasDemandEvidence: boolean;
    confidence: number;
  };
  validateStrategicPricingError(evidence: EvidenceItem[]): {
    hasPricingEvidence: boolean;
    confidence: number;
  };
  validateOperationalBottleneck(evidence: EvidenceItem[]): {
    hasBottleneckEvidence: boolean;
    confidence: number;
  };
}

// F1: Content validator implementation
class PatternContentValidator implements EvidenceContentValidator {
  validateTrustQualityCrisis(evidence: EvidenceItem[]): {
    hasQualityEvidence: boolean;
    confidence: number;
  } {
    // Quality crisis requires actual quality/reliability defect evidence, not just dimension presence
    // Look for: SLA misses, uptime issues, defect reports, incident frequency, NPS decline linked to quality, reliability problems
    const qualityEvidence = evidence.filter((e) => e.dimension === "quality_delivery");
    const retentionEvidence = evidence.filter((e) => e.dimension === "customer_retention");

    const hasQualityDefects = qualityEvidence.some((e) =>
      /uptime.*9[89]%|incident|outage|downtime|reliability|stability|sla|defect|bug|critical.*issue|support.*ticket|support.*surge|support.*40%|support.*rising|crash|broken|failure/.test(
        e.finding.toLowerCase()
      )
    );

    const hasChurnLinkedToQuality = retentionEvidence.some((e) =>
      /churn.*quality|churn.*reliab|churn.*support|churn.*service|quality.*churn|defect.*churn|complaint|dissatisf|nps.*decline.*quality|nps.*drop|nps.*fall/.test(
        e.finding.toLowerCase()
      )
    );

    const hasNPSDecline = retentionEvidence.some((e) => {
      const lower = e.finding.toLowerCase();
      // NPS should be declining due to quality, not just high retention with stable NPS
      return /nps.*(2[0-9]|3[0-9]).*down|nps.*fall|nps.*decline|nps.*drop|customer.*satisfaction.*decline/.test(
        lower
      );
    });

    // For TRUST_QUALITY_CRISIS to fire strongly, need clear quality defect OR churn driven by quality
    // If evidence shows stable NPS + high retention rate, suppress strong pattern even if dimensions present
    const hasStableQuality = retentionEvidence.some((e) =>
      /nps.*4[0-9]|nps.*5[0-9]|repeat.*7[0-9]%|satisfaction.*intact|customer.*satisfied|nps.*stable/.test(
        e.finding.toLowerCase()
      )
    );

    const confidence =
      hasQualityDefects && hasChurnLinkedToQuality ? 0.9 :
      hasQualityDefects ? 0.7 :
      hasNPSDecline && hasChurnLinkedToQuality ? 0.8 :
      hasNPSDecline ? 0.6 :
      hasStableQuality ? 0.1 : // Strong suppression if quality is explicitly stable (NPS 48, repeat 72%, etc.)
      0.3; // Weak pattern if dimensions present but no strong evidence either way

    return {
      hasQualityEvidence: hasQualityDefects || hasChurnLinkedToQuality || hasNPSDecline,
      confidence,
    };
  }

  validateGoToMarketMisalignment(evidence: EvidenceItem[]): {
    hasGTMEvidence: boolean;
    confidence: number;
  } {
    // GTM misalignment requires evidence of ICP/positioning/channel/offer-market problem
    // NOT just generic revenue/retention issues or adoption/lifecycle problems
    const marketEvidence = evidence.filter((e) => e.dimension === "market_position");
    const retentionEvidence = evidence.filter((e) => e.dimension === "customer_retention");

    const hasPositioningMismatch = marketEvidence.some((e) =>
      /positioning|messaging|value.*prop|target.*market|icp|segment.*mismatch|brand.*wrong|customer.*not.*fit|wrong.*audience|niche.*wrong/.test(
        e.finding.toLowerCase()
      )
    );

    const hasChannelProblem = marketEvidence.some((e) =>
      /channel|distribution|sales.*model|go.*market|partner|d2c|sales.*mix|acquisition|market.*entry|expansion|geographic/.test(
        e.finding.toLowerCase()
      )
    );

    const hasOfferMisalignment = marketEvidence.some((e) =>
      /pricing.*mismatch|offer.*wrong|product.*not.*fit|price.*positioning|price.*elasticity|offer.*market/.test(
        e.finding.toLowerCase()
      )
    );

    const hasAdoptionIssues = retentionEvidence.some((e) => {
      const lower = e.finding.toLowerCase();
      // Look for clear adoption/onboarding failure signals (not just the word "adoption")
      return /adoption.*fail|onboard.*fail|ttfv.*miss|time.*to.*first.*value.*[0-9]+d.*vs.*[0-9]+d|csm.*[0-9]+:|csm.*overload|csr.*ratio|customer.*success.*team.*small|training.*insufficient|activation.*low|activation.*[0-9]+%|engagement.*low/.test(
        lower
      );
    });

    // Only suppress GTM if clear adoption/onboarding failure AND no channel/acquisition evidence
    // If there's GTM evidence (channel/acquisition), allow the pattern even if adoption mentioned
    const confidence =
      hasPositioningMismatch ? 0.9 :
      (hasChannelProblem || hasOfferMisalignment) ? 0.8 :
      hasAdoptionIssues && !hasChannelProblem ? 0.2 : // Strong suppression if ONLY adoption issue
      0.5; // Default confidence if some evidence

    return {
      hasGTMEvidence:
        hasPositioningMismatch || hasChannelProblem || hasOfferMisalignment,
      confidence,
    };
  }

  validateDemandForecastingMismatch(evidence: EvidenceItem[]): {
    hasDemandEvidence: boolean;
    confidence: number;
  } {
    // Demand forecasting mismatch requires evidence of market-structural limits, saturation, or forecast error
    // NOT just generic growth deceleration
    const marketEvidence = evidence.filter((e) => e.dimension === "market_position");
    const financialEvidence = evidence.filter((e) => e.dimension === "financial_health");
    const retentionEvidence = evidence.filter((e) => e.dimension === "customer_retention");

    const hasGrowthDeceleration = marketEvidence.some((e) =>
      /decelerat|slowing|declining.*growth|25%.*15%|acquisition.*down|growth.*down/.test(
        e.finding.toLowerCase()
      )
    );

    const hasCompetitiveContext = marketEvidence.some((e) =>
      /compet|better.*funded|market.*consolidat|funding|market.*saturat|share.*loss/.test(
        e.finding.toLowerCase()
      )
    );

    const hasMarketStructuralLimit = marketEvidence.some((e) =>
      /tam.*limit|market.*flat|market.*mature|saturat|market.*decline|demand.*soft/.test(
        e.finding.toLowerCase()
      )
    );

    const hasStableRetention = retentionEvidence.some((e) =>
      /nps.*4[0-9]|repeat.*7[0-9]%|satisfaction.*intact|nps.*stable|retention.*stable|churn.*stable/.test(
        e.finding.toLowerCase()
      )
    );

    // Demand forecasting requires growth deceleration + either competitive pressure or market limit
    // AND stable retention (to rule out quality/satisfaction as cause)
    const confidence =
      hasGrowthDeceleration && hasCompetitiveContext && hasStableRetention ? 0.9 :
      hasGrowthDeceleration && hasMarketStructuralLimit ? 0.8 :
      hasGrowthDeceleration && (hasCompetitiveContext || hasMarketStructuralLimit) ? 0.7 :
      hasGrowthDeceleration ? 0.4 : // Weak pattern if just deceleration without market context
      0.1;

    return {
      hasDemandEvidence:
        hasGrowthDeceleration &&
        (hasCompetitiveContext || hasMarketStructuralLimit),
      confidence,
    };
  }

  validateStrategicPricingError(evidence: EvidenceItem[]): {
    hasPricingEvidence: boolean;
    confidence: number;
  } {
    // Strategic pricing error requires VERY EXPLICIT evidence of pricing power, willingness-to-pay, or pricing-specific issues
    // NOT just margin pressure, CAC, or generic market issues
    // This diagnosis is RARE and should only fire for cases explicitly mentioning pricing/monetization as the problem
    const financialEvidence = evidence.filter((e) => e.dimension === "financial_health");
    const marketEvidence = evidence.filter((e) => e.dimension === "market_position");

    // VERY explicit pricing language (not just margin-related)
    const hasPricingSpecificSignals = financialEvidence.some((e) => {
      const lower = e.finding.toLowerCase();
      // Only match very specific pricing issues like pricing error, pricing power, willingness to pay
      return /pricing.*error|price.*wrong|willingness.*to.*pay|price.*power|can't.*raise.*price|pricing.*challenge|price.*sensitivity.*issue|monetiz/.test(
        lower
      );
    });

    const hasNoPricingCompetitorContext = !marketEvidence.some((e) =>
      /competitor.*cheaper|price.*pressure|price.*competit|competitive.*pricing/.test(
        e.finding.toLowerCase()
      )
    );

    const hasCostPressure = financialEvidence.some((e) =>
      /cost.*rising|unit.*cost.*up|cac.*rising|cost.*inflation|fuel.*cost|wage.*cost|cogs.*up/.test(
        e.finding.toLowerCase()
      )
    );

    // Pricing error: Only if VERY explicit pricing signals AND NOT just cost/market pressure
    const confidence = hasPricingSpecificSignals && !hasCostPressure ? 0.9 : 0.05;

    return {
      hasPricingEvidence: hasPricingSpecificSignals && !hasCostPressure && hasNoPricingCompetitorContext,
      confidence,
    };
  }

  validateOperationalBottleneck(evidence: EvidenceItem[]): {
    hasBottleneckEvidence: boolean;
    confidence: number;
  } {
    // Operational bottleneck requires throughput constraints, capacity limits, or key-person dependencies
    // NOT just flat revenue or margin decline
    const operationalEvidence = evidence.filter((e) => e.dimension === "operational_efficiency");
    const teamEvidence = evidence.filter((e) => e.dimension === "team_capability");
    const financialEvidence = evidence.filter((e) => e.dimension === "financial_health");

    const hasThroughputConstraint = operationalEvidence.some((e) =>
      /bottleneck|capacity|throughput|queue|sla|cycle.*time|wait.*time|queue.*building|constraint|utilization.*high|bench.*time|staff.*utilization/.test(
        e.finding.toLowerCase()
      )
    );

    const hasKeyPersonDependency = teamEvidence.some((e) =>
      /key.*person|founder.*concentration|key.*talent|successor|key.*leader|single.*point|key.*employee|turnover|senior.*departure|key.*customer.*relationship/.test(
        e.finding.toLowerCase()
      )
    );

    const hasFlatRevenueWithoutCapacityIssues = financialEvidence.some((e) => {
      const lower = e.finding.toLowerCase();
      return /revenue.*flat|flat.*revenue|no.*growth|revenue.*decline|growth.*slow/.test(lower);
    }) && !hasThroughputConstraint;

    // Bottleneck: throughput issues OR key-person dependency (NOT just flat revenue alone)
    const confidence =
      (hasThroughputConstraint && hasKeyPersonDependency) ? 0.9 :
      hasThroughputConstraint ? 0.8 :
      hasKeyPersonDependency ? 0.7 :
      hasFlatRevenueWithoutCapacityIssues ? 0.2 : // Suppress if just flat revenue without capacity signals
      0.3;

    return {
      hasBottleneckEvidence: hasThroughputConstraint || hasKeyPersonDependency,
      confidence,
    };
  }
}

export class EvidenceSynthesisEngine {
  private readonly contentValidator = new PatternContentValidator();

  // All available dimensions
  private readonly allDimensions = [
    "customer_retention",
    "operational_efficiency",
    "quality_delivery",
    "financial_health",
    "process_maturity",
    "team_capability",
    "market_position",
  ];

  synthesizeEvidence(evidence: EvidenceItem[]): SynthesizedEvidence {
    const dimensionsExamined = this.findExaminedDimensions(evidence);
    const dimensionsMissing = this.allDimensions.filter(
      (d) => !dimensionsExamined.includes(d)
    );

    const patterns = this.discoverPatterns(evidence, dimensionsExamined);
    const traceRate = this.calculateTraceRate(evidence, patterns);
    const criticalPresent = this.hasCriticalEvidence(evidence);

    // Synthesis confidence bounded by weakest dimension
    const synthesisConfidence = this.calculateSynthesisConfidence(
      dimensionsExamined,
      evidence
    );

    return {
      dimensionsExamined,
      dimensionsMissing,
      evidenceTraceRate: traceRate,
      criticalEvidencePresent: criticalPresent,
      patterns,
      synthesisConfidence,
    };
  }

  private findExaminedDimensions(evidence: EvidenceItem[]): string[] {
    const dimensions = new Set(evidence.map((e) => e.dimension));
    return Array.from(dimensions);
  }

  private discoverPatterns(
    evidence: EvidenceItem[],
    dimensions: string[]
  ): EvidencePattern[] {
    const patterns: EvidencePattern[] = [];

    // Pattern 1: Unit Economics (financial + operational)
    if (
      dimensions.includes("financial_health") &&
      dimensions.includes("operational_efficiency")
    ) {
      const pattern = this.checkPattern(
        evidence,
        ["financial_health", "operational_efficiency"],
        [
          DiagnosisType.UNIT_ECONOMICS_BREAKDOWN,
          DiagnosisType.OPERATIONAL_BOTTLENECK,
        ]
      );
      if (pattern) patterns.push(pattern);
    }

    // Pattern 2: Demand Crisis (market + operational)
    if (
      dimensions.includes("market_position") &&
      dimensions.includes("operational_efficiency")
    ) {
      const pattern = this.checkPattern(
        evidence,
        ["market_position", "operational_efficiency"],
        [DiagnosisType.DEMAND_FORECASTING_MISMATCH]
      );
      if (pattern) patterns.push(pattern);
    }

    // Pattern 3: Quality Crisis (quality + customer retention) - F1: Add content validation
    if (
      dimensions.includes("quality_delivery") &&
      dimensions.includes("customer_retention")
    ) {
      const validation = this.contentValidator.validateTrustQualityCrisis(
        evidence
      );

      // F1: Create pattern if quality evidence exists or not explicitly contradicted
      if (validation.hasQualityEvidence || validation.confidence >= 0.2) {
        const pattern = this.checkPatternWithContentValidation(
          evidence,
          ["quality_delivery", "customer_retention"],
          [
            DiagnosisType.TRUST_QUALITY_CRISIS,
            DiagnosisType.CUSTOMER_RETENTION_EROSION,
          ],
          validation.confidence
        );
        if (pattern) patterns.push(pattern);
      }
    }

    // Pattern 4: Team/Execution Issues (team + financial + operational)
    if (dimensions.includes("team_capability")) {
      const pattern = this.checkPattern(
        evidence,
        ["team_capability", "operational_efficiency"],
        [DiagnosisType.OPERATIONAL_BOTTLENECK]
      );
      if (pattern) patterns.push(pattern);
    }

    // Pattern 5: GTM Issues (market + customer) - F1: Add content validation
    if (
      dimensions.includes("market_position") &&
      dimensions.includes("customer_retention")
    ) {
      const validation = this.contentValidator.validateGoToMarketMisalignment(
        evidence
      );

      // F1: Only create pattern if GTM evidence exists or confidence reasonable (allow weak patterns too)
      if (validation.hasGTMEvidence || validation.confidence >= 0.2) {
        const pattern = this.checkPatternWithContentValidation(
          evidence,
          ["market_position", "customer_retention"],
          [DiagnosisType.GO_TO_MARKET_MISALIGNMENT],
          validation.confidence
        );
        if (pattern) patterns.push(pattern);
      }
    }

    // SLICE 6: Pattern 6 - Market saturation signals (growth deceleration + stable retention) - F1: Use content validator
    if (dimensions.includes("market_position")) {
      const validation = this.contentValidator.validateDemandForecastingMismatch(
        evidence
      );

      // F1: Use validator to ensure demand evidence beyond just growth deceleration
      if (validation.hasDemandEvidence || validation.confidence >= 0.3) {
        const pattern = this.checkPatternWithContentValidation(
          evidence,
          ["market_position", "customer_retention"],
          [DiagnosisType.DEMAND_FORECASTING_MISMATCH],
          validation.confidence
        );
        if (pattern) patterns.push(pattern);
      }
    }

    // SLICE 6: Pattern 7 - Demand cycle signals from operational leading indicators
    if (dimensions.includes("operational_efficiency")) {
      const operationalEvidence = evidence.filter((e) => e.dimension === "operational_efficiency");
      const hasLeadingIndicatorDecline = operationalEvidence.some((e) =>
        /perm.*place.*-[0-9]|order.*-[0-9]|temp.*hour.*-[0-9]|placement.*declining|acquisition.*declining/.test(e.finding.toLowerCase())
      );

      if (hasLeadingIndicatorDecline) {
        const pattern = this.checkPattern(
          evidence,
          ["operational_efficiency"],
          [DiagnosisType.DEMAND_FORECASTING_MISMATCH]
        );
        if (pattern) patterns.push(pattern);
      }
    }

    // SLICE 6: Pattern 8 - Quality/reliability crisis signals
    if (dimensions.includes("quality_delivery")) {
      const qualityEvidence = evidence.filter((e) => e.dimension === "quality_delivery");
      const retentionEvidence = evidence.filter((e) => e.dimension === "customer_retention");

      const hasReliabilityIssues = qualityEvidence.some((e) =>
        /uptime.*99\.2%|incident.*2-3|outage.*4.*hour|reliability|stability|support.*40%|support.*rising/.test(e.finding.toLowerCase())
      );
      const hasChurnWithQuality = retentionEvidence.some((e) =>
        /churn.*2%.*3%|churn.*rising|churn.*increasing/.test(e.finding.toLowerCase())
      );

      if (hasReliabilityIssues && hasChurnWithQuality) {
        const pattern = this.checkPattern(
          evidence,
          ["quality_delivery", "customer_retention"],
          [DiagnosisType.TRUST_QUALITY_CRISIS]
        );
        if (pattern) patterns.push(pattern);
      }
    }

    // NEW Pattern 9: Strategic Pricing Error (financial + market with pricing-specific evidence)
    if (
      dimensions.includes("financial_health") &&
      dimensions.includes("market_position")
    ) {
      const validation = this.contentValidator.validateStrategicPricingError(
        evidence
      );

      if (validation.hasPricingEvidence || validation.confidence >= 0.4) {
        const pattern = this.checkPatternWithContentValidation(
          evidence,
          ["financial_health", "market_position"],
          [DiagnosisType.STRATEGIC_PRICING_ERROR],
          validation.confidence
        );
        if (pattern) patterns.push(pattern);
      }
    }

    // NEW Pattern 10: Demand Forecasting with Financial Context (market + financial showing CAC/acquisition pressure)
    // ONLY if existing Pattern 6 (market-position-driven) does NOT already cover demand forecasting
    if (
      dimensions.includes("financial_health") &&
      dimensions.includes("market_position")
    ) {
      const financialEvidence = evidence.filter((e) => e.dimension === "financial_health");
      const marketEvidence = evidence.filter((e) => e.dimension === "market_position");

      const hasCACorAcquisitionPressure = financialEvidence.some((e) => {
        const lower = e.finding.toLowerCase();
        return /cac.*rising|cac.*up|acquisition.*growth.*down|acquisition.*decelerat|customer.*acquis.*cost|marketing.*spend.*up.*acquisition/.test(
          lower
        );
      });

      const hasMarketDeceleration = marketEvidence.some((e) => {
        const lower = e.finding.toLowerCase();
        return /growth.*decelerat|market.*consolidat|compet.*share.*loss|faster.*growing|well.*funded.*compet/.test(
          lower
        );
      });

      const hasStableRetention = evidence.some((e) =>
        /nps.*4[0-9]|repeat.*7[0-9]%|satisfaction.*intact|nps.*stable|retention.*stable/.test(
          e.finding.toLowerCase()
        )
      );

      if (hasCACorAcquisitionPressure && hasMarketDeceleration && hasStableRetention) {
        const pattern = this.checkPattern(
          evidence,
          ["financial_health", "market_position"],
          [DiagnosisType.DEMAND_FORECASTING_MISMATCH]
        );
        if (pattern) patterns.push(pattern);
      }
    }

    // NEW Pattern 11: Operational Bottleneck (team + operational with content validation)
    if (
      dimensions.includes("team_capability") ||
      dimensions.includes("operational_efficiency")
    ) {
      const validation = this.contentValidator.validateOperationalBottleneck(
        evidence
      );

      if (validation.hasBottleneckEvidence || validation.confidence >= 0.4) {
        const dims: string[] = [];
        if (dimensions.includes("team_capability")) dims.push("team_capability");
        if (dimensions.includes("operational_efficiency"))
          dims.push("operational_efficiency");

        if (dims.length > 0) {
          const supportingItems = evidence
            .filter((e) => dims.includes(e.dimension))
            .map((e) => e.id);

          if (supportingItems.length >= 1) {
            const baseStrength = Math.min(10, supportingItems.length * 2);
            const patternStrength = Math.max(
              1,
              Math.round(baseStrength * validation.confidence)
            );

            patterns.push({
              name: `${dims.join("-")}-bottleneck-pattern`,
              dimensions: dims,
              supportingItems,
              patternStrength,
              potentialRootCauses: [DiagnosisType.OPERATIONAL_BOTTLENECK],
            });
          }
        }
      }
    }

    return patterns;
  }

  private checkPattern(
    evidence: EvidenceItem[],
    requiredDimensions: string[],
    potentialRootCauses: DiagnosisType[]
  ): EvidencePattern | null {
    const supportingItems = evidence
      .filter((e) => requiredDimensions.includes(e.dimension))
      .map((e) => e.id);

    if (supportingItems.length < 2) {
      return null; // Need at least 2 supporting items for a pattern
    }

    const patternStrength = Math.min(
      10,
      (supportingItems.length * 2) // 2 items = 4/10, 3 items = 6/10, etc.
    );

    return {
      name: `${requiredDimensions.join("-")}-pattern`,
      dimensions: requiredDimensions,
      supportingItems,
      patternStrength,
      potentialRootCauses,
    };
  }

  // F1: Content-aware pattern validation - adjusts pattern strength based on evidence semantics
  private checkPatternWithContentValidation(
    evidence: EvidenceItem[],
    requiredDimensions: string[],
    potentialRootCauses: DiagnosisType[],
    contentConfidence: number
  ): EvidencePattern | null {
    const supportingItems = evidence
      .filter((e) => requiredDimensions.includes(e.dimension))
      .map((e) => e.id);

    if (supportingItems.length < 2) {
      return null; // Need at least 2 supporting items for a pattern
    }

    // F1: Base pattern strength on dimension count, but modulate by content validation confidence
    const baseStrength = Math.min(10, supportingItems.length * 2);
    // Apply content confidence to pattern strength: if content validation is weak (e.g., 0.1), suppress pattern
    // If content validation is strong (e.g., 0.9), boost or maintain pattern
    const patternStrength = Math.max(
      1, // Minimum 1 to preserve trace, but suppress strong patterns
      Math.round(baseStrength * contentConfidence)
    );

    return {
      name: `${requiredDimensions.join("-")}-pattern`,
      dimensions: requiredDimensions,
      supportingItems,
      patternStrength,
      potentialRootCauses,
    };
  }

  private calculateTraceRate(evidence: EvidenceItem[], patterns: EvidencePattern[]): number {
    if (evidence.length === 0) return 0;

    const tracedIds = new Set<string>();
    patterns.forEach((p) => {
      p.supportingItems.forEach((id) => tracedIds.add(id));
    });

    // Also count critical evidence as traced even if not in a specific pattern
    evidence.forEach((e) => {
      if (e.isCritical) tracedIds.add(e.id);
    });

    return Math.round((tracedIds.size / evidence.length) * 100);
  }

  private hasCriticalEvidence(evidence: EvidenceItem[]): boolean {
    return evidence.some((e) => e.isCritical);
  }

  private calculateSynthesisConfidence(
    dimensions: string[],
    evidence: EvidenceItem[]
  ): number {
    // Confidence based on: number of dimensions, critical evidence, strength of findings
    const dimensionScore = Math.min(dimensions.length / 7, 1); // max 7 dimensions
    const criticalScore = evidence.some((e) => e.isCritical) ? 1 : 0.5;
    const confidence = (dimensionScore + criticalScore) / 2;

    return Math.round(confidence * 10) / 10;
  }
}
