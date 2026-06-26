/**
 * Modules 4 & 5 — Finance Truth / Cash Flow Survival promotion gate (pure logic).
 *
 * The owner-finance (M4) and owner-cashflow (M5) domains already compute survival
 * and cashflow states and persist them on their cycles, wired into diagnosis and
 * constraint enforcement. This adds the missing piece: a fail-closed gate at
 * RECOMMENDATION PROMOTION enforcing the spec's hard rules —
 *   - No growth recommendation if cash survival is unsafe.
 *   - No spend/finance/pricing/hiring action when cash is critical/insolvent-risk.
 * Reuses the shared state scale + M2 sensitivity (no duplication). Pure.
 */

import { RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";

/** Shared severity scale used by both SurvivalState (M4) and CashflowState (M5). */
export type FinancialHealthState = "SAFE" | "WATCH" | "AT_RISK" | "CRITICAL" | "INSOLVENT_RISK";

const SEVERITY: Record<FinancialHealthState, number> = {
  SAFE: 0,
  WATCH: 1,
  AT_RISK: 2,
  CRITICAL: 3,
  INSOLVENT_RISK: 4,
};

/** Growth is unsafe at AT_RISK or worse. */
const UNSAFE_FOR_GROWTH = 2;
/** Spend/finance/pricing/hiring is unsafe at CRITICAL or worse. */
const UNSAFE_FOR_SPEND = 3;
/** Even general actions are blocked at existential (insolvent) risk. */
const EXISTENTIAL = 4;

export enum CashSafetyOutcome {
  ALLOWED = "ALLOWED",
  BLOCKED_CASH_UNSAFE = "BLOCKED_CASH_UNSAFE",
}

export interface CashSafetyGateResult {
  outcome: CashSafetyOutcome;
  allowed: boolean;
  reason: string;
  /** The worse of the cashflow and survival states. */
  effectiveState: FinancialHealthState;
}

/** The worse (more severe) of two states. */
export function worseState(a: FinancialHealthState, b: FinancialHealthState): FinancialHealthState {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

/**
 * Decide whether a recommendation of a given sensitivity may be promoted at the
 * supplied cashflow + survival states. Fail-closed per the spec's cash hard rules.
 * Compliance is cash-irrelevant here (handled by M2/M3) and passes.
 */
export function evaluateCashSafetyGate(
  cashflowState: FinancialHealthState,
  survivalState: FinancialHealthState,
  sensitivity: RecommendationSensitivity
): CashSafetyGateResult {
  const effectiveState = worseState(cashflowState, survivalState);
  const sev = SEVERITY[effectiveState];

  const block = (): CashSafetyGateResult => ({
    outcome: CashSafetyOutcome.BLOCKED_CASH_UNSAFE,
    allowed: false,
    reason: `Cash/finance state ${effectiveState} is unsafe for a ${sensitivity} recommendation.`,
    effectiveState,
  });
  const allow = (): CashSafetyGateResult => ({
    outcome: CashSafetyOutcome.ALLOWED,
    allowed: true,
    reason: `Cash/finance state ${effectiveState} permits this recommendation.`,
    effectiveState,
  });

  switch (sensitivity) {
    case RecommendationSensitivity.GROWTH_SENSITIVE:
      return sev >= UNSAFE_FOR_GROWTH ? block() : allow();
    case RecommendationSensitivity.FINANCE_SENSITIVE:
    case RecommendationSensitivity.PRICING_SENSITIVE:
    case RecommendationSensitivity.HIRING_SENSITIVE:
      return sev >= UNSAFE_FOR_SPEND ? block() : allow();
    case RecommendationSensitivity.COMPLIANCE_SENSITIVE:
      return allow();
    case RecommendationSensitivity.GENERAL:
    default:
      return sev >= EXISTENTIAL ? block() : allow();
  }
}

/** Thrown when cash/finance survival blocks a recommendation's promotion. */
export class CashSafetyGateError extends Error {
  readonly code = "CASH_SAFETY_GATE_BLOCKED";
  readonly effectiveState: FinancialHealthState;
  constructor(recommendationId: string, result: CashSafetyGateResult) {
    super(`Recommendation ${recommendationId} cannot be promoted: ${result.reason}`);
    this.name = "CashSafetyGateError";
    this.effectiveState = result.effectiveState;
  }
}

/** Guard the recommendation service calls; throws CashSafetyGateError when blocked. */
export function assertCashSafetyForPromotion(
  cashflowState: FinancialHealthState,
  survivalState: FinancialHealthState,
  sensitivity: RecommendationSensitivity,
  recommendationId: string
): void {
  const result = evaluateCashSafetyGate(cashflowState, survivalState, sensitivity);
  if (!result.allowed) throw new CashSafetyGateError(recommendationId, result);
}
