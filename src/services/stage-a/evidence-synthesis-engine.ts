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

export class EvidenceSynthesisEngine {
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

    // Pattern 3: Quality Crisis (quality + customer retention + team)
    if (dimensions.includes("quality_delivery")) {
      const pattern = this.checkPattern(
        evidence,
        ["quality_delivery", "customer_retention"],
        [
          DiagnosisType.TRUST_QUALITY_CRISIS,
          DiagnosisType.CUSTOMER_RETENTION_EROSION,
        ]
      );
      if (pattern) patterns.push(pattern);
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

    // Pattern 5: GTM Issues (market + customer)
    if (
      dimensions.includes("market_position") &&
      dimensions.includes("customer_retention")
    ) {
      const pattern = this.checkPattern(
        evidence,
        ["market_position", "customer_retention"],
        [DiagnosisType.GO_TO_MARKET_MISALIGNMENT]
      );
      if (pattern) patterns.push(pattern);
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
