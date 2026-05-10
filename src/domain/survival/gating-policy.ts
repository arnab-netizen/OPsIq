/**
 * Survival Gating Policy Domain Contract (Phase 4 Slice 4)
 *
 * Defines gating decisions, crisis states, and action classifications
 * for blocking unsafe growth during existential risk.
 */

export enum CrisisState {
  HEALTHY = "HEALTHY",
  CAUTION = "CAUTION",
  ELEVATED_RISK = "ELEVATED_RISK",
  SURVIVAL_CRISIS = "SURVIVAL_CRISIS",
  UNKNOWN = "UNKNOWN",
}

export enum GatingAction {
  // Growth actions (blocked during crisis)
  HIRE_KEY_ROLE = "HIRE_KEY_ROLE",
  EXPAND_TO_NEW_MARKET = "EXPAND_TO_NEW_MARKET",
  LAUNCH_NEW_PRODUCT = "LAUNCH_NEW_PRODUCT",
  MAJOR_INVESTMENT = "MAJOR_INVESTMENT",
  LONG_TERM_COMMITMENT = "LONG_TERM_COMMITMENT",

  // Stabilization actions (permitted always)
  COST_REDUCTION = "COST_REDUCTION",
  CUSTOMER_RETENTION = "CUSTOMER_RETENTION",
  CORE_FOCUS = "CORE_FOCUS",
  DEBT_MANAGEMENT = "DEBT_MANAGEMENT",
}

export interface GatingDecision {
  id: string;
  action: GatingAction;
  permitted: boolean;
  crisisState: CrisisState;
  rationale: string;
  evaluatedAt: Date;
  workspaceId: string;
}

export interface GatingPolicy {
  workspaceId: string;
  crisisStateDefinitions: Record<CrisisState, string>;
  blockedActionsPerState: Record<CrisisState, GatingAction[]>;
  requiredApprovals: Record<GatingAction, string[]>; // approval roles
  overrideAuditRequired: boolean;
}

export const CRISIS_STATE_THRESHOLDS: Record<
  CrisisState,
  { minResilienceScore: number; maxUnhealthyPercentage: number; allowsShock: boolean }
> = {
  [CrisisState.HEALTHY]: {
    minResilienceScore: 80,
    maxUnhealthyPercentage: 0,
    allowsShock: false,
  },
  [CrisisState.CAUTION]: {
    minResilienceScore: 60,
    maxUnhealthyPercentage: 50,
    allowsShock: false,
  },
  [CrisisState.ELEVATED_RISK]: {
    minResilienceScore: 40,
    maxUnhealthyPercentage: 100,
    allowsShock: false,
  },
  [CrisisState.SURVIVAL_CRISIS]: {
    minResilienceScore: 0,
    maxUnhealthyPercentage: 100,
    allowsShock: true,
  },
  [CrisisState.UNKNOWN]: {
    minResilienceScore: 0,
    maxUnhealthyPercentage: 0,
    allowsShock: false,
  },
};

export const GROWTH_ACTIONS = new Set([
  GatingAction.HIRE_KEY_ROLE,
  GatingAction.EXPAND_TO_NEW_MARKET,
  GatingAction.LAUNCH_NEW_PRODUCT,
  GatingAction.MAJOR_INVESTMENT,
  GatingAction.LONG_TERM_COMMITMENT,
]);

/**
 * Determine if action should be blocked in given crisis state
 */
export function isActionBlockedInCrisisState(
  action: GatingAction,
  crisisState: CrisisState
): boolean {
  if (crisisState === CrisisState.SURVIVAL_CRISIS) return true;
  if (crisisState === CrisisState.ELEVATED_RISK) return GROWTH_ACTIONS.has(action);
  return false;
}

/**
 * Validate crisis state against thresholds
 */
export function validateCrisisState(
  crisisState: CrisisState,
  resilienceScore: number,
  unhealthyPercentage: number,
  shockDetected: boolean
): boolean {
  const threshold = CRISIS_STATE_THRESHOLDS[crisisState];
  if (!threshold) return false;

  if (resilienceScore < threshold.minResilienceScore) return false;
  if (unhealthyPercentage > threshold.maxUnhealthyPercentage) return false;
  if (shockDetected && !threshold.allowsShock) return false;

  return true;
}
