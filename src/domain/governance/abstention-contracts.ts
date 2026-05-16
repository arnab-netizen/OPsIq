import { z } from "zod";

/**
 * PHASE G-6: OPERATOR SAFETY + DECISION ABSTENTION
 *
 * System must safely refuse unsafe recommendations.
 * Explicit uncertainty beats false confidence.
 */

export const AbstentionStateSchema = z.enum([
  "INSUFFICIENT_EVIDENCE",
  "HIGH_RISK_UNCERTAIN",
  "CONFLICTING_SIGNALS",
  "OUTSIDE_VALID_SCOPE",
  "EXPIRED_ASSUMPTIONS",
  "MISSING_PRECONDITIONS",
  "CONTRADICTORY_EVIDENCE",
  "OPERATOR_CAPACITY_EXCEEDED",
]);

export type AbstentionState = z.infer<typeof AbstentionStateSchema>;

export const AbstentionMetadataSchema = z.object({
  reason: z.string().min(1, "Abstention reason required"),
  blocking_factors: z.array(z.string()).min(1, "At least one blocking factor required"),
  missing_evidence: z.array(z.string()).default([]),
  violated_constraints: z.array(z.string()).default([]),
  confidence_score: z.number().min(0).max(1),
  escalation_required: z.boolean(),
  safe_fallback_action: z.string().optional(),
  review_trigger: z.string().optional(),
  review_date: z.date().optional(),
});

export type AbstentionMetadata = z.infer<typeof AbstentionMetadataSchema>;

export const AbstentionDecisionSchema = z.object({
  recommendation_id: z.string().min(1),
  abstention_state: AbstentionStateSchema,
  metadata: AbstentionMetadataSchema,
  timestamp: z.date(),
  actor: z.string().min(1, "Actor required"),
  immutable: z.boolean().default(true),
});

export type AbstentionDecision = z.infer<typeof AbstentionDecisionSchema>;

export const UnsafeConditionSchema = z.object({
  condition_type: z.enum([
    "LOW_CONFIDENCE",
    "MISSING_EVIDENCE",
    "CONTRADICTORY_EVIDENCE",
    "EXPIRED_ASSUMPTIONS",
    "SCOPE_MISMATCH",
    "PRECONDITION_UNMET",
    "HIGH_IRREVERSIBILITY",
    "CAPACITY_OVERLOAD",
    "CONFLICTING_RECOMMENDATIONS",
  ]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  description: z.string(),
  blocking: z.boolean(),
});

export type UnsafeCondition = z.infer<typeof UnsafeConditionSchema>;
