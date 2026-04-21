import type { EvidenceItem } from "@/domain/consulting-engine/types";
import { ConfidenceLevel } from "@/domain/consulting-engine/types";

/**
 * Evidence Engine: Validates and analyzes evidence for pattern recognition
 * and dimension mapping.
 *
 * Deterministic: no external calls, pure function.
 */

interface EvidenceDimension {
  name: string;
  weight: number;
  criticalThreshold: number;
}

const DIMENSION_CONFIG: Record<string, EvidenceDimension> = {
  customer_retention: {
    name: "Customer Retention",
    weight: 0.25,
    criticalThreshold: 2, // 2 critical pieces of evidence triggers priority
  },
  operational_efficiency: {
    name: "Operational Efficiency",
    weight: 0.3,
    criticalThreshold: 2,
  },
  quality_delivery: {
    name: "Quality Delivery",
    weight: 0.2,
    criticalThreshold: 2,
  },
  financial_health: {
    name: "Financial Health",
    weight: 0.15,
    criticalThreshold: 1,
  },
  process_maturity: {
    name: "Process Maturity",
    weight: 0.05,
    criticalThreshold: 3,
  },
  team_capability: {
    name: "Team Capability",
    weight: 0.03,
    criticalThreshold: 3,
  },
  market_position: {
    name: "Market Position",
    weight: 0.02,
    criticalThreshold: 3,
  },
};

export interface EvidenceAnalysis {
  validItems: EvidenceItem[];
  invalidItems: Array<{ evidence: Partial<EvidenceItem>; error: string }>;
  dimensionCoverage: Record<
    string,
    {
      count: number;
      highConfidenceCount: number;
      criticalCount: number;
      adequacy: "STRONG" | "MODERATE" | "WEAK" | "MISSING";
    }
  >;
  overallCoverage: "COMPREHENSIVE" | "ADEQUATE" | "INSUFFICIENT";
  criticalEvidenceGaps: string[];
  dominantDimensions: string[];
}

export function analyzeEvidence(
  rawEvidence: EvidenceItem[]
): EvidenceAnalysis {
  const validItems: EvidenceItem[] = [];
  const invalidItems: Array<{ evidence: Partial<EvidenceItem>; error: string }> = [];

  // Validate each evidence item
  for (const item of rawEvidence) {
    const validation = validateEvidenceItem(item);
    if (validation.valid) {
      validItems.push(item);
    } else {
      invalidItems.push({
        evidence: item,
        error: validation.error!,
      });
    }
  }

  // Build dimension coverage analysis
  const dimensionCoverage: Record<
    string,
    {
      count: number;
      highConfidenceCount: number;
      criticalCount: number;
      adequacy: "STRONG" | "MODERATE" | "WEAK" | "MISSING";
    }
  > = {};

  for (const dimension of Object.keys(DIMENSION_CONFIG)) {
    const itemsInDimension = validItems.filter(
      (e) => e.dimension === dimension
    );
    const highConfidence = itemsInDimension.filter(
      (e) => e.confidence === ConfidenceLevel.HIGH
    );
    const critical = itemsInDimension.filter((e) => e.isCritical);

    let adequacy: "STRONG" | "MODERATE" | "WEAK" | "MISSING";
    if (itemsInDimension.length === 0) {
      adequacy = "MISSING";
    } else if (
      itemsInDimension.length >= 3 &&
      highConfidence.length >= 2
    ) {
      adequacy = "STRONG";
    } else if (itemsInDimension.length >= 2) {
      adequacy = "MODERATE";
    } else {
      adequacy = "WEAK";
    }

    dimensionCoverage[dimension] = {
      count: itemsInDimension.length,
      highConfidenceCount: highConfidence.length,
      criticalCount: critical.length,
      adequacy,
    };
  }

  // Determine overall coverage
  const adequateOrBetter = Object.values(dimensionCoverage).filter(
    (d) => d.adequacy === "STRONG" || d.adequacy === "MODERATE"
  ).length;
  let overallCoverage: "COMPREHENSIVE" | "ADEQUATE" | "INSUFFICIENT";
  if (adequateOrBetter >= 5) {
    overallCoverage = "COMPREHENSIVE";
  } else if (adequateOrBetter >= 3) {
    overallCoverage = "ADEQUATE";
  } else {
    overallCoverage = "INSUFFICIENT";
  }

  // Identify critical gaps
  const criticalEvidenceGaps: string[] = [];
  for (const [dim, coverage] of Object.entries(dimensionCoverage)) {
    const config = DIMENSION_CONFIG[dim];
    if (coverage.adequacy === "MISSING" && config.weight > 0.15) {
      criticalEvidenceGaps.push(
        `Critical gap: No evidence on ${config.name}`
      );
    } else if (coverage.adequacy === "WEAK" && config.weight > 0.2) {
      criticalEvidenceGaps.push(
        `Weak evidence on ${config.name} - diagnosis confidence limited`
      );
    }
  }

  // Find dominant dimensions (highest coverage)
  const dominantDimensions = Object.entries(dimensionCoverage)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)
    .map(([dim]) => DIMENSION_CONFIG[dim].name);

  return {
    validItems,
    invalidItems,
    dimensionCoverage,
    overallCoverage,
    criticalEvidenceGaps,
    dominantDimensions,
  };
}

function validateEvidenceItem(
  item: EvidenceItem
): { valid: boolean; error?: string } {
  if (!item.id || !item.id.match(/^[0-9a-f-]{36}$/i)) {
    return { valid: false, error: "Invalid UUID format" };
  }
  if (!item.finding || item.finding.trim().length === 0) {
    return { valid: false, error: "Finding text required" };
  }
  if (!Object.values(ConfidenceLevel).includes(item.confidence)) {
    return {
      valid: false,
      error: `Invalid confidence level: ${item.confidence}`,
    };
  }
  if (!item.source || item.source.trim().length === 0) {
    return { valid: false, error: "Evidence source required" };
  }
  return { valid: true };
}

export function summarizeEvidenceByDimension(
  analysis: EvidenceAnalysis
): string {
  const lines: string[] = [];
  for (const dim of Object.keys(DIMENSION_CONFIG).sort()) {
    const coverage = analysis.dimensionCoverage[dim];
    const config = DIMENSION_CONFIG[dim];
    lines.push(
      `${config.name}: ${coverage.count} items (${coverage.highConfidenceCount} high-confidence, ${coverage.criticalCount} critical) - ${coverage.adequacy}`
    );
  }
  return lines.join("\n");
}
