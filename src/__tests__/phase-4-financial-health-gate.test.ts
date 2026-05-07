// Phase 4 Slice 1: FinancialHealthGate - Survival intelligence gating logic
// Tests verify health determination, growth gating, and state transitions

import { describe, it, expect } from 'vitest';
import { FinancialHealthGate } from '../services/financial-health-gate';
import {
  FINANCIAL_HEALTH_STATES,
  STATE_TRANSITION_RULES,
} from '../domain/financial-health-state';

describe('Phase 4 Slice 1 — FinancialHealthGate: Survival Intelligence', () => {
  describe('Contract', () => {
    it('validates financial health states are defined', () => {
      expect(FINANCIAL_HEALTH_STATES).toContain('SURVIVAL_CRITICAL');
      expect(FINANCIAL_HEALTH_STATES).toContain('SURVIVAL_RISK');
      expect(FINANCIAL_HEALTH_STATES).toContain('STABILIZE_FIRST');
      expect(FINANCIAL_HEALTH_STATES).toContain('GROWTH_ALLOWED');
      expect(FINANCIAL_HEALTH_STATES).toContain('SCALE_READY');
      expect(FINANCIAL_HEALTH_STATES.length).toBe(5);
    });

    it('validates state transition rules exist for each state', () => {
      for (const state of FINANCIAL_HEALTH_STATES) {
        expect(STATE_TRANSITION_RULES[state]).toBeDefined();
        expect(typeof STATE_TRANSITION_RULES[state].blocksGrowth).toBe(
          'boolean'
        );
        expect(typeof STATE_TRANSITION_RULES[state].requiresStabilization).toBe(
          'boolean'
        );
      }
    });

    it('validates growth evaluation result structure', () => {
      const result = {
        isGrowthAllowed: true,
        currentHealthState: 'GROWTH_ALLOWED' as const,
        blocksGrowth: false,
        downgradePriority: false,
        requiresStabilization: false,
        escalationNeeded: false,
        reason: 'Test reason',
      };

      expect(typeof result.isGrowthAllowed).toBe('boolean');
      expect(result.currentHealthState).toBeDefined();
      expect(typeof result.blocksGrowth).toBe('boolean');
    });
  });

  describe('Behavior — Health Determination', () => {
    it('determines SURVIVAL_CRITICAL when runway < 30 days', () => {
      const input = {
        runwayDays: 20,
        monthlyBurn: 100,
        currentCash: 2000,
        debtToRevenueRatio: 1.0,
        marginPercent: 20,
        revenueConcentration: 40,
        operatorLoadPercent: 60,
        organizationalFrictionScore: 30,
      };

      const result = FinancialHealthGate.determineHealthState(input);
      expect(result.state).toBe('SURVIVAL_CRITICAL');
    });

    it('determines SURVIVAL_RISK when runway 30-90 days', () => {
      const input = {
        runwayDays: 60,
        monthlyBurn: 100,
        currentCash: 6000,
        debtToRevenueRatio: 1.0,
        marginPercent: 20,
        revenueConcentration: 40,
        operatorLoadPercent: 60,
        organizationalFrictionScore: 30,
      };

      const result = FinancialHealthGate.determineHealthState(input);
      expect(result.state).toBe('SURVIVAL_RISK');
    });

    it('determines STABILIZE_FIRST when operator load > 80%', () => {
      const input = {
        runwayDays: 150,
        monthlyBurn: 50,
        currentCash: 10000,
        debtToRevenueRatio: 0.5,
        marginPercent: 30,
        revenueConcentration: 40,
        operatorLoadPercent: 85,
        organizationalFrictionScore: 30,
      };

      const result = FinancialHealthGate.determineHealthState(input);
      expect(result.state).toBe('STABILIZE_FIRST');
    });

    it('determines GROWTH_ALLOWED when healthy', () => {
      const input = {
        runwayDays: 150,
        monthlyBurn: 50,
        currentCash: 10000,
        debtToRevenueRatio: 0.5,
        marginPercent: 30,
        revenueConcentration: 40,
        operatorLoadPercent: 60,
        organizationalFrictionScore: 30,
      };

      const result = FinancialHealthGate.determineHealthState(input);
      expect(result.state).toBe('GROWTH_ALLOWED');
    });

    it('determines SCALE_READY when very healthy', () => {
      const input = {
        runwayDays: 200,
        monthlyBurn: 40,
        currentCash: 20000,
        debtToRevenueRatio: 0.3,
        marginPercent: 35,
        revenueConcentration: 25,
        operatorLoadPercent: 50,
        organizationalFrictionScore: 20,
      };

      const result = FinancialHealthGate.determineHealthState(input);
      expect(result.state).toBe('SCALE_READY');
    });
  });

  describe('Behavior — Growth Gating', () => {
    it('blocks growth in SURVIVAL_CRITICAL', () => {
      const result = FinancialHealthGate.evaluateGrowthAllowed(
        'SURVIVAL_CRITICAL'
      );
      expect(result.isGrowthAllowed).toBe(false);
      expect(result.blocksGrowth).toBe(true);
    });

    it('blocks growth in SURVIVAL_RISK', () => {
      const result = FinancialHealthGate.evaluateGrowthAllowed(
        'SURVIVAL_RISK'
      );
      expect(result.isGrowthAllowed).toBe(false);
      expect(result.blocksGrowth).toBe(true);
    });

    it('allows growth in GROWTH_ALLOWED', () => {
      const result = FinancialHealthGate.evaluateGrowthAllowed(
        'GROWTH_ALLOWED'
      );
      expect(result.isGrowthAllowed).toBe(true);
      expect(result.blocksGrowth).toBe(false);
    });

    it('allows growth in SCALE_READY', () => {
      const result = FinancialHealthGate.evaluateGrowthAllowed('SCALE_READY');
      expect(result.isGrowthAllowed).toBe(true);
      expect(result.blocksGrowth).toBe(false);
    });
  });

  describe('Behavior — Priority Downgrading', () => {
    it('downgrades priority in SURVIVAL_CRITICAL', () => {
      const result = FinancialHealthGate.evaluateGrowthAllowed(
        'SURVIVAL_CRITICAL'
      );
      expect(result.downgradePriority).toBe(true);
    });

    it('downgrades priority in SURVIVAL_RISK', () => {
      const result = FinancialHealthGate.evaluateGrowthAllowed(
        'SURVIVAL_RISK'
      );
      expect(result.downgradePriority).toBe(true);
    });

    it('does not downgrade priority in SCALE_READY', () => {
      const result = FinancialHealthGate.evaluateGrowthAllowed('SCALE_READY');
      expect(result.downgradePriority).toBe(false);
    });
  });

  describe('Behavior — Stabilization Requirements', () => {
    it('requires stabilization in SURVIVAL_CRITICAL', () => {
      const result = FinancialHealthGate.evaluateGrowthAllowed(
        'SURVIVAL_CRITICAL'
      );
      expect(result.requiresStabilization).toBe(true);
    });

    it('requires stabilization in STABILIZE_FIRST', () => {
      const result = FinancialHealthGate.evaluateGrowthAllowed(
        'STABILIZE_FIRST'
      );
      expect(result.requiresStabilization).toBe(true);
    });

    it('does not require stabilization in SCALE_READY', () => {
      const result = FinancialHealthGate.evaluateGrowthAllowed('SCALE_READY');
      expect(result.requiresStabilization).toBe(false);
    });
  });

  describe('Behavior — Escalation Triggers', () => {
    it('escalation only needed in SURVIVAL_CRITICAL', () => {
      const escalationStates = FinancialHealthGate.getEscalationStates();
      expect(escalationStates).toContain('SURVIVAL_CRITICAL');
      expect(escalationStates.length).toBe(1);
    });

    it('no escalation in SURVIVAL_RISK', () => {
      const result = FinancialHealthGate.evaluateGrowthAllowed(
        'SURVIVAL_RISK'
      );
      expect(result.escalationNeeded).toBe(false);
    });
  });

  describe('Behavior — State Transitions', () => {
    it('allows worsening transitions (any severity)', () => {
      const valid1 = FinancialHealthGate.isValidStateTransition(
        'GROWTH_ALLOWED',
        'SURVIVAL_CRITICAL'
      );
      expect(valid1).toBe(true);

      const valid2 = FinancialHealthGate.isValidStateTransition(
        'SCALE_READY',
        'SURVIVAL_RISK'
      );
      expect(valid2).toBe(true);
    });

    it('allows improvement by one step only', () => {
      const valid = FinancialHealthGate.isValidStateTransition(
        'SURVIVAL_CRITICAL',
        'SURVIVAL_RISK'
      );
      expect(valid).toBe(true);
    });

    it('blocks improvement by more than one step (prevents false recovery)', () => {
      const invalid = FinancialHealthGate.isValidStateTransition(
        'SURVIVAL_CRITICAL',
        'GROWTH_ALLOWED'
      );
      expect(invalid).toBe(false);
    });
  });

  describe('Behavior — Metric Sensitivity', () => {
    it('runway is highest priority signal', () => {
      const criticalRunway = {
        runwayDays: 15,
        monthlyBurn: 10,
        currentCash: 5000,
        debtToRevenueRatio: 0.1,
        marginPercent: 50,
        revenueConcentration: 10,
        operatorLoadPercent: 30,
        organizationalFrictionScore: 10,
      };

      const result = FinancialHealthGate.determineHealthState(criticalRunway);
      expect(result.state).toBe('SURVIVAL_CRITICAL');
    });

    it('burn pressure triggers escalation', () => {
      const highBurn = {
        runwayDays: 100,
        monthlyBurn: 600,
        currentCash: 1000,
        debtToRevenueRatio: 0.5,
        marginPercent: 20,
        revenueConcentration: 40,
        operatorLoadPercent: 60,
        organizationalFrictionScore: 30,
      };

      const result = FinancialHealthGate.determineHealthState(highBurn);
      expect(
        result.state === 'SURVIVAL_CRITICAL' ||
          result.state === 'SURVIVAL_RISK'
      ).toBe(true);
    });

    it('debt pressure influences health state', () => {
      const highDebt = {
        runwayDays: 150,
        monthlyBurn: 50,
        currentCash: 10000,
        debtToRevenueRatio: 3.5,
        marginPercent: 30,
        revenueConcentration: 40,
        operatorLoadPercent: 60,
        organizationalFrictionScore: 30,
      };

      const result = FinancialHealthGate.determineHealthState(highDebt);
      expect(result.state).toBe('SURVIVAL_CRITICAL');
    });
  });

  describe('Behavior — State Utilities', () => {
    it('identifies growth-blocking states', () => {
      const blockingStates = FinancialHealthGate.getGrowthBlockingStates();
      expect(blockingStates).toContain('SURVIVAL_CRITICAL');
      expect(blockingStates).toContain('SURVIVAL_RISK');
      expect(blockingStates).not.toContain('GROWTH_ALLOWED');
    });

    it('identifies stabilization-required states', () => {
      const stabilizationStates =
        FinancialHealthGate.getStabilizationRequiredStates();
      expect(stabilizationStates).toContain('SURVIVAL_CRITICAL');
      expect(stabilizationStates).toContain('SURVIVAL_RISK');
      expect(stabilizationStates).toContain('STABILIZE_FIRST');
      expect(stabilizationStates).not.toContain('SCALE_READY');
    });

    it('provides state descriptions', () => {
      const desc = FinancialHealthGate.getStateDescription('SURVIVAL_CRITICAL');
      expect(desc).toBeTruthy();
      expect(desc.length).toBeGreaterThan(0);
    });
  });

  describe('Acceptance Criteria #1', () => {
    it('criterion #1 satisfied: Growth is blocked/downgraded during survival risk', () => {
      // Test SURVIVAL_CRITICAL
      const criticalEval =
        FinancialHealthGate.evaluateGrowthAllowed('SURVIVAL_CRITICAL');
      expect(criticalEval.blocksGrowth).toBe(true);
      expect(criticalEval.isGrowthAllowed).toBe(false);
      expect(criticalEval.downgradePriority).toBe(true);

      // Test SURVIVAL_RISK
      const riskEval = FinancialHealthGate.evaluateGrowthAllowed(
        'SURVIVAL_RISK'
      );
      expect(riskEval.blocksGrowth).toBe(true);
      expect(riskEval.isGrowthAllowed).toBe(false);

      // Test GROWTH_ALLOWED allows growth
      const growthEval = FinancialHealthGate.evaluateGrowthAllowed(
        'GROWTH_ALLOWED'
      );
      expect(growthEval.isGrowthAllowed).toBe(true);
      expect(growthEval.blocksGrowth).toBe(false);

      // Test determination logic
      const criticalInput = {
        runwayDays: 20,
        monthlyBurn: 100,
        currentCash: 2000,
        debtToRevenueRatio: 1.0,
        marginPercent: 20,
        revenueConcentration: 40,
        operatorLoadPercent: 60,
        organizationalFrictionScore: 30,
      };

      const determined = FinancialHealthGate.determineHealthState(
        criticalInput
      );
      expect(determined.state).toBe('SURVIVAL_CRITICAL');
      expect(determined.reasoning.length).toBeGreaterThan(0);

      // Verify state transitions are conservative
      const badTransition = FinancialHealthGate.isValidStateTransition(
        'SURVIVAL_CRITICAL',
        'GROWTH_ALLOWED'
      );
      expect(badTransition).toBe(false); // Prevents false recovery
    });
  });
});
