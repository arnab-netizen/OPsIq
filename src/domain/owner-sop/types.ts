/**
 * Owner SOP & Execution Accountability (Module 7) — shared types for the
 * deterministic execution engine.
 *
 * Pure types only: no DB, no I/O, no LLM. Every snapshot input is optional at the
 * type level; the engine treats missing/invalid numbers as `null` (missing) and
 * never invents a value. `null` on a derived metric means "not computable from the
 * provided data". SOP/execution is an EXECUTION domain (accountability,
 * follow-through, repeatability) — its risk drives executionRiskScore, distinct
 * from the survival/growth lenses.
 */

export const SOP_BUSINESS_MODELS = ["service", "inventory", "hybrid"] as const;
export type SopBusinessModel = (typeof SOP_BUSINESS_MODELS)[number];

/** Execution state, most disciplined to total breakdown. */
export const EXECUTION_STATES = ["DISCIPLINED", "ON_TRACK", "SLIPPING", "UNRELIABLE", "BREAKDOWN"] as const;
export type ExecutionState = (typeof EXECUTION_STATES)[number];

/** Action-class hierarchy for execution-accountability work. */
export const SOP_TIERS = ["rescue", "recovery", "growth", "optimization"] as const;
export type SopTier = (typeof SOP_TIERS)[number];

/**
 * Raw execution-accountability snapshot entered by the owner for one reporting
 * period. Models only business-operational accountability variables (follow-through,
 * overdue work, repeated failures, SOP coverage) — never personality or mental
 * health.
 */
export interface SopSnapshotInput {
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  currency: string;
  businessModel?: SopBusinessModel;
  industryTemplate?: string;

  // Action throughput / follow-through
  actionsAssigned?: number;
  actionsCompleted?: number;
  actionsVerified?: number;
  actionsOverdue?: number;

  // Accountability friction
  actionsDisputed?: number;
  actionsReassigned?: number;
  repeatedFailures?: number; // actions that failed again after a prior attempt

  // Proof discipline
  proofRequired?: number; // completed actions that required proof
  proofProvided?: number;

  // SOP coverage
  recurringProcesses?: number; // recurring processes that should have a documented SOP
  documentedSops?: number; // recurring processes that actually have one

  notes?: string;
}

/**
 * Deterministic derived execution metrics. Ratio metrics are `number | null`
 * (`null` = not computable). Composite scores are always `0..100`; their
 * trustworthiness is carried by `dataConfidenceScore`.
 */
export interface SopDerivedMetrics {
  currency: string;
  currencyValid: boolean;

  completionRatePct: number | null;
  verificationRatePct: number | null;
  overdueRatePct: number | null;
  disputeRatePct: number | null;
  reassignmentRatePct: number | null;
  repeatedFailureRatePct: number | null;
  proofCompliancePct: number | null;
  sopCoveragePct: number | null;

  executionHealthScore: number; // 0..100
  executionRiskScore: number; // 0..100
  executionOpportunityScore: number; // 0..100
  dataConfidenceScore: number; // 0..100

  executionState: ExecutionState;
  executionTier: SopTier;

  missingRequiredInputs: string[];
}
