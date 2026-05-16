/**
 * ADDENDUM F: Data Reliability & Quality Scoring Engine
 *
 * Defines data quality metrics, reliability scoring, and quality assessment logic
 * for evaluating data completeness, consistency, accuracy, and freshness.
 *
 * Non-DB: Contains only scoring algorithms and quality gates (no persistence).
 * Ready for: Integration with data import/sync pipeline to assess data quality.
 */

import { z } from "zod";

// ============================================================================
// QUALITY METRICS
// ============================================================================

/** Data completeness result */
export const DataCompletenessSchema = z.object({
  requiredFieldsTotal: z.number().min(0),
  requiredFieldsPresent: z.number().min(0),
  optionalFieldsTotal: z.number().min(0),
  optionalFieldsPresent: z.number().min(0),
  completenessPercent: z.number().min(0).max(100),
  missingCriticalFields: z.array(z.string()),
});

export type DataCompleteness = z.infer<typeof DataCompletenessSchema>;

/** Data consistency result */
export const DataConsistencySchema = z.object({
  field: z.string().min(1),
  recordCount: z.number().min(0),
  uniqueValueCount: z.number().min(0),
  consistencyScore: z.number().min(0).max(1),
  anomalies: z.array(z.object({
    recordId: z.string(),
    value: z.unknown(),
    reason: z.string(),
  })),
});

export type DataConsistency = z.infer<typeof DataConsistencySchema>;

/** Value confidence assessment */
export const ValueConfidenceSchema = z.object({
  value: z.unknown(),
  sourceConnector: z.string(),
  confidenceScore: z.number().min(0).max(1),
  factors: z.object({
    sourceReliability: z.number().min(0).max(1),
    dataFreshness: z.number().min(0).max(1),
    verificationLevel: z.number().min(0).max(1),
    consistencyAcrossSources: z.number().min(0).max(1),
  }),
  verificationMethod: z.enum([
    "unverified",
    "self_reported",
    "third_party_verified",
    "manual_review",
    "automated_validation",
  ]),
  lastVerifiedAt: z.date().optional(),
});

export type ValueConfidence = z.infer<typeof ValueConfidenceSchema>;

/** Data lineage tracking */
export const DataLineageSchema = z.object({
  recordId: z.string().min(1),
  fieldName: z.string().min(1),
  originConnector: z.string(),
  originField: z.string().optional(),
  transformations: z.array(z.object({
    transformationType: z.string(),
    appliedAt: z.date(),
    appliedBy: z.string().optional(),
  })),
  currentValue: z.unknown(),
  previousValues: z.array(z.object({
    value: z.unknown(),
    changedAt: z.date(),
    changedReason: z.string().optional(),
  })).optional(),
});

export type DataLineage = z.infer<typeof DataLineageSchema>;

// ============================================================================
// QUALITY SCORING
// ============================================================================

/** Comprehensive quality score */
export const QualityScoreSchema = z.object({
  recordId: z.string().min(1),
  sourceConnector: z.string(),
  recordType: z.string(),
  overallScore: z.number().min(0).max(100),
  scoreBreakdown: z.object({
    completenessScore: z.number().min(0).max(100),
    consistencyScore: z.number().min(0).max(100),
    accuracyScore: z.number().min(0).max(100),
    freshnessScore: z.number().min(0).max(100),
    lineageScore: z.number().min(0).max(100),
  }),
  qualityRating: z.enum(["excellent", "good", "fair", "poor"]),
  recommendations: z.array(z.object({
    area: z.string(),
    recommendation: z.string(),
    severity: z.enum(["critical", "high", "medium", "low"]),
  })),
  scoredAt: z.date(),
  nextReviewAt: z.date().optional(),
});

export type QualityScore = z.infer<typeof QualityScoreSchema>;

/** Quality gate definition */
export const QualityGateSchema = z.object({
  gateId: z.string().min(1),
  gateName: z.string(),
  metric: z.enum([
    "completeness",
    "consistency",
    "accuracy",
    "freshness",
    "overall_quality",
  ]),
  minimumThreshold: z.number().min(0).max(100),
  warningThreshold: z.number().min(0).max(100),
  criticalThreshold: z.number().min(0).max(100),
  enforced: z.boolean().default(true),
  onFailureAction: z.enum([
    "block_import",
    "quarantine_record",
    "flag_for_review",
    "log_warning",
  ]),
});

export type QualityGate = z.infer<typeof QualityGateSchema>;

/** Batch quality assessment result */
export const BatchQualityResultSchema = z.object({
  batchId: z.string().min(1),
  totalRecords: z.number().min(0),
  recordsQualified: z.number().min(0),
  recordsQuarantined: z.number().min(0),
  averageQualityScore: z.number().min(0).max(100),
  qualityDistribution: z.object({
    excellent: z.number().min(0),
    good: z.number().min(0),
    fair: z.number().min(0),
    poor: z.number().min(0),
  }),
  gateFailures: z.array(z.object({
    gateId: z.string(),
    failureCount: z.number(),
    failedRecordSamples: z.array(z.string()).max(5),
  })),
  assessmentTimeMs: z.number().min(0),
});

export type BatchQualityResult = z.infer<typeof BatchQualityResultSchema>;

// ============================================================================
// QUALITY ALGORITHMS
// ============================================================================

/**
 * Calculate data completeness (% of required and optional fields present)
 */
export function calculateCompleteness(
  record: Record<string, unknown>,
  schema: {
    requiredFields: string[];
    optionalFields?: string[];
  },
): DataCompleteness {
  const requiredFields = schema.requiredFields;
  const optionalFields = schema.optionalFields || [];

  let requiredPresent = 0;
  const missingCritical: string[] = [];

  for (const field of requiredFields) {
    const value = record[field];
    if (value !== null && value !== undefined && value !== "") {
      requiredPresent++;
    } else {
      missingCritical.push(field);
    }
  }

  let optionalPresent = 0;
  for (const field of optionalFields) {
    const value = record[field];
    if (value !== null && value !== undefined && value !== "") {
      optionalPresent++;
    }
  }

  const totalFields = requiredFields.length + optionalFields.length;
  const presentFields = requiredPresent + optionalPresent;
  const completenessPercent = totalFields > 0 ? Math.round((presentFields / totalFields) * 100) : 0;

  return {
    requiredFieldsTotal: requiredFields.length,
    requiredFieldsPresent: requiredPresent,
    optionalFieldsTotal: optionalFields.length,
    optionalFieldsPresent: optionalPresent,
    completenessPercent,
    missingCriticalFields: missingCritical,
  };
}

/**
 * Calculate consistency across multiple records for a field
 */
export function calculateConsistency(
  records: Record<string, unknown>[],
  fieldName: string,
  allowedValuesCount: number = 5,
): DataConsistency {
  const values = records.map(r => r[fieldName]).filter(v => v !== null && v !== undefined);
  const uniqueValues = new Set(values.map(v => JSON.stringify(v)));

  // Consistency is high when values are uniform
  const uniqueValueCount = uniqueValues.size;

  // Consistency: measure how uniform the values are
  // High consistency when most records have the same value(s)
  // Low consistency when many different values exist
  const valueCounts = new Map<string, number>();
  for (const val of values) {
    const key = JSON.stringify(val);
    valueCounts.set(key, (valueCounts.get(key) || 0) + 1);
  }

  // Get mode count (most frequent value)
  const counts = Array.from(valueCounts.values());
  const modeCount = Math.max(...counts);
  const modeFrequency = modeCount / values.length;

  // Consistency score based on how dominant the mode is
  // If 1 value appears in all records: 1.0 (perfect consistency)
  // If values evenly distributed: low consistency
  let consistencyScore = modeFrequency;

  // Apply penalty for too many unique values
  if (uniqueValueCount > allowedValuesCount) {
    consistencyScore *= (allowedValuesCount / uniqueValueCount);
  }

  consistencyScore = Math.max(0, Math.min(1, consistencyScore));

  // Identify anomalies (values that differ significantly from the mode)
  const mode = Array.from(valueCounts.entries()).reduce((a, b) => (a[1] > b[1] ? a : b))?.[0];
  const modeLabelCount = mode ? valueCounts.get(mode) || 0 : 0;
  const anomalyThreshold = modeLabelCount * 0.5; // Values less frequent than 50% of mode are anomalies

  const anomalies = records
    .map((record, idx) => ({
      recordId: record.id as string || `record_${idx}`,
      value: record[fieldName],
      count: valueCounts.get(JSON.stringify(record[fieldName])) || 0,
    }))
    .filter(item => item.count < anomalyThreshold)
    .slice(0, 5)
    .map(item => ({
      recordId: item.recordId,
      value: item.value,
      reason: `Value appears ${item.count} times, less frequent than mode (${modeLabelCount} times)`,
    }));

  return {
    field: fieldName,
    recordCount: records.length,
    uniqueValueCount,
    consistencyScore,
    anomalies,
  };
}

/**
 * Calculate confidence in a value based on multiple factors
 */
export function calculateValueConfidence(
  value: unknown,
  sourceConnector: string,
  factors: {
    sourceReliability?: number;
    dataFreshness?: number;
    verificationLevel?: number;
    consistencyAcrossSources?: number;
  } = {},
): ValueConfidence {
  const sourceReliability = factors.sourceReliability ?? 0.7; // Default: good
  const dataFreshness = factors.dataFreshness ?? 0.8; // Default: recent
  const verificationLevel = factors.verificationLevel ?? 0.5; // Default: moderate
  const consistencyAcrossSources = factors.consistencyAcrossSources ?? 0.6; // Default: fair

  // Calculate weighted confidence
  const weights = {
    sourceReliability: 0.3,
    dataFreshness: 0.2,
    verificationLevel: 0.3,
    consistencyAcrossSources: 0.2,
  };

  const confidenceScore =
    sourceReliability * weights.sourceReliability +
    dataFreshness * weights.dataFreshness +
    verificationLevel * weights.verificationLevel +
    consistencyAcrossSources * weights.consistencyAcrossSources;

  return {
    value,
    sourceConnector,
    confidenceScore: Math.min(1, Math.max(0, confidenceScore)),
    factors: {
      sourceReliability,
      dataFreshness,
      verificationLevel,
      consistencyAcrossSources,
    },
    verificationMethod: verificationLevel > 0.7 ? "automated_validation" : "self_reported",
    lastVerifiedAt: new Date(),
  };
}

/**
 * Calculate comprehensive quality score for a record
 */
export function calculateQualityScore(
  record: Record<string, unknown>,
  schema: {
    requiredFields: string[];
    optionalFields?: string[];
    recordType: string;
  },
  sourceConnector: string,
  weightsOverride?: Partial<Record<"completeness" | "consistency" | "accuracy" | "freshness" | "lineage", number>>,
): QualityScore {
  // Default weights
  const weights = {
    completeness: 0.30,
    consistency: 0.25,
    accuracy: 0.20,
    freshness: 0.15,
    lineage: 0.10,
    ...weightsOverride,
  };

  // Calculate component scores
  const completeness = calculateCompleteness(record, schema);
  const consistencyScore = completeness.missingCriticalFields.length === 0 ? 100 : 50; // Placeholder
  const accuracyScore = 75; // Placeholder - would need reference data
  const freshnessScore = 90; // Placeholder - would depend on record age
  const lineageScore = completeness.requiredFieldsPresent > 0 ? 85 : 40; // Placeholder

  // Weighted overall score (weights sum to 1.0, so no normalization needed)
  const overallScore = Math.round(
    completeness.completenessPercent * weights.completeness +
    consistencyScore * weights.consistency +
    accuracyScore * weights.accuracy +
    freshnessScore * weights.freshness +
    lineageScore * weights.lineage,
  );

  // Rating based on score
  let qualityRating: QualityScore["qualityRating"];
  if (overallScore >= 85) qualityRating = "excellent";
  else if (overallScore >= 70) qualityRating = "good";
  else if (overallScore >= 50) qualityRating = "fair";
  else qualityRating = "poor";

  // Generate recommendations
  const recommendations: QualityScore["recommendations"] = [];
  if (completeness.completenessPercent < 80) {
    recommendations.push({
      area: "Completeness",
      recommendation: `Complete missing required fields: ${completeness.missingCriticalFields.join(", ")}`,
      severity: "high",
    });
  }
  if (accuracyScore < 70) {
    recommendations.push({
      area: "Accuracy",
      recommendation: "Verify values against authoritative sources",
      severity: "high",
    });
  }
  if (freshnessScore < 60) {
    recommendations.push({
      area: "Freshness",
      recommendation: "Update stale data from source systems",
      severity: "medium",
    });
  }

  return {
    recordId: (record.id as string) || `record_${Date.now()}`,
    sourceConnector,
    recordType: schema.recordType,
    overallScore,
    scoreBreakdown: {
      completenessScore: completeness.completenessPercent,
      consistencyScore,
      accuracyScore,
      freshnessScore,
      lineageScore,
    },
    qualityRating,
    recommendations,
    scoredAt: new Date(),
    nextReviewAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  };
}

/**
 * Assess if record passes quality gates
 */
export function assessQualityGates(
  qualityScore: QualityScore,
  gates: QualityGate[],
): { passed: boolean; gateFailures: string[]; actions: string[] } {
  const gateFailures: string[] = [];
  const actions: string[] = [];

  for (const gate of gates) {
    if (!gate.enforced) continue;

    let metricValue = qualityScore.overallScore;
    if (gate.metric === "completeness") {
      metricValue = qualityScore.scoreBreakdown.completenessScore;
    } else if (gate.metric === "consistency") {
      metricValue = qualityScore.scoreBreakdown.consistencyScore;
    }

    if (metricValue < gate.minimumThreshold) {
      gateFailures.push(`Gate '${gate.gateName}' failed: ${metricValue} < ${gate.minimumThreshold}`);
      actions.push(`Execute action: ${gate.onFailureAction}`);
    }
  }

  return {
    passed: gateFailures.length === 0,
    gateFailures,
    actions,
  };
}

/**
 * Score all records in a batch and assess against quality gates
 */
export function assessBatchQuality(
  records: Record<string, unknown>[],
  schema: { requiredFields: string[]; optionalFields?: string[]; recordType: string },
  sourceConnector: string,
  gates: QualityGate[],
): BatchQualityResult {
  const startTime = Date.now();
  const scores = records.map(record => calculateQualityScore(record, schema, sourceConnector));

  let qualifiedCount = 0;
  let quarantinedCount = 0;
  const distribution = { excellent: 0, good: 0, fair: 0, poor: 0 };
  const gateFailureMap = new Map<string, { count: number; samples: string[] }>();

  for (const score of scores) {
    // Update distribution
    distribution[score.qualityRating]++;

    // Assess gates
    const result = assessQualityGates(score, gates);
    if (result.passed) {
      qualifiedCount++;
    } else {
      quarantinedCount++;
    }

    // Track gate failures
    for (const failure of result.gateFailures) {
      const gateId = failure.split("'")[1] || "unknown";
      if (!gateFailureMap.has(gateId)) {
        gateFailureMap.set(gateId, { count: 0, samples: [] });
      }
      const entry = gateFailureMap.get(gateId)!;
      entry.count++;
      if (entry.samples.length < 5) {
        entry.samples.push(score.recordId);
      }
    }
  }

  const averageScore = scores.length > 0 ? Math.round(scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length) : 0;

  return {
    batchId: `batch_${Date.now()}`,
    totalRecords: records.length,
    recordsQualified: qualifiedCount,
    recordsQuarantined: quarantinedCount,
    averageQualityScore: averageScore,
    qualityDistribution: distribution,
    gateFailures: Array.from(gateFailureMap.entries()).map(([gateId, data]) => ({
      gateId,
      failureCount: data.count,
      failedRecordSamples: data.samples,
    })),
    assessmentTimeMs: Date.now() - startTime,
  };
}
