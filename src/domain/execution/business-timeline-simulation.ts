/**
 * Long-running business timeline simulation (PASS 47) — PURE, deterministic, no I/O.
 *
 * This is NOT a new decision engine and it invents NO business logic. It is a
 * scenario DRIVER: it holds an evolving business state, applies a chronological
 * sequence of events to it, and on each tick DELEGATES every decision to the
 * existing governed engines:
 *   - planBusinessSurvivalRecovery  (survival/crisis top action + severity ladder + gates)
 *   - assessGrowthReadiness          (fail-closed growth gate via the progression engine)
 *   - evaluateConditionTransition    (adaptive re-assessment trigger)
 *   - evaluateDoNotRepeat            (decision memory: do not repeat failed advice)
 *
 * The growth signals and crisis inputs are DERIVED from one coherent state so the
 * modules cannot contradict each other (weak/unknown cash ⇒ growth blocked, etc.).
 *
 * Truth rules honoured: no fabricated money/ROI/profit/win-probability, no hidden
 * score beyond a transparent 0-100 condition score, no autonomous external action,
 * no staff blame/discipline. A clean control with no events yields no crisis and
 * fabricates nothing (planBusinessSurvivalRecovery returns null).
 */

import {
  planBusinessSurvivalRecovery,
  type CrisisInput,
  type SurvivalRecoveryPlan,
  type Pressure,
  type OpportunityTemptation,
} from "@/domain/owner-mode/business-survival-recovery";
import { assessGrowthReadiness, GrowthReadiness } from "@/domain/execution/growth-readiness";
import { ProgressionMove, type GrowthSignals } from "@/domain/execution/progression-engine";
import {
  evaluateConditionTransition,
  type ConditionTransition,
} from "@/domain/business-facts/business-condition-profile";
import { evaluateDoNotRepeat } from "@/domain/owner-mode/do-not-repeat";
import type { PublicArchetype } from "@/domain/owner-mode/public-signal-interpretation";

const PRESSURE_RANK: Record<Pressure, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

export type PressureKey =
  | "cash" | "revenue" | "customer" | "quality"
  | "operational" | "staffCapacity" | "ownerWorkload" | "legal";

export interface TimelineConstraints {
  cashRunwayKnown: boolean;
  feasibleNearTermRevenue: boolean;
  ownerCapitalAvailable: boolean;
  capacityFeasible: boolean;
  stabilizationProven: boolean;
}

export interface TimelineFlags {
  /** Real cash/margin figure has been captured (never assumed). */
  cashDataCollected: boolean;
  /** An SOP/training correction has been adopted with proof. */
  sopCorrectionProven: boolean;
  /** Complaints/rework are currently rising. */
  complaintsRising: boolean;
  /** Revenue is currently improving. */
  revenueImproving: boolean;
  /** Recurring owner firefighting has been delegated/routed away. */
  delegationInPlace: boolean;
}

/** The evolving business state. Everything the engines read is derived from here. */
export interface TimelineState {
  archetype: PublicArchetype;
  pressures: Record<PressureKey, Pressure>;
  temptation: OpportunityTemptation;
  missingData: string[];
  constraints: TimelineConstraints;
  flags: TimelineFlags;
  /** Memory: action keys whose prior attempt FAILED (must not be blindly repeated). */
  failedActionKeys: string[];
  /** Memory: action keys the owner explicitly DECLINED (must not be re-suggested unchanged). */
  ownerRejectedKeys: string[];
  /** Memory: how many times each missing-data item has recurred. */
  missingDataRecurrence: Record<string, number>;
}

export type TimelineEventKind =
  | "baseline"
  | "complaint"
  | "quality_defect"
  | "cash_pressure"
  | "area_worsens"
  | "failed_correction"
  | "owner_reject"
  | "owner_approve"
  | "staff_task_completed_with_evidence"
  | "weak_proof_submitted"
  | "reassessment"
  | "opportunity_appears"
  | "growth_block_check"
  | "sop_training_run"
  | "sop_training_completed_with_evidence"
  | "delegation"
  | "cash_data_collected"
  | "recovery_milestone"
  | "regression"
  | "loop_back_correction"
  | "stabilization_proven"
  | "thrive_eligibility_check"
  | "owner_approve_growth_experiment"
  | "repeat_failed_attempt"
  | "repeat_with_new_evidence"
  | "resuggest_rejected_attempt"
  | "clean_control";

export interface TimelineEvent {
  id: string;
  week: number;
  label: string;
  kind: TimelineEventKind;
  /** Absolute pressure settings applied this event. */
  pressureChanges?: Partial<Record<PressureKey, Pressure>>;
  temptation?: OpportunityTemptation;
  addMissingData?: string[];
  clearMissingData?: string[];
  constraints?: Partial<TimelineConstraints>;
  flags?: Partial<TimelineFlags>;
  /** Owner declined this action key (recorded in memory). */
  ownerRejectKey?: string;
  /** This action key's prior attempt failed (recorded in memory). */
  failActionKey?: string;
  /** New evidence / changed context clears this key from failed/rejected memory. */
  evidenceForKey?: string;
  /** Probe an action key against decision memory this tick. */
  probeKey?: string;
  /** Changed-context reason supplied with a probe (allows an override). */
  probeChangedContextReason?: string;
  /** Marks this tick as a governed reassessment cycle. */
  reassessment?: boolean;
}

export interface MemoryProbeResult {
  key: string;
  blocked: boolean;
  requiresChangedContextReason: boolean;
  reason: string | null;
}

export interface TimelineTick {
  week: number;
  eventId: string;
  label: string;
  kind: TimelineEventKind;
  crisisStatus: SurvivalRecoveryPlan["crisisStatus"] | "NO_CRISIS";
  topActionKey: string | null;
  topActionTitle: string | null;
  growthReadiness: GrowthReadiness;
  growthAllowed: boolean;
  growthBlockedReasons: string[];
  conditionStatus: string;
  conditionScore: number;
  requiresReassessment: boolean;
  transitionReason: string;
  strategyPhase: StrategyPhase;
  /** True when the plan's top action was suppressed because it repeats a failed action without new evidence. */
  repeatBlocked: boolean;
  memoryProbe: MemoryProbeResult | null;
  missingDataTasks: string[];
  missingDataRecurrenceEscalated: boolean;
  blockedUnsafeActions: string[];
  regressionDetected: boolean;
  plan: SurvivalRecoveryPlan | null;
}

export type StrategyPhase = "survive" | "stabilize" | "recover" | "grow" | "restructure";

const CONDITION_WEIGHTS: Record<PressureKey, number> = {
  cash: 10, customer: 6, quality: 5, operational: 5, staffCapacity: 5, ownerWorkload: 4, revenue: 4, legal: 4,
};

export function conditionScore(state: TimelineState): number {
  let score = 100;
  for (const key of Object.keys(CONDITION_WEIGHTS) as PressureKey[]) {
    score -= PRESSURE_RANK[state.pressures[key]] * CONDITION_WEIGHTS[key];
  }
  return Math.max(0, Math.min(100, score));
}

export function conditionStatus(state: TimelineState): string {
  const s = conditionScore(state);
  if (state.pressures.cash === "CRITICAL" || s < 40) return "critical";
  if (s < 55) return "stressed";
  if (s < 70) return "stable";
  if (s < 85) return "healthy";
  return "thriving";
}

export function initialTimelineState(archetype: PublicArchetype = "laundry_local_service"): TimelineState {
  return {
    archetype,
    pressures: {
      cash: "NONE", revenue: "NONE", customer: "NONE", quality: "NONE",
      operational: "NONE", staffCapacity: "NONE", ownerWorkload: "NONE", legal: "NONE",
    },
    temptation: "NONE",
    missingData: [],
    constraints: {
      cashRunwayKnown: false,
      feasibleNearTermRevenue: true,
      ownerCapitalAvailable: true,
      capacityFeasible: true,
      stabilizationProven: false,
    },
    flags: {
      cashDataCollected: false,
      sopCorrectionProven: false,
      complaintsRising: false,
      revenueImproving: false,
      delegationInPlace: false,
    },
    failedActionKeys: [],
    ownerRejectedKeys: [],
    missingDataRecurrence: {},
  };
}

/** Deterministically apply one event to the state, returning a new state (no mutation of the input). */
export function applyEvent(prev: TimelineState, event: TimelineEvent): TimelineState {
  const state: TimelineState = {
    ...prev,
    pressures: { ...prev.pressures },
    constraints: { ...prev.constraints },
    flags: { ...prev.flags },
    missingData: [...prev.missingData],
    failedActionKeys: [...prev.failedActionKeys],
    ownerRejectedKeys: [...prev.ownerRejectedKeys],
    missingDataRecurrence: { ...prev.missingDataRecurrence },
  };

  if (event.pressureChanges) {
    for (const [k, v] of Object.entries(event.pressureChanges) as [PressureKey, Pressure][]) {
      state.pressures[k] = v;
    }
  }
  if (event.temptation !== undefined) state.temptation = event.temptation;
  if (event.constraints) state.constraints = { ...state.constraints, ...event.constraints };
  if (event.flags) state.flags = { ...state.flags, ...event.flags };

  if (event.addMissingData) {
    for (const m of event.addMissingData) {
      if (!state.missingData.includes(m)) state.missingData.push(m);
      state.missingDataRecurrence[m] = (state.missingDataRecurrence[m] ?? 0) + 1;
    }
  }
  if (event.clearMissingData) {
    state.missingData = state.missingData.filter((m) => !event.clearMissingData!.includes(m));
  }

  if (event.ownerRejectKey && !state.ownerRejectedKeys.includes(event.ownerRejectKey)) {
    state.ownerRejectedKeys.push(event.ownerRejectKey);
  }
  if (event.failActionKey && !state.failedActionKeys.includes(event.failActionKey)) {
    state.failedActionKeys.push(event.failActionKey);
  }
  // New evidence / changed context clears the key from BOTH memories (it may now be re-attempted).
  if (event.evidenceForKey) {
    state.failedActionKeys = state.failedActionKeys.filter((k) => k !== event.evidenceForKey);
    state.ownerRejectedKeys = state.ownerRejectedKeys.filter((k) => k !== event.evidenceForKey);
  }

  return state;
}

export function deriveCrisisInput(state: TimelineState, crisisCaseId: string): CrisisInput {
  return {
    crisisCaseId,
    workspaceArchetype: state.archetype,
    cashPressure: state.pressures.cash,
    revenuePressure: state.pressures.revenue,
    customerPressure: state.pressures.customer,
    qualityPressure: state.pressures.quality,
    operationalPressure: state.pressures.operational,
    staffCapacityPressure: state.pressures.staffCapacity,
    ownerWorkloadPressure: state.pressures.ownerWorkload,
    legalContractTenderRisk: state.pressures.legal,
    opportunityTemptation: state.temptation,
    missingData: state.missingData,
    constraints: state.constraints,
  };
}

/** Growth signals are DERIVED from the same state so finance/growth cannot contradict. */
export function deriveGrowthSignals(state: TimelineState): GrowthSignals {
  const p = state.pressures;
  return {
    cashRunwayWeak: PRESSURE_RANK[p.cash] >= PRESSURE_RANK.MEDIUM || !state.constraints.cashRunwayKnown,
    grossMarginClear: state.flags.cashDataCollected,
    marginNegative: false,
    repeatCustomersStrong:
      PRESSURE_RANK[p.customer] < PRESSURE_RANK.MEDIUM && !state.flags.complaintsRising,
    staffQualityStable:
      PRESSURE_RANK[p.staffCapacity] < PRESSURE_RANK.MEDIUM && state.flags.sopCorrectionProven,
    ownerFirefightingDaily: PRESSURE_RANK[p.ownerWorkload] >= PRESSURE_RANK.HIGH,
    sopManagerLayerWorking: state.flags.sopCorrectionProven,
    complaintsOrReworkRising: state.flags.complaintsRising,
    capacityStressed:
      PRESSURE_RANK[p.staffCapacity] >= PRESSURE_RANK.HIGH || PRESSURE_RANK[p.operational] >= PRESSURE_RANK.HIGH,
    profitImpactVerified: state.flags.cashDataCollected && state.constraints.stabilizationProven,
    revenueGrowing: state.flags.revenueImproving,
    unknownSignals: state.missingData.slice(),
  };
}

function deriveStrategyPhase(
  state: TimelineState,
  plan: SurvivalRecoveryPlan | null,
  growthAllowed: boolean,
): StrategyPhase {
  if (plan?.unrecoverableRiskAssessment.unrecoverable) return "restructure";
  if (plan === null) return "grow"; // no crisis at all (clean/thriving)
  const p = state.pressures;
  const acutePressure =
    p.cash === "CRITICAL" ||
    PRESSURE_RANK[p.cash] >= PRESSURE_RANK.HIGH ||
    PRESSURE_RANK[p.customer] >= PRESSURE_RANK.HIGH ||
    PRESSURE_RANK[p.quality] >= PRESSURE_RANK.HIGH ||
    PRESSURE_RANK[p.operational] >= PRESSURE_RANK.HIGH;
  if (!state.constraints.stabilizationProven) return acutePressure ? "survive" : "stabilize";
  // Stabilization proven: recover until the real growth gate opens, then grow.
  return growthAllowed ? "grow" : "recover";
}

const MISSING_DATA_ESCALATION_THRESHOLD = 2;

export interface TimelineRunResult {
  ticks: TimelineTick[];
  finalState: TimelineState;
}

/**
 * Run a chronological event sequence through the real engines and return the per-tick
 * governed decisions plus the final state. Deterministic; safe to snapshot in tests.
 */
export function runTimeline(
  events: TimelineEvent[],
  archetype: PublicArchetype = "laundry_local_service",
): TimelineRunResult {
  let state = initialTimelineState(archetype);
  const ticks: TimelineTick[] = [];
  let prevStatus: string | null = null;
  let prevScore: number | null = null;
  let prevPrevScore: number | null = null;

  for (const event of events) {
    state = applyEvent(state, event);

    const plan =
      event.kind === "clean_control"
        ? planBusinessSurvivalRecovery(deriveCrisisInput(initialTimelineState(archetype), event.id))
        : planBusinessSurvivalRecovery(deriveCrisisInput(state, event.id));

    const growth = assessGrowthReadiness(deriveGrowthSignals(state), ProgressionMove.MARKETING_SCALE);

    const newStatus = conditionStatus(state);
    const newScore = conditionScore(state);
    const transition: ConditionTransition = evaluateConditionTransition(prevStatus, newStatus, prevScore, newScore);

    // Decision memory: never repeat a failed top action without new evidence.
    let repeatBlocked = false;
    if (plan && state.failedActionKeys.includes(plan.survivalTopAction.key)) {
      const decision = evaluateDoNotRepeat(
        { category: "do_not_repeat", blocksRepetition: true, memoryKey: plan.survivalTopAction.key },
        event.evidenceForKey === plan.survivalTopAction.key ? "new evidence supplied this cycle" : null,
      );
      repeatBlocked = decision.blocked;
    }

    // Explicit memory probe (used by repeat/resuggest events).
    let memoryProbe: MemoryProbeResult | null = null;
    if (event.probeKey) {
      const remembered =
        state.failedActionKeys.includes(event.probeKey) || state.ownerRejectedKeys.includes(event.probeKey);
      const decision = evaluateDoNotRepeat(
        { category: "do_not_repeat", blocksRepetition: remembered, memoryKey: event.probeKey },
        event.probeChangedContextReason ?? null,
      );
      memoryProbe = {
        key: event.probeKey,
        blocked: decision.blocked,
        requiresChangedContextReason: decision.requiresChangedContextReason,
        reason: decision.reason,
      };
    }

    const missingDataRecurrenceEscalated = Object.values(state.missingDataRecurrence).some(
      (n) => n >= MISSING_DATA_ESCALATION_THRESHOLD,
    );

    // Regression: a score drop that follows a genuine up-tick (worsening after
    // apparent improvement) — not the initial decline from a healthy baseline.
    const improvingBefore = prevScore !== null && prevPrevScore !== null && prevScore > prevPrevScore;
    const regressionDetected = prevScore !== null && improvingBefore && newScore < prevScore - 5;

    ticks.push({
      week: event.week,
      eventId: event.id,
      label: event.label,
      kind: event.kind,
      crisisStatus: plan ? plan.crisisStatus : "NO_CRISIS",
      topActionKey: plan ? plan.survivalTopAction.key : null,
      topActionTitle: plan ? plan.survivalTopAction.title : null,
      growthReadiness: growth.readiness,
      growthAllowed: growth.allowed,
      growthBlockedReasons: growth.blockedReasons,
      conditionStatus: newStatus,
      conditionScore: newScore,
      requiresReassessment: transition.requires_adaptive_reevaluation,
      transitionReason: transition.transition_reason,
      strategyPhase: deriveStrategyPhase(state, plan, growth.allowed),
      repeatBlocked,
      memoryProbe,
      missingDataTasks: plan ? plan.missingDataTasks : [],
      missingDataRecurrenceEscalated,
      blockedUnsafeActions: plan ? plan.blockedUnsafeActions : [],
      regressionDetected,
      plan,
    });

    prevStatus = newStatus;
    prevPrevScore = prevScore;
    prevScore = newScore;
  }

  return { ticks, finalState: state };
}
