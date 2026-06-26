/**
 * Module 25 — Business Continuity & Emergency (pure domain core).
 *
 * Business-operational continuity for an owner-run SMB: threats that could halt
 * the business (key-person loss, major client loss, cash shock, supply cutoff,
 * facility loss, regulatory shock), key-person dependency, and emergency cash
 * reserve adequacy. This is operational resilience — NOT IT disaster recovery and
 * NOT mental health. Surfaces unmitigated critical threats so OpsIQ can force a
 * contingency-plan review before a single shock can end the business.
 * Pure + deterministic.
 */

/** Clamp a numeric input to a finite non-negative value (0 otherwise). */
function nn(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/** Clamp a probability-like input into the 0..1 range. */
function clamp01(v: number | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export type ContinuityThreatType =
  | "key_person_loss"
  | "major_client_loss"
  | "cash_shock"
  | "supply_cutoff"
  | "facility_loss"
  | "regulatory_shock";

export type ImpactSeverity = "low" | "medium" | "high" | "critical";

export interface ContinuityThreat {
  type: ContinuityThreatType;
  /** Probability the threat materialises in the review horizon (0..1). */
  likelihood: number;
  impactSeverity: ImpactSeverity;
  /** A documented mitigation/contingency plan exists for this threat. */
  contingencyPlanExists: boolean;
}

export type ContinuityRiskLevel = "ACCEPTABLE" | "MONITOR" | "URGENT" | "CRITICAL";

const RISK_ORDER: ContinuityRiskLevel[] = ["ACCEPTABLE", "MONITOR", "URGENT", "CRITICAL"];
const SEVERITY_RANK: Record<ImpactSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/** Escalate a risk level by one band, capped at CRITICAL. */
function escalate(level: ContinuityRiskLevel): ContinuityRiskLevel {
  const i = RISK_ORDER.indexOf(level);
  return RISK_ORDER[Math.min(i + 1, RISK_ORDER.length - 1)];
}

/**
 * Classify a continuity threat by combining likelihood × severity, then escalating
 * one band when no documented contingency plan exists.
 */
export function assessContinuityThreat(threat: ContinuityThreat): ContinuityRiskLevel {
  const likelihood = clamp01(threat.likelihood);
  const severity = SEVERITY_RANK[threat.impactSeverity] ?? 0;

  // Exposure score on a 0..9 scale: severity (0..3) weighted by likelihood band (0..3).
  const likelihoodBand = likelihood >= 0.66 ? 3 : likelihood >= 0.33 ? 2 : likelihood > 0 ? 1 : 0;
  const exposure = severity * likelihoodBand;

  let level: ContinuityRiskLevel;
  if (exposure >= 6) level = "CRITICAL";
  else if (exposure >= 3) level = "URGENT";
  else if (exposure >= 1) level = "MONITOR";
  else level = "ACCEPTABLE";

  if (!threat.contingencyPlanExists) level = escalate(level);
  return level;
}

export type KeyPersonRiskBand = "LOW" | "MEDIUM" | "HIGH";

export interface KeyPersonInput {
  /** Total people who can run the business (including the owner). */
  headcount: number;
  /** Share of critical tasks the owner personally performs (0..1). */
  ownerCriticalTasksPct: number;
  /** A trained successor/backup is documented for the owner's critical tasks. */
  documentedSuccessor: boolean;
}

/**
 * Key-person dependency band. High when the owner does most critical tasks and no
 * successor is documented; a documented successor caps the risk down one band.
 */
export function keyPersonRisk(input: KeyPersonInput): KeyPersonRiskBand {
  const headcount = nn(input.headcount);
  const ownerPct = clamp01(input.ownerCriticalTasksPct);

  let band: KeyPersonRiskBand;
  // A solo operator (headcount <= 1) is inherently key-person dependent.
  if (headcount <= 1 || ownerPct >= 0.7) band = "HIGH";
  else if (ownerPct >= 0.4) band = "MEDIUM";
  else band = "LOW";

  if (input.documentedSuccessor) {
    if (band === "HIGH") band = "MEDIUM";
    else if (band === "MEDIUM") band = "LOW";
  }
  return band;
}

export type ReserveState = "ADEQUATE" | "THIN" | "INSUFFICIENT";

export interface EmergencyReserveInput {
  cashOnHand: number;
  monthlyFixedCost: number;
  /** Target number of months of fixed cost the reserve should cover. */
  targetMonths: number;
}

export interface EmergencyReserveResult {
  /** Months of fixed cost the cash on hand covers (Infinity when no fixed cost). */
  monthsOfCover: number;
  /** monthsOfCover ÷ targetMonths (Infinity when no fixed cost; 0 when target invalid). */
  ratio: number;
  state: ReserveState;
}

/**
 * Emergency reserve adequacy. With zero fixed cost the runway is unbounded and the
 * reserve is ADEQUATE. Otherwise compare months-of-cover against the target months.
 */
export function emergencyReserveAdequacy(input: EmergencyReserveInput): EmergencyReserveResult {
  const cash = nn(input.cashOnHand);
  const monthlyFixedCost = nn(input.monthlyFixedCost);
  const targetMonths = nn(input.targetMonths);

  if (monthlyFixedCost <= 0) {
    return { monthsOfCover: Infinity, ratio: Infinity, state: "ADEQUATE" };
  }

  const monthsOfCover = cash / monthlyFixedCost;
  const ratio = targetMonths > 0 ? monthsOfCover / targetMonths : 0;

  let state: ReserveState;
  if (ratio >= 1) state = "ADEQUATE";
  else if (ratio >= 0.5) state = "THIN";
  else state = "INSUFFICIENT";

  return { monthsOfCover, ratio, state };
}

export interface PrioritizedThreat {
  threat: ContinuityThreat;
  risk: ContinuityRiskLevel;
}

/**
 * Sort threats by assessed risk (CRITICAL first). Deterministic tie-break: when two
 * threats share a risk level, order by threat type name (ascending). Does not mutate
 * the input array.
 */
export function prioritizeContinuityActions(threats: ContinuityThreat[]): PrioritizedThreat[] {
  return threats
    .map((threat) => ({ threat, risk: assessContinuityThreat(threat) }))
    .sort((a, b) => {
      const byRisk = RISK_ORDER.indexOf(b.risk) - RISK_ORDER.indexOf(a.risk);
      if (byRisk !== 0) return byRisk;
      return a.threat.type < b.threat.type ? -1 : a.threat.type > b.threat.type ? 1 : 0;
    });
}

/** Thrown when a continuity review finds CRITICAL threats lacking a contingency plan. */
export class ContinuityRiskError extends Error {
  readonly code = "CONTINUITY_RISK_UNMITIGATED";
  readonly unmitigatedCriticalTypes: ContinuityThreatType[];
  constructor(ref: string, unmitigatedCriticalTypes: ContinuityThreatType[]) {
    super(
      `Continuity review ${ref} failed: unmitigated CRITICAL threats (${unmitigatedCriticalTypes.join(", ")}).`
    );
    this.name = "ContinuityRiskError";
    this.unmitigatedCriticalTypes = unmitigatedCriticalTypes;
  }
}

/**
 * Guard: throws ContinuityRiskError when any threat is assessed CRITICAL and lacks a
 * contingency plan. A CRITICAL threat with a documented plan does not block.
 */
export function assertContinuityReviewed(threats: ContinuityThreat[], ref: string): void {
  const unmitigated = threats
    .filter((t) => !t.contingencyPlanExists && assessContinuityThreat(t) === "CRITICAL")
    .map((t) => t.type);
  if (unmitigated.length > 0) throw new ContinuityRiskError(ref, unmitigated);
}
