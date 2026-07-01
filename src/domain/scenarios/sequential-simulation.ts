/**
 * SEQUENTIAL SIMULATION CONTRACT — the typed shape for a multi-day/multi-week business simulation (7–30
 * ordered events) that exercises time, proof, reassessment, expected-vs-actual outcome, owner workload, and
 * business outcome across a sequence. Schema only (the planned 50 simulations replay through the EXISTING
 * runtime with time advanced deterministically via inputs — no `Date.now`, no new engine).
 */
import { z } from "zod";
import { ACTION_STATUSES } from "./business-reality-scenario";

export const SIMULATION_KINDS = [
  "normal_week", "slow_leak", "growth", "staff_gaming", "cash_crisis_recovery",
  "customer_vendor_escalation", "owner_on_ship", "extreme_crisis",
] as const;

const simulationEventSchema = z.object({
  eventId: z.string().min(2),
  /** Ordinal day/step in the sequence (deterministic; not wall-clock). */
  dayIndex: z.number().int().min(0),
  payload: z.string().min(2),
  expectedDecision: z.enum(ACTION_STATUSES),
  expectedProof: z.array(z.string()),
  /** True where this event is a scheduled reassessment point. */
  reassessmentPoint: z.boolean(),
  /** Expected outcome vs the earlier expectation, when an actual can be observed at this event. */
  expectedActualVsExpected: z.enum(["not_yet", "on_track", "positive_variance", "negative_variance"]),
  expectedLearningOrAdjudication: z.enum(["none", "local_learning_candidate", "adjudication_item", "regression"]),
  expectedOwnerWorkloadChange: z.enum(["down", "flat", "up"]),
});

export const sequentialSimulationSchema = z.object({
  simulationId: z.string().min(3),
  kind: z.enum(SIMULATION_KINDS),
  startingBusinessState: z.string().min(4),
  events: z.array(simulationEventSchema).min(7).max(30),
  finalExpectedState: z.string().min(4),
  /** A simulation NEVER claims a live business outcome (no live data). */
  liveOutcomeClaimAllowed: z.literal(false),
})
  // Every simulation must contain at least one reassessment point (time + reassessment coverage).
  .refine((s) => s.events.some((e) => e.reassessmentPoint), { message: "simulation needs a reassessment point" })
  // Event days must be non-decreasing (a real sequence).
  .refine((s) => s.events.every((e, i) => i === 0 || e.dayIndex >= s.events[i - 1].dayIndex), { message: "events must be time-ordered" });

export type SequentialSimulation = z.infer<typeof sequentialSimulationSchema>;
export type SimulationEvent = z.infer<typeof simulationEventSchema>;
