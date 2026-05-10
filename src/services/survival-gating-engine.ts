/**
 * Survival Gating Engine (Phase 4 Slice 4)
 *
 * Blocks growth/expansion actions when org is in survival crisis.
 * Fail-closed: denies actions by default during existential risk.
 *
 * Gating policy: org cannot grow safely if:
 * - Resilience score < 40 (AT_RISK or FRAGILE)
 * - >50% survival factors are in WARNING or CRITICAL state
 * - Any critical survival factor triggered a shock
 *
 * Tenant-scoped: workspaceId required for all decisions.
 */

import { SurvivalFactorValidator } from "@/services/survival-factor-validator";
import { ShockDetectionEngine } from "@/services/shock-detection-engine";
import { OrgResilienceScorer } from "@/services/org-resilience-scorer";
import { SurvivalFactorAssessment, SurvivalFactorHealth } from "@/domain/reality/survival-factors";
import { GatingDecision, GatingAction, CrisisState } from "@/domain/survival/gating-policy";

export class SurvivalGatingEngine {
  /**
   * Evaluate if a growth action is permitted during current survival state
   * Fail-closed: returns DENY if unable to fully assess
   */
  static evaluateGatingDecision(
    assessments: SurvivalFactorAssessment[],
    action: GatingAction,
    workspaceId: string
  ): GatingDecision {
    // Tenant validation: fail-closed
    if (!workspaceId) {
      throw new Error("SurvivalGatingEngine requires workspaceId for tenant scoping");
    }

    // Assess current crisis state
    const crisisState = this.assessCrisisState(assessments, workspaceId);

    // Determine if action is permitted based on crisis level
    const permitted = this.isActionPermittedInCrisisState(action, crisisState);

    return {
      id: `gate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      action,
      permitted,
      crisisState,
      rationale: this.generateRationale(action, crisisState, permitted),
      evaluatedAt: new Date(),
      workspaceId,
    };
  }

  /**
   * Assess current org crisis state from survival factor assessments
   */
  private static assessCrisisState(assessments: SurvivalFactorAssessment[], workspaceId: string): CrisisState {
    if (assessments.length === 0) {
      return CrisisState.UNKNOWN;
    }

    // Check for shocks (critical factors)
    const shockDetected = ShockDetectionEngine.detectShock(assessments, workspaceId).shockDetected;

    // Calculate resilience score
    const resilienceScore = OrgResilienceScorer.scoreResilience(assessments, workspaceId);

    // Check for >50% unhealthy factors
    const unhealthyCount = assessments.filter(
      (a) =>
        a.health === SurvivalFactorHealth.CRITICAL ||
        a.health === SurvivalFactorHealth.WARNING
    ).length;
    const unhealthyPercentage = (unhealthyCount / assessments.length) * 100;

    // Determine crisis state
    if (shockDetected || resilienceScore.level === "AT_RISK") {
      return CrisisState.SURVIVAL_CRISIS;
    }

    if (unhealthyPercentage > 50 || resilienceScore.level === "FRAGILE") {
      return CrisisState.ELEVATED_RISK;
    }

    if (unhealthyPercentage > 0 || resilienceScore.level === "RESILIENT") {
      return CrisisState.CAUTION;
    }

    return CrisisState.HEALTHY;
  }

  /**
   * Determine if action is permitted based on current crisis state
   * Growth actions blocked at elevated risk and above
   */
  private static isActionPermittedInCrisisState(
    action: GatingAction,
    crisisState: CrisisState
  ): boolean {
    // All actions blocked during survival crisis
    if (crisisState === CrisisState.SURVIVAL_CRISIS) {
      return false;
    }

    // Growth actions blocked during elevated risk
    if (crisisState === CrisisState.ELEVATED_RISK) {
      return !this.isGrowthAction(action);
    }

    // Growth actions flagged for caution during caution state
    if (crisisState === CrisisState.CAUTION) {
      return true; // Permitted but flagged (via rationale)
    }

    // All actions permitted in healthy state
    return true;
  }

  /**
   * Classify if action is growth-related (risky during crisis)
   */
  private static isGrowthAction(action: GatingAction): boolean {
    const growthActions = [
      GatingAction.HIRE_KEY_ROLE,
      GatingAction.EXPAND_TO_NEW_MARKET,
      GatingAction.LAUNCH_NEW_PRODUCT,
      GatingAction.MAJOR_INVESTMENT,
      GatingAction.LONG_TERM_COMMITMENT,
    ];
    return growthActions.includes(action);
  }

  /**
   * Generate human-readable rationale for gating decision
   */
  private static generateRationale(
    action: GatingAction,
    crisisState: CrisisState,
    permitted: boolean
  ): string {
    if (crisisState === CrisisState.SURVIVAL_CRISIS) {
      return `ORG IN SURVIVAL CRISIS: All actions blocked until survival factors stabilize. Current action: ${action}`;
    }

    if (crisisState === CrisisState.ELEVATED_RISK) {
      if (!permitted) {
        return `ELEVATED RISK: Growth actions blocked. ${action} is a growth action and cannot proceed until risk reduced.`;
      }
      return `ELEVATED RISK: Non-growth actions permitted. ${action} is allowed but monitor resilience closely.`;
    }

    if (crisisState === CrisisState.CAUTION) {
      return `CAUTION: Multiple survival factors showing warning signs. ${action} permitted but recommend review.`;
    }

    return `HEALTHY: Org is resilient. ${action} is permitted to proceed.`;
  }

  /**
   * Check if org is in survival crisis (binary gate for critical decisions)
   */
  static isInSurvivalCrisis(assessments: SurvivalFactorAssessment[], workspaceId: string = "system"): boolean {
    if (assessments.length === 0) return false;

    const crisisState = this.assessCrisisState(assessments, workspaceId);
    return crisisState === CrisisState.SURVIVAL_CRISIS;
  }

  /**
   * Get gating policy document for human review
   */
  static getGatingPolicyDocument(workspaceId: string): string {
    if (!workspaceId) {
      throw new Error("SurvivalGatingEngine requires workspaceId");
    }

    return `
SURVIVAL GATING POLICY (Workspace: ${workspaceId})

PURPOSE: Prevent org from growth actions that would accelerate failure during survival crisis.

CRISIS STATES:
1. HEALTHY: Resilience ≥80%, <50% unhealthy factors, no shocks
   - All actions permitted

2. CAUTION: Resilience 60-79%, 0-50% unhealthy factors, no shocks
   - All actions permitted with monitoring

3. ELEVATED_RISK: Resilience 40-59% OR >50% unhealthy factors
   - Growth actions BLOCKED
   - Non-growth actions permitted

4. SURVIVAL_CRISIS: Resilience <40% OR active shock OR >1 critical factor
   - ALL actions BLOCKED until stabilization

BLOCKED GROWTH ACTIONS:
- HIRE_KEY_ROLE: Cannot add key dependencies during crisis
- EXPAND_TO_NEW_MARKET: Spreads resources thin
- LAUNCH_NEW_PRODUCT: Diverts focus from core survival
- MAJOR_INVESTMENT: Depletes cash reserves
- LONG_TERM_COMMITMENT: Locks org into future obligations

PERMITTED ACTIONS (even during crisis):
- COST_REDUCTION: Preserve cash
- CUSTOMER_RETENTION: Stabilize revenue
- CORE_FOCUS: Strengthen critical capabilities
- DEBT_MANAGEMENT: Maintain financial flexibility

OVERRIDE RULES:
- Board approval can override ELEVATED_RISK blocks
- Executive approval required (with audit trail) for overrides
- All overrides logged as AuditEvents with rationale
`;
  }
}
