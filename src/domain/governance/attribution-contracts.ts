import { z } from "zod";

/**
 * PHASE G-8: ATTRIBUTION CONFIDENCE ENGINE
 *
 * Prevent false causality and fake learning.
 * NO automatic learning from uncertain attribution.
 */

export const AttributionConfidenceSchema = z.enum([
  "STRONGLY_ATTRIBUTABLE",
  "PARTIALLY_ATTRIBUTABLE",
  "WEAKLY_ATTRIBUTABLE",
  "NON_ATTRIBUTABLE",
  "CONTRADICTORY_ATTRIBUTION",
]);

export type AttributionConfidence = z.infer<typeof AttributionConfidenceSchema>;

export const AttributionAnalysisSchema = z.object({
  recommendation_id: z.string().min(1),
  outcome_id: z.string().min(1),
  attribution_confidence: AttributionConfidenceSchema,
  attribution_score: z.number().min(0).max(1),
  intervention_window_days: z.number().min(1),
  concurrent_changes: z.array(z.string()).default([]),
  environmental_changes: z.array(z.string()).default([]),
  operator_overrides: z.array(z.string()).default([]),
  competing_recommendations: z.array(z.string()).default([]),
  execution_completeness: z.number().min(0).max(1),
  temporal_proximity_score: z.number().min(0).max(1),
  measurement_quality_score: z.number().min(0).max(1),
  survivorship_bias_risk: z.boolean(),
  false_reinforcement_risk: z.boolean(),
  recommendation_reliability_delta: z.number().min(-100).max(100),
  blocking: z.boolean(),
  require_manual_review: z.boolean(),
  analysis_date: z.date(),
});

export type AttributionAnalysis = z.infer<typeof AttributionAnalysisSchema>;

export const AttributionScoreFactorsSchema = z.object({
  temporal_factor: z.number().min(0).max(1),
  execution_factor: z.number().min(0).max(1),
  isolation_factor: z.number().min(0).max(1),
  measurement_factor: z.number().min(0).max(1),
  competing_factor: z.number().min(0).max(1),
});

export type AttributionScoreFactors = z.infer<typeof AttributionScoreFactorsSchema>;
