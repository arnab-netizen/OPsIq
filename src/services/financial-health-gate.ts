// FinancialHealthGate service - Survival intelligence gating
// Phase 4 Slice 1: Health determination and growth gating

import {
  FinancialHealthState,
  FINANCIAL_HEALTH_STATES,
  STATE_TRANSITION_RULES,
  HealthDeterminationInput,
  HealthDeterminationResult,
} from '../domain/financial-health-state';

export interface GrowthEvaluationResult {
  isGrowthAllowed: boolean;
  currentHealthState: FinancialHealthState;
  blocksGrowth: boolean;
  downgradePriority: boolean;
  requiresStabilization: boolean;
  escalationNeeded: boolean;
  reason: string;
}

export class FinancialHealthGate {
  /**
   * Determine financial health state from metrics
   * Fail-closed: returns most conservative state if uncertain
   */
  static determineHealthState(
    input: HealthDeterminationInput
  ): HealthDeterminationResult {
    const reasoning: string[] = [];
    const signals: {
      state: FinancialHealthState;
      weight: number;
    }[] = [];

    // Signal 1: Runway survival check
    if (input.runwayDays < 30) {
      reasoning.push(`Runway critical: ${input.runwayDays} days < 30`);
      signals.push({ state: 'SURVIVAL_CRITICAL', weight: 3 });
    } else if (input.runwayDays < 90) {
      reasoning.push(`Runway risk: ${input.runwayDays} days < 90`);
      signals.push({ state: 'SURVIVAL_RISK', weight: 2 });
    } else if (input.runwayDays < 120) {
      reasoning.push(`Runway adequate: ${input.runwayDays} days 90-120`);
      signals.push({ state: 'STABILIZE_FIRST', weight: 1 });
    } else if (input.runwayDays >= 180) {
      reasoning.push(`Runway strong: ${input.runwayDays} days >= 180`);
      signals.push({ state: 'SCALE_READY', weight: 1 });
    } else {
      reasoning.push(`Runway healthy: ${input.runwayDays} days 120-180`);
      signals.push({ state: 'GROWTH_ALLOWED', weight: 1 });
    }

    // Signal 2: Burn pressure
    const burnPressurePercent =
      (input.monthlyBurn / Math.max(input.currentCash, 1)) * 100;
    if (burnPressurePercent > 50) {
      reasoning.push(
        `Burn pressure critical: ${burnPressurePercent.toFixed(1)}% > 50%`
      );
      signals.push({ state: 'SURVIVAL_CRITICAL', weight: 3 });
    } else if (burnPressurePercent > 25) {
      reasoning.push(
        `Burn pressure elevated: ${burnPressurePercent.toFixed(1)}% 25-50%`
      );
      signals.push({ state: 'SURVIVAL_RISK', weight: 2 });
    }

    // Signal 3: Debt pressure
    if (input.debtToRevenueRatio > 3) {
      reasoning.push(
        `Debt critical: ${input.debtToRevenueRatio.toFixed(2)}x > 3.0x`
      );
      signals.push({ state: 'SURVIVAL_CRITICAL', weight: 2 });
    } else if (input.debtToRevenueRatio > 2) {
      reasoning.push(
        `Debt risk: ${input.debtToRevenueRatio.toFixed(2)}x 2.0-3.0x`
      );
      signals.push({ state: 'SURVIVAL_RISK', weight: 2 });
    }

    // Signal 4: Margin health
    if (input.marginPercent < -20) {
      reasoning.push(`Margin critical: ${input.marginPercent}% < -20%`);
      signals.push({ state: 'SURVIVAL_CRITICAL', weight: 2 });
    } else if (input.marginPercent < 0) {
      reasoning.push(
        `Margin negative: ${input.marginPercent}% between -20% and 0%`
      );
      signals.push({ state: 'SURVIVAL_RISK', weight: 2 });
    } else if (input.marginPercent < 10) {
      reasoning.push(`Margin thin: ${input.marginPercent}% < 10%`);
      signals.push({ state: 'SURVIVAL_RISK', weight: 1 });
    }

    // Signal 5: Revenue concentration risk
    if (input.revenueConcentration > 70) {
      reasoning.push(
        `Revenue concentration critical: ${input.revenueConcentration}% > 70%`
      );
      signals.push({ state: 'SURVIVAL_RISK', weight: 1 });
    } else if (input.revenueConcentration > 50) {
      reasoning.push(
        `Revenue concentration risk: ${input.revenueConcentration}% 50-70%`
      );
      signals.push({ state: 'STABILIZE_FIRST', weight: 1 });
    }

    // Signal 6: Operator load
    if (input.operatorLoadPercent > 80) {
      reasoning.push(
        `Operator overload: ${input.operatorLoadPercent}% > 80%`
      );
      signals.push({ state: 'STABILIZE_FIRST', weight: 1 });
    }

    // Signal 7: Organizational friction
    if (input.organizationalFrictionScore > 70) {
      reasoning.push(
        `Organizational friction high: ${input.organizationalFrictionScore} > 70`
      );
      signals.push({ state: 'STABILIZE_FIRST', weight: 1 });
    }

    // Determine state: most severe state wins (fail-closed)
    let finalState: FinancialHealthState = 'GROWTH_ALLOWED';
    let maxSeverity = -1;

    for (const signal of signals) {
      const stateIndex = FINANCIAL_HEALTH_STATES.indexOf(signal.state);
      const severityScore = (5 - stateIndex) * signal.weight;

      if (severityScore > maxSeverity) {
        maxSeverity = severityScore;
        finalState = signal.state;
      }
    }

    // Calculate confidence
    const confidence = Math.min(
      100,
      Math.max(50, 50 + signals.length * 10)
    );

    return {
      state: finalState,
      reasoning,
      confidencePercent: confidence,
    };
  }

  /**
   * Evaluate if growth is allowed given health state
   * Returns detailed growth gating decision
   */
  static evaluateGrowthAllowed(
    healthState: FinancialHealthState
  ): GrowthEvaluationResult {
    const rules = STATE_TRANSITION_RULES[healthState];

    return {
      isGrowthAllowed: !rules.blocksGrowth,
      currentHealthState: healthState,
      blocksGrowth: rules.blocksGrowth,
      downgradePriority: rules.downgradePriority,
      requiresStabilization: rules.requiresStabilization,
      escalationNeeded: rules.escalationNeeded,
      reason: rules.description,
    };
  }

  /**
   * Check if state transition is valid
   * Some transitions are invalid (e.g., SCALE_READY cannot jump to SURVIVAL_CRITICAL without SURVIVAL_RISK)
   */
  static isValidStateTransition(
    from: FinancialHealthState,
    to: FinancialHealthState
  ): boolean {
    const fromIndex = FINANCIAL_HEALTH_STATES.indexOf(from);
    const toIndex = FINANCIAL_HEALTH_STATES.indexOf(to);

    // Cannot improve more than 1 step at a time (prevents false recoveries)
    // Can worsen any number of steps (fail-closed)
    if (toIndex > fromIndex) {
      return toIndex - fromIndex === 1;
    }

    return true;
  }

  /**
   * Get state description for UI/dashboards
   */
  static getStateDescription(state: FinancialHealthState): string {
    return STATE_TRANSITION_RULES[state].description;
  }

  /**
   * Get all states that would trigger escalation
   */
  static getEscalationStates(): FinancialHealthState[] {
    return FINANCIAL_HEALTH_STATES.filter(
      (state) => STATE_TRANSITION_RULES[state].escalationNeeded
    );
  }

  /**
   * Get all states that block growth
   */
  static getGrowthBlockingStates(): FinancialHealthState[] {
    return FINANCIAL_HEALTH_STATES.filter(
      (state) => STATE_TRANSITION_RULES[state].blocksGrowth
    );
  }

  /**
   * Get all states that require stabilization
   */
  static getStabilizationRequiredStates(): FinancialHealthState[] {
    return FINANCIAL_HEALTH_STATES.filter(
      (state) => STATE_TRANSITION_RULES[state].requiresStabilization
    );
  }
}
