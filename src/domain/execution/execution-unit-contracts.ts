import { z } from "zod";

/**
 * PHASE H-1: EXECUTION UNIT CONTRACT
 *
 * Transform recommendations into executable operational work units.
 */

export const ExecutionStateSchema = z.enum([
  "NOT_STARTED",
  "READY",
  "BLOCKED",
  "IN_PROGRESS",
  "WAITING_EXTERNAL",
  "VERIFYING",
  "COMPLETED",
  "FAILED",
  "ABANDONED",
  "ROLLED_BACK",
  "ESCALATED",
]);

export type ExecutionState = z.infer<typeof ExecutionStateSchema>;

export const ExecutionComplexitySchema = z.enum([
  "TRIVIAL",
  "SIMPLE",
  "MODERATE",
  "COMPLEX",
  "VERY_COMPLEX",
]);

export type ExecutionComplexity = z.infer<typeof ExecutionComplexitySchema>;

export const ExecutionUnitSchema = z.object({
  execution_id: z.string().min(1),
  recommendation_id: z.string().min(1),
  workspace_id: z.string().min(1),
  execution_state: ExecutionStateSchema.default("NOT_STARTED"),
  operator_owner: z.string().min(1),
  created_at: z.date(),
  due_date: z.date().optional(),
  execution_deadline: z.date().optional(),
  estimated_duration_minutes: z.number().min(1),
  execution_complexity: ExecutionComplexitySchema,
  execution_energy_cost: z.number().min(0).max(100),
  required_tools: z.array(z.string()).default([]),
  required_people: z.array(z.string()).default([]),
  required_budget: z.number().min(0).default(0),
  dependencies: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  rollback_plan: z.string().optional(),
  rollback_cost: z.number().min(0).default(0),
  rollback_time_minutes: z.number().min(0).default(0),
  verification_method: z.string(),
  success_metric: z.string(),
  stop_condition: z.string().optional(),
  escalation_trigger: z.string().optional(),
  evidence_required: z.array(z.string()).default([]),
  execution_notes: z.array(z.string()).default([]),
  execution_attempts: z.number().min(0).default(0),
  immutable: z.boolean().default(true),
});

export type ExecutionUnit = z.infer<typeof ExecutionUnitSchema>;

export const ExecutionOutcomeSchema = z.object({
  execution_id: z.string(),
  outcome_state: z.enum([
    "VERIFIED_SUCCESS",
    "PARTIAL_SUCCESS",
    "NO_MEASURABLE_CHANGE",
    "NEGATIVE_OUTCOME",
    "UNVERIFIED",
    "INCONCLUSIVE",
  ]),
  actual_duration_minutes: z.number().min(0),
  evidence_collected: z.array(z.string()),
  kpi_movement: z.record(z.number()).optional(),
  notes: z.string().optional(),
  recorded_at: z.date(),
});

export type ExecutionOutcome = z.infer<typeof ExecutionOutcomeSchema>;
