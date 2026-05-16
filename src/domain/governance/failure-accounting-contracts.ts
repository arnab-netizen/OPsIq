import { z } from "zod";

/**
 * PHASE G-13: RECOMMENDATION FAILURE ACCOUNTING
 *
 * System must remember recommendation failures.
 * NO automatic learning, only measurement + accounting.
 */

export const OutcomeTypeSchema = z.enum([
  "SUCCESSFUL",
  "PARTIALLY_SUCCESSFUL",
  "UNSUCCESSFUL",
  "HARMFUL",
  "UNEXPECTED",
  "ABANDONED",
]);

export type OutcomeType = z.infer<typeof OutcomeTypeSchema>;

export const FailureAccountingSchema = z.object({
  recommendation_id: z.string().min(1),
  outcome_type: OutcomeTypeSchema,
  accepted: z.boolean(),
  executed: z.boolean(),
  predicted_outcome: z.string(),
  actual_outcome: z.string(),
  outcome_variance: z.number().min(-100).max(100),
  operator_override_reason: z.string().optional(),
  harmful_outcome: z.boolean(),
  unexpected_outcome: z.boolean(),
  attribution_confidence: z.enum([
    "STRONGLY_ATTRIBUTABLE",
    "PARTIALLY_ATTRIBUTABLE",
    "WEAKLY_ATTRIBUTABLE",
    "NON_ATTRIBUTABLE",
    "CONTRADICTORY_ATTRIBUTION",
  ]),
  recommendation_reliability_delta: z.number().min(-100).max(100),
  recorded_at: z.date(),
  measurement_quality: z.number().min(0).max(1),
});

export type FailureAccounting = z.infer<typeof FailureAccountingSchema>;

export const ReliabilityScoreSchema = z.object({
  recommendation_id: z.string(),
  total_outcomes_tracked: z.number().min(1),
  successful_count: z.number(),
  unsuccessful_count: z.number(),
  harmful_count: z.number(),
  success_rate: z.number().min(0).max(1),
  abandonment_rate: z.number().min(0).max(1),
  harm_rate: z.number().min(0).max(1),
  reliability_score: z.number().min(-1).max(1),
  attribution_confidence_avg: z.number().min(0).max(1),
  last_updated: z.date(),
});

export type ReliabilityScore = z.infer<typeof ReliabilityScoreSchema>;
