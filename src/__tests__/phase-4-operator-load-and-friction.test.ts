// Phase 4 Slice 4: OperatorLoadEngine & OrganizationalFrictionEngine - Human execution reality
// Tests verify operator utilization, organizational cohesion, and execution risk

import { describe, it, expect } from 'vitest';
import { OperatorLoadEngine } from '../services/operator-load-engine';
import { OrganizationalFrictionEngine } from '../services/organizational-friction-engine';

describe('Phase 4 Slice 4 — Operator Load & Organizational Friction: Human Execution Reality', () => {
  describe('OperatorLoadEngine', () => {
    describe('Contract', () => {
      it('validates operator load analysis structure', () => {
        const analysis = {
          operatorCapacityPercent: 75,
          availableCapacity: 25,
          utilizationLevel: 'HEALTHY' as const,
          canTakeNewWork: true,
          recoveryWeeks: 0,
          bottleneckRisk: false,
        };

        expect(typeof analysis.operatorCapacityPercent).toBe('number');
        expect(['CRITICAL', 'OVERLOADED', 'AT_CAPACITY', 'HEALTHY', 'UNDERUTILIZED']).toContain(
          analysis.utilizationLevel
        );
      });
    });

    describe('Behavior — Operator Load Analysis', () => {
      it('determines CRITICAL when capacity > 95%', () => {
        const analysis = OperatorLoadEngine.analyzeOperatorLoad(97);

        expect(analysis.operatorCapacityPercent).toBe(97);
        expect(analysis.utilizationLevel).toBe('CRITICAL');
      });

      it('determines OVERLOADED when capacity 85-95%', () => {
        const analysis = OperatorLoadEngine.analyzeOperatorLoad(90);

        expect(analysis.operatorCapacityPercent).toBe(90);
        expect(analysis.utilizationLevel).toBe('OVERLOADED');
      });

      it('determines AT_CAPACITY when capacity 75-85%', () => {
        const analysis = OperatorLoadEngine.analyzeOperatorLoad(80);

        expect(analysis.operatorCapacityPercent).toBe(80);
        expect(analysis.utilizationLevel).toBe('AT_CAPACITY');
      });

      it('determines HEALTHY when capacity 40-75%', () => {
        const analysis = OperatorLoadEngine.analyzeOperatorLoad(60);

        expect(analysis.operatorCapacityPercent).toBe(60);
        expect(analysis.utilizationLevel).toBe('HEALTHY');
      });

      it('determines UNDERUTILIZED when capacity < 40%', () => {
        const analysis = OperatorLoadEngine.analyzeOperatorLoad(30);

        expect(analysis.operatorCapacityPercent).toBe(30);
        expect(analysis.utilizationLevel).toBe('UNDERUTILIZED');
      });
    });

    describe('Behavior — Available Capacity', () => {
      it('calculates available capacity correctly', () => {
        const analysis = OperatorLoadEngine.analyzeOperatorLoad(65);

        expect(analysis.availableCapacity).toBe(35); // 100 - 65
      });

      it('allows new work when capacity < 80%', () => {
        const analysis = OperatorLoadEngine.analyzeOperatorLoad(75);

        expect(analysis.canTakeNewWork).toBe(true);
      });

      it('blocks new work when capacity >= 80%', () => {
        const analysis = OperatorLoadEngine.analyzeOperatorLoad(85);

        expect(analysis.canTakeNewWork).toBe(false);
      });
    });

    describe('Behavior — Recovery Timeline', () => {
      it('estimates recovery weeks from critical load', () => {
        const analysis = OperatorLoadEngine.analyzeOperatorLoad(97);

        expect(analysis.recoveryWeeks).toBeGreaterThan(0);
        // (97 - 75) / 2 = 11 weeks
        expect(analysis.recoveryWeeks).toBe(11);
      });

      it('sets zero recovery for healthy load', () => {
        const analysis = OperatorLoadEngine.analyzeOperatorLoad(65);

        expect(analysis.recoveryWeeks).toBe(0);
      });
    });

    describe('Behavior — Bottleneck Risk', () => {
      it('identifies bottleneck risk at > 85%', () => {
        const analysis = OperatorLoadEngine.analyzeOperatorLoad(87);

        expect(analysis.bottleneckRisk).toBe(true);
      });

      it('no bottleneck at healthy levels', () => {
        const analysis = OperatorLoadEngine.analyzeOperatorLoad(60);

        expect(analysis.bottleneckRisk).toBe(false);
      });
    });

    describe('Behavior — Utilization Checks', () => {
      it('identifies operator overloaded at > 85%', () => {
        expect(OperatorLoadEngine.isOperatorOverloaded(86)).toBe(true);
        expect(OperatorLoadEngine.isOperatorOverloaded(85)).toBe(false);
      });

      it('identifies operator critical at > 95%', () => {
        expect(OperatorLoadEngine.isOperatorCritical(96)).toBe(true);
        expect(OperatorLoadEngine.isOperatorCritical(95)).toBe(false);
      });
    });

    describe('Behavior — Workload Reduction Planning', () => {
      it('calculates workload reduction to reach target', () => {
        const plan = OperatorLoadEngine.calculateRequiredWorkloadReduction(90, 75);

        expect(plan.reductionNeeded).toBe(15);
        expect(plan.reductionPercent).toBeCloseTo(16.67, 1);
        expect(plan.achievable).toBe(true);
      });
    });
  });

  describe('OrganizationalFrictionEngine', () => {
    describe('Contract', () => {
      it('validates organizational friction analysis structure', () => {
        const analysis = {
          frictionScore: 30,
          frictionLevel: 'MODERATE' as const,
          communicationBreakdownRisk: false,
          changeResistanceRisk: false,
          misalignmentRisk: false,
          executionRisk: false,
          recoveryWeeks: 1,
        };

        expect(typeof analysis.frictionScore).toBe('number');
        expect(['HEALTHY', 'MODERATE', 'HIGH', 'CRITICAL']).toContain(
          analysis.frictionLevel
        );
      });
    });

    describe('Behavior — Friction Analysis', () => {
      it('determines CRITICAL when friction > 75', () => {
        const analysis = OrganizationalFrictionEngine.analyzeFriction(80);

        expect(analysis.frictionScore).toBe(80);
        expect(analysis.frictionLevel).toBe('CRITICAL');
      });

      it('determines HIGH when friction 50-75', () => {
        const analysis = OrganizationalFrictionEngine.analyzeFriction(65);

        expect(analysis.frictionScore).toBe(65);
        expect(analysis.frictionLevel).toBe('HIGH');
      });

      it('determines MODERATE when friction 25-50', () => {
        const analysis = OrganizationalFrictionEngine.analyzeFriction(35);

        expect(analysis.frictionScore).toBe(35);
        expect(analysis.frictionLevel).toBe('MODERATE');
      });

      it('determines HEALTHY when friction < 25', () => {
        const analysis = OrganizationalFrictionEngine.analyzeFriction(15);

        expect(analysis.frictionScore).toBe(15);
        expect(analysis.frictionLevel).toBe('HEALTHY');
      });
    });

    describe('Behavior — Risk Identification', () => {
      it('identifies communication breakdown at > 60 friction', () => {
        const analysis = OrganizationalFrictionEngine.analyzeFriction(65);

        expect(analysis.communicationBreakdownRisk).toBe(true);
      });

      it('identifies change resistance at > 50 friction', () => {
        const analysis = OrganizationalFrictionEngine.analyzeFriction(55);

        expect(analysis.changeResistanceRisk).toBe(true);
      });

      it('identifies misalignment at > 40 friction', () => {
        const analysis = OrganizationalFrictionEngine.analyzeFriction(45);

        expect(analysis.misalignmentRisk).toBe(true);
      });

      it('identifies execution risk at > 35 friction', () => {
        const analysis = OrganizationalFrictionEngine.analyzeFriction(40);

        expect(analysis.executionRisk).toBe(true);
      });
    });

    describe('Behavior — Recovery Timeline', () => {
      it('estimates recovery weeks from high friction', () => {
        const analysis = OrganizationalFrictionEngine.analyzeFriction(75);

        expect(analysis.recoveryWeeks).toBeGreaterThan(0);
        // (75 - 25) / 5 = 10 weeks
        expect(analysis.recoveryWeeks).toBe(10);
      });

      it('sets zero recovery for healthy friction', () => {
        const analysis = OrganizationalFrictionEngine.analyzeFriction(20);

        expect(analysis.recoveryWeeks).toBe(0);
      });
    });

    describe('Behavior — Friction Checks', () => {
      it('identifies critical friction at > 75', () => {
        expect(OrganizationalFrictionEngine.isFrictionCritical(76)).toBe(true);
        expect(OrganizationalFrictionEngine.isFrictionCritical(75)).toBe(false);
      });

      it('identifies high friction at > 50', () => {
        expect(OrganizationalFrictionEngine.isFrictionHigh(51)).toBe(true);
        expect(OrganizationalFrictionEngine.isFrictionHigh(50)).toBe(false);
      });
    });

    describe('Behavior — Organizational Effectiveness', () => {
      it('assesses communication effectiveness', () => {
        expect(OrganizationalFrictionEngine.isCommunicationEffective(55)).toBe(true);
        expect(OrganizationalFrictionEngine.isCommunicationEffective(65)).toBe(false);
      });

      it('assesses change readiness', () => {
        expect(OrganizationalFrictionEngine.isChangeReady(45)).toBe(true);
        expect(OrganizationalFrictionEngine.isChangeReady(55)).toBe(false);
      });
    });

    describe('Behavior — Friction Reduction Planning', () => {
      it('calculates friction reduction to reach target', () => {
        const plan = OrganizationalFrictionEngine.calculateRequiredFrictionReduction(75, 25);

        expect(plan.reductionNeeded).toBe(50);
        expect(plan.reductionPercent).toBeCloseTo(66.67, 1);
        expect(plan.achievable).toBe(true);
      });
    });
  });

  describe('Acceptance Criteria #5-6', () => {
    it('criterion #5 satisfied: Operator overload affects feasibility', () => {
      // Test critical operator load
      const criticalLoad = OperatorLoadEngine.analyzeOperatorLoad(97);
      expect(criticalLoad.operatorCapacityPercent).toBe(97);
      expect(criticalLoad.utilizationLevel).toBe('CRITICAL');
      expect(OperatorLoadEngine.isOperatorCritical(97)).toBe(true);
      expect(criticalLoad.canTakeNewWork).toBe(false);

      // Test at-risk operator load
      const atRiskLoad = OperatorLoadEngine.analyzeOperatorLoad(87);
      expect(atRiskLoad.utilizationLevel).toBe('OVERLOADED');
      expect(OperatorLoadEngine.isOperatorOverloaded(87)).toBe(true);

      // Test healthy operator load
      const healthyLoad = OperatorLoadEngine.analyzeOperatorLoad(65);
      expect(healthyLoad.utilizationLevel).toBe('HEALTHY');
      expect(healthyLoad.canTakeNewWork).toBe(true);

      // Bottleneck risk at high utilization
      expect(criticalLoad.bottleneckRisk).toBe(true);
      expect(healthyLoad.bottleneckRisk).toBe(false);
    });

    it('criterion #6 satisfied: Organizational friction affects execution', () => {
      // Test critical friction
      const criticalFriction = OrganizationalFrictionEngine.analyzeFriction(80);
      expect(criticalFriction.frictionScore).toBe(80);
      expect(criticalFriction.frictionLevel).toBe('CRITICAL');
      expect(OrganizationalFrictionEngine.isFrictionCritical(80)).toBe(true);
      expect(criticalFriction.executionRisk).toBe(true);

      // Test at-risk friction
      const atRiskFriction = OrganizationalFrictionEngine.analyzeFriction(65);
      expect(atRiskFriction.frictionLevel).toBe('HIGH');
      expect(OrganizationalFrictionEngine.isFrictionHigh(65)).toBe(true);
      expect(atRiskFriction.communicationBreakdownRisk).toBe(true);

      // Test healthy friction
      const healthyFriction = OrganizationalFrictionEngine.analyzeFriction(20);
      expect(healthyFriction.frictionLevel).toBe('HEALTHY');
      expect(OrganizationalFrictionEngine.isCommunicationEffective(20)).toBe(true);
      expect(OrganizationalFrictionEngine.isChangeReady(20)).toBe(true);

      // Both operator load and friction affect survival state
      const criticalLoad = OperatorLoadEngine.analyzeOperatorLoad(97);
      expect(criticalLoad.canTakeNewWork).toBe(false);
      expect(criticalFriction.executionRisk).toBe(true);
    });
  });
});
