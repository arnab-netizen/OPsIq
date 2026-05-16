import { z } from "zod";

/**
 * PHASE G-7: ASSUMPTION PROVENANCE + VALIDITY
 *
 * Every assumption must be traceable, scoped, and expirable.
 */

export const AssumptionSourceTypeSchema = z.enum([
  "HISTORICAL_DATA",
  "EXPERT_OPINION",
  "MARKET_DATA",
  "CUSTOMER_FEEDBACK",
  "INTERNAL_METRIC",
  "SIMULATION",
  "PEER_BENCHMARK",
  "REGULATORY_REQUIREMENT",
  "HEURISTIC",
  "ASSUMPTION_DEPENDENCY",
]);

export type AssumptionSourceType = z.infer<typeof AssumptionSourceTypeSchema>;

export const AssumptionValidationStatusSchema = z.enum([
  "VALID",
  "STALE",
  "INVALIDATED",
  "CONTRADICTED",
  "SUPERSEDED",
  "PENDING_REVALIDATION",
]);

export type AssumptionValidationStatus = z.infer<typeof AssumptionValidationStatusSchema>;

export const AssumptionSchema = z.object({
  assumption_id: z.string().min(1),
  statement: z.string().min(1),
  source: z.string().min(1),
  source_type: AssumptionSourceTypeSchema,
  source_timestamp: z.date(),
  confidence: z.number().min(0).max(1),
  geography_scope: z.array(z.string()).min(1),
  business_scope: z.array(z.string()).min(1),
  segment_scope: z.array(z.string()).min(1),
  maturity_scope: z.array(z.string()).min(1),
  expiry_date: z.date(),
  validation_status: AssumptionValidationStatusSchema.default("VALID"),
  contradiction_refs: z.array(z.string()).default([]),
  superseded_by: z.string().optional(),
  evidence_refs: z.array(z.string()).default([]),
  created_at: z.date(),
  last_validated_at: z.date().optional(),
});

export type Assumption = z.infer<typeof AssumptionSchema>;

export const AssumptionValidationResultSchema = z.object({
  assumption_id: z.string(),
  is_valid: z.boolean(),
  validation_status: AssumptionValidationStatusSchema,
  confidence_adjustment: z.number().min(-100).max(0),
  expiration_days_remaining: z.number(),
  scope_valid: z.boolean(),
  scope_mismatches: z.array(z.string()).default([]),
  contradictions_found: z.number().default(0),
  requires_revalidation: z.boolean(),
  revalidation_deadline: z.date().optional(),
});

export type AssumptionValidationResult = z.infer<typeof AssumptionValidationResultSchema>;
