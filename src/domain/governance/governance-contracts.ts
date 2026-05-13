import { z } from "zod";

/**
 * PHASE G GOVERNANCE BACKBONE
 *
 * Deterministic recommendation lifecycle and operational safeguards.
 * No adaptive optimization, no self-learning, no automatic causality inference.
 * Bounded reasoning, fail-closed execution, auditability.
 */

// ============================================================================
// LIFECYCLE STATE MACHINE
// ============================================================================

export const RecommendationStateSchema = z.enum([
  "DRAFT",
  "NEEDS_EVIDENCE",
  "READY_FOR_REVIEW",
  "APPROVED",
  "ACTIVE",
  "EXECUTING",
  "COMPLETED",
  "REJECTED",
  "ABSTAINED",
  "BLOCKED",
  "STALE",
  "INVALIDATED",
  "SUPERSEDED",
  "ARCHIVED",
]);

export type RecommendationState = z.infer<typeof RecommendationStateSchema>;

// Allowed transitions (fail-closed on illegal)
export const ALLOWED_TRANSITIONS: Record<RecommendationState, RecommendationState[]> = {
  DRAFT: ["NEEDS_EVIDENCE", "REJECTED"],
  NEEDS_EVIDENCE: ["READY_FOR_REVIEW", "REJECTED", "DRAFT"],
  READY_FOR_REVIEW: ["APPROVED", "REJECTED", "NEEDS_EVIDENCE"],
  APPROVED: ["ACTIVE", "REJECTED"],
  ACTIVE: ["EXECUTING", "STALE", "BLOCKED", "INVALIDATED"],
  EXECUTING: ["COMPLETED", "BLOCKED", "INVALIDATED"],
  COMPLETED: ["ARCHIVED"],
  REJECTED: ["ARCHIVED"],
  ABSTAINED: ["ARCHIVED"],
  BLOCKED: ["ACTIVE", "INVALIDATED", "ARCHIVED"],
  STALE: ["INVALIDATED", "ARCHIVED"],
  INVALIDATED: ["ARCHIVED"],
  SUPERSEDED: ["ARCHIVED"],
  ARCHIVED: [],
};

export const StateTransitionSchema = z.object({
  recommendation_id: z.string().min(1),
  from_state: RecommendationStateSchema,
  to_state: RecommendationStateSchema,
  reason: z.string().min(1, "Transition reason required"),
  actor: z.string().min(1, "Actor/source required"),
  timestamp: z.date(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type StateTransition = z.infer<typeof StateTransitionSchema>;

// ============================================================================
// PRECONDITION ENGINE
// ============================================================================

export const PreconditionSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "EVIDENCE_REQUIRED",
    "ASSUMPTION_VALID",
    "DEPENDENCY_SATISFIED",
    "ENVIRONMENT_CONSTRAINT",
    "EXECUTION_PREREQUISITE",
  ]),
  description: z.string().min(1),
  is_satisfied: z.boolean(),
  checked_at: z.date(),
  check_result: z.string().optional(),
  blocking: z.boolean().default(true), // If true, blocks execution
});

export type Precondition = z.infer<typeof PreconditionSchema>;

// ============================================================================
// SCOPE ENFORCEMENT
// ============================================================================

export const ScopeSchema = z.object({
  geography: z.array(z.string()).min(1, "At least one geography required"),
  business_types: z.array(z.enum(["SAAS", "ECOMMERCE", "SERVICES", "MANUFACTURING", "CONSULTING"])),
  customer_segments: z.array(z.enum(["SMB", "MID_MARKET", "ENTERPRISE", "STARTUP"])),
  maturity_levels: z.array(z.enum(["EARLY_STAGE", "SCALING", "MATURE", "DECLINING"])),
  operational_scales: z.array(z.enum(["SMALL", "MEDIUM", "LARGE", "ENTERPRISE"])),
});

export type Scope = z.infer<typeof ScopeSchema>;

export const ScopeValidationResultSchema = z.object({
  is_valid: z.boolean(),
  out_of_scope_reasons: z.array(z.string()),
  confidence_impact: z.number().min(-100).max(0), // Negative adjustment
});

export type ScopeValidationResult = z.infer<typeof ScopeValidationResultSchema>;

// ============================================================================
// CONSTRAINT PRECEDENCE
// ============================================================================

export const ConstraintPrioritySchema = z.enum([
  "SURVIVAL",
  "COMPLIANCE",
  "CASHFLOW",
  "OPERATIONAL_STABILITY",
  "GROWTH",
]);

export type ConstraintPriority = z.infer<typeof ConstraintPrioritySchema>;

export const CONSTRAINT_PRECEDENCE: Record<ConstraintPriority, number> = {
  SURVIVAL: 5,
  COMPLIANCE: 4,
  CASHFLOW: 3,
  OPERATIONAL_STABILITY: 2,
  GROWTH: 1,
};

export const ConstraintConflictSchema = z.object({
  recommendation_id_a: z.string(),
  recommendation_id_b: z.string(),
  constraint_priority_a: ConstraintPrioritySchema,
  constraint_priority_b: ConstraintPrioritySchema,
  conflict_type: z.enum(["COMPATIBLE", "TENSION", "DIRECT_CONFLICT", "MUTUALLY_EXCLUSIVE"]),
  resolution: z.enum(["SUPPRESS_LOWER", "ESCALATE", "BUFFER", "SEQUENCE"]),
  suppressed_recommendation_id: z.string().optional(),
});

export type ConstraintConflict = z.infer<typeof ConstraintConflictSchema>;

// ============================================================================
// CHANGE LEDGER
// ============================================================================

export const ChangeEventSchema = z.object({
  event_id: z.string().min(1),
  recommendation_id: z.string().min(1),
  event_type: z.enum([
    "STATE_TRANSITION",
    "CONFIDENCE_CHANGE",
    "PRIORITY_CHANGE",
    "EVIDENCE_CHANGE",
    "ASSUMPTION_INVALIDATION",
    "SCOPE_CHANGE",
    "OPERATOR_OVERRIDE",
    "RECOMMENDATION_WITHDRAWAL",
  ]),
  timestamp: z.date(),
  actor: z.string().min(1),
  details: z.record(z.string(), z.any()),
  immutable: z.boolean().default(true),
});

export type ChangeEvent = z.infer<typeof ChangeEventSchema>;
