/**
 * BUSINESS SIMULATION CONTRACT — the typed schema for a multi-event, time-ordered business SIMULATION (Pack 10,
 * Step 7 of the known-to-unknown corpus). This is NEW, additive, self-contained groundwork: it defines the concrete
 * `BusinessSimulation` / `SimulationEvent` interface so the sequential-simulations pack (and any later outcome-loop
 * module) has a stable contract and does not require a rewrite. It does NOT touch `business-reality-scenario.ts` or
 * any engine.
 *
 * A simulation is a sequence of 7–30 events; each event carries a deterministic `ScenarioSeedPlan` (the exact
 * primitive the single-scenario packs proved) so the REAL `getOwnerWholeBusinessPlan` DB path resolves the event's
 * expected decision. The simulation tracks starting state → per-event decisions → final state, plus an expected
 * actual-vs-expected note (expected-only, never proven-actual), a governed learning note (no promotion), a failure
 * condition, and a recovery path.
 */
import { z } from "zod";
import { CONSTRAINTS } from "../../behavioral-validation/whole-business/arbitration";
import type { ScenarioSeedPlan } from "../../behavioral-validation/chaos-replay/chaos-ledger";

export const SIMULATION_ACTION_STATUSES = ["blocked", "need_more_data", "owner_decision_required", "cautious_proceed", "proceed"] as const;

export const SIMULATION_CATEGORIES = [
  "normal_week", "slow_leakage", "growth", "staff_proof_gaming", "cash_crisis",
  "customer_vendor", "owner_unavailable", "extreme_crisis",
] as const;
export type SimulationCategory = (typeof SIMULATION_CATEGORIES)[number];

/** Zod mirror of the proven `ScenarioSeedPlan` primitive (kept structurally identical). */
export const simulationSeedSchema = z.object({
  dominant: z.enum(CONSTRAINTS),
  goodBadUgly: z.enum(["good", "bad", "ugly"]),
  sopRiskClass: z.enum(["low", "medium"]).optional(),
  stripCriticalData: z.boolean().optional(),
});

export const simulationEventSchema = z.object({
  eventId: z.string().min(3),
  sequenceIndex: z.number().int().nonnegative(),
  dayOffset: z.number().int().nonnegative(),
  title: z.string().min(4),
  seed: simulationSeedSchema,
  expectedDecision: z.enum(SIMULATION_ACTION_STATUSES),
  expectedDominant: z.enum(CONSTRAINTS),
  expectedProofRequired: z.array(z.string()).min(1),
  expectedReassessment: z.array(z.string()).min(1),
  workloadImpact: z.enum(["low", "medium", "high"]),
});
export type SimulationEvent = z.infer<typeof simulationEventSchema> & { seed: ScenarioSeedPlan };

export const businessSimulationSchema = z.object({
  simulationId: z.string().min(3),
  category: z.enum(SIMULATION_CATEGORIES),
  startingState: z.string().min(8),
  events: z.array(simulationEventSchema).min(7).max(30),
  expectedFinalState: z.string().min(8),
  /** Expected only — never a proven actual (no live data). */
  expectedActualVsExpected: z.string().min(8),
  /** Governed re-evaluation observation — NOT a promotion to any global brain. */
  expectedLearning: z.string().min(8),
  failureCondition: z.string().min(8),
  recoveryPath: z.string().min(8),
  sourceRefs: z.array(z.string()).min(1),
  independentGold: z.boolean(),
  countedForReadiness: z.boolean(),
  synthetic: z.boolean(),
  liveDataBacked: z.boolean(),
})
  // Event ids are unique within a simulation.
  .refine((s) => new Set(s.events.map((e) => e.eventId)).size === s.events.length, { message: "event ids must be unique" })
  // Sequence indices are strictly monotonic 0..n-1.
  .refine((s) => s.events.every((e, i) => e.sequenceIndex === i), { message: "sequenceIndex must be 0..n-1 in order" })
  // Day offsets are non-decreasing (time only moves forward).
  .refine((s) => s.events.every((e, i) => i === 0 || e.dayOffset >= s.events[i - 1].dayOffset), { message: "dayOffset must be non-decreasing" })
  // A counted simulation is never live-data-backed and never claims proven actual.
  .refine((s) => !s.liveDataBacked, { message: "simulations are not live-data-backed" })
  // A synthetic simulation can never be counted toward readiness.
  .refine((s) => !s.synthetic || !s.countedForReadiness, { message: "synthetic simulation cannot be counted" })
  // The actual-vs-expected note must carry the expected-only honesty marker.
  .refine((s) => /expected only|not proven|not a proven actual/i.test(s.expectedActualVsExpected), { message: "actual-vs-expected must be labelled expected-only" });

export type BusinessSimulation = z.infer<typeof businessSimulationSchema> & { events: SimulationEvent[] };
