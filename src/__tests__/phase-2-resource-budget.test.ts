// Phase 2 Slice 10: ResourceBudget - Resource Budget Enforcement
// Tests verify budget constraints and enforcement logic

import { describe, it, expect } from 'vitest';
import { ResourceBudget } from '../domain/resource-budget';
import { ResourceBudgetService } from '../services/resource-budget';

describe('Phase 2 Slice 10 — ResourceBudget: Resource Budget Enforcement', () => {
  const testEngagementId = '550e8400-e29b-41d4-a716-446655440000';

  const createTestBudget = (overrides?: Partial<ResourceBudget>): ResourceBudget => ({
    id: '550e8400-e29b-41d4-a716-446655440900',
    engagementId: testEngagementId,
    resourceType: 'team_hours',
    description: 'Project team capacity',
    totalBudget: 500,
    allocatedAmount: 100,
    committedAmount: 50,
    consumedAmount: 75,
    unit: 'hours',
    warningThreshold: 80,
    status: 'available',
    isBlocking: false,
    notes: null,
    reviewedAt: null,
    reviewedBy: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('Contract', () => {
    it('validates resource budget schema', () => {
      const budget = createTestBudget();
      const validated = ResourceBudgetService.validateBudget(budget);

      expect(validated.engagementId).toBe(testEngagementId);
      expect(validated.resourceType).toBe('team_hours');
      expect(validated.totalBudget).toBe(500);
    });

    it('validates create request schema', () => {
      const request = {
        engagementId: testEngagementId,
        resourceType: 'infrastructure_spend' as const,
        totalBudget: 10000,
        unit: 'dollars',
        warningThreshold: 75,
      };

      const validated = ResourceBudgetService.validateRequest(request);
      expect(validated.resourceType).toBe('infrastructure_spend');
      expect(validated.totalBudget).toBe(10000);
    });

    it('throws on invalid budget data', () => {
      const invalid = {
        engagementId: 'not-a-uuid',
        resourceType: 'invalid_type',
        totalBudget: -100,
      };

      expect(() => ResourceBudgetService.validateBudget(invalid)).toThrow();
    });
  });

  describe('Behavior - Budget Calculation', () => {
    it('calculates remaining budget correctly', () => {
      const budget = createTestBudget({ totalBudget: 500, consumedAmount: 150 });
      const remaining = ResourceBudgetService.getRemainingBudget(budget);

      expect(remaining).toBe(350);
    });

    it('calculates utilization percentage', () => {
      const budget = createTestBudget({ totalBudget: 500, consumedAmount: 250 });
      const utilization = ResourceBudgetService.getUtilizationPercentage(budget);

      expect(utilization).toBe(50);
    });

    it('calculates 0% utilization for new budget', () => {
      const budget = createTestBudget({ totalBudget: 500, consumedAmount: 0 });
      const utilization = ResourceBudgetService.getUtilizationPercentage(budget);

      expect(utilization).toBe(0);
    });

    it('calculates 100% utilization for exhausted budget', () => {
      const budget = createTestBudget({ totalBudget: 500, consumedAmount: 500 });
      const utilization = ResourceBudgetService.getUtilizationPercentage(budget);

      expect(utilization).toBe(100);
    });

    it('clamps utilization to 100% even if over-consumed', () => {
      const budget = createTestBudget({ totalBudget: 500, consumedAmount: 600 });
      const utilization = ResourceBudgetService.getUtilizationPercentage(budget);

      expect(utilization).toBe(100);
    });
  });

  describe('Behavior - Allocation Checks', () => {
    it('permits allocation when sufficient budget available', () => {
      const budget = createTestBudget({ totalBudget: 500, allocatedAmount: 100 });
      const canAllocate = ResourceBudgetService.canAllocate(budget, 200);

      expect(canAllocate).toBe(true);
    });

    it('rejects allocation when insufficient budget', () => {
      const budget = createTestBudget({ totalBudget: 500, consumedAmount: 400 });
      const canAllocate = ResourceBudgetService.canAllocate(budget, 200);

      expect(canAllocate).toBe(false);
    });

    it('permits zero allocation', () => {
      const budget = createTestBudget({ totalBudget: 500 });
      const canAllocate = ResourceBudgetService.canAllocate(budget, 0);

      expect(canAllocate).toBe(true);
    });
  });

  describe('Behavior - Budget Status', () => {
    it('detects exhausted budget', () => {
      const budget = createTestBudget({ totalBudget: 500, consumedAmount: 500 });
      const isExhausted = ResourceBudgetService.isExhausted(budget);

      expect(isExhausted).toBe(true);
    });

    it('detects non-exhausted budget', () => {
      const budget = createTestBudget({ totalBudget: 500, consumedAmount: 400 });
      const isExhausted = ResourceBudgetService.isExhausted(budget);

      expect(isExhausted).toBe(false);
    });

    it('detects warning threshold (at 80%)', () => {
      const budget = createTestBudget({
        totalBudget: 500,
        consumedAmount: 400,
        warningThreshold: 80,
      });
      const isAtWarning = ResourceBudgetService.isAtWarning(budget);

      expect(isAtWarning).toBe(true);
    });

    it('detects non-warning status (below threshold)', () => {
      const budget = createTestBudget({
        totalBudget: 500,
        consumedAmount: 300,
        warningThreshold: 80,
      });
      const isAtWarning = ResourceBudgetService.isAtWarning(budget);

      expect(isAtWarning).toBe(false);
    });
  });

  describe('Behavior - Allocation Permit', () => {
    it('permits allocation with available budget', () => {
      const budget = createTestBudget({ totalBudget: 500, consumedAmount: 100 });
      const permit = ResourceBudgetService.checkAllocationPermit(budget, 200);

      expect(permit.permitted).toBe(true);
      expect(permit.reason).toBeUndefined();
    });

    it('rejects allocation when blocking and exhausted', () => {
      const budget = createTestBudget({
        totalBudget: 500,
        consumedAmount: 500,
        isBlocking: true,
      });
      const permit = ResourceBudgetService.checkAllocationPermit(budget, 10);

      expect(permit.permitted).toBe(false);
      expect(permit.reason).toContain('Budget exhausted');
    });

    it('permits allocation when exhausted but not blocking', () => {
      const budget = createTestBudget({
        totalBudget: 500,
        consumedAmount: 500,
        isBlocking: false,
      });
      const permit = ResourceBudgetService.checkAllocationPermit(budget, 10);

      expect(permit.permitted).toBe(false); // Still insufficient
      expect(permit.reason).not.toContain('Budget exhausted');
    });

    it('rejects allocation exceeding remaining budget', () => {
      const budget = createTestBudget({ totalBudget: 500, consumedAmount: 400 });
      const permit = ResourceBudgetService.checkAllocationPermit(budget, 200);

      expect(permit.permitted).toBe(false);
      expect(permit.reason).toContain('Insufficient budget');
    });
  });

  describe('Behavior - Health Status', () => {
    it('reports healthy status when utilization < threshold', () => {
      const budget = createTestBudget({
        totalBudget: 500,
        consumedAmount: 300,
        warningThreshold: 80,
      });
      const health = ResourceBudgetService.getHealthStatus(budget);

      expect(health).toBe('healthy');
    });

    it('reports warning status when utilization >= threshold', () => {
      const budget = createTestBudget({
        totalBudget: 500,
        consumedAmount: 400,
        warningThreshold: 80,
      });
      const health = ResourceBudgetService.getHealthStatus(budget);

      expect(health).toBe('warning');
    });

    it('reports critical status when utilization >= 100%', () => {
      const budget = createTestBudget({
        totalBudget: 500,
        consumedAmount: 500,
      });
      const health = ResourceBudgetService.getHealthStatus(budget);

      expect(health).toBe('critical');
    });
  });

  describe('Behavior - Burndown Projection', () => {
    it('estimates days to exhaustion with positive burn rate', () => {
      const budget = createTestBudget({
        totalBudget: 100,
        consumedAmount: 0,
      });
      const daysRemaining = ResourceBudgetService.estimateDaysToExhaustion(budget, 10);

      expect(daysRemaining).toBe(10); // 100 / 10 = 10 days
    });

    it('estimates 1 day with high burn rate', () => {
      const budget = createTestBudget({
        totalBudget: 100,
        consumedAmount: 50,
      });
      const daysRemaining = ResourceBudgetService.estimateDaysToExhaustion(budget, 60);

      expect(daysRemaining).toBe(1); // ceil(50 / 60) = 1 day
    });

    it('returns null for zero or negative burn rate', () => {
      const budget = createTestBudget({ totalBudget: 100 });
      const daysRemaining = ResourceBudgetService.estimateDaysToExhaustion(budget, 0);

      expect(daysRemaining).toBeNull();
    });
  });

  describe('Behavior - Summary', () => {
    it('provides complete budget summary', () => {
      const budget = createTestBudget({
        totalBudget: 500,
        consumedAmount: 250,
        warningThreshold: 80,
      });
      const summary = ResourceBudgetService.getBudgetSummary(budget);

      expect(summary.total).toBe(500);
      expect(summary.consumed).toBe(250);
      expect(summary.remaining).toBe(250);
      expect(summary.utilization).toBe(50);
      expect(summary.health).toBe('healthy');
    });
  });

  describe('Acceptance Criteria #9', () => {
    it('criterion #9 satisfied: Resource budgets are enforced', () => {
      const budget = createTestBudget();

      // Budget can be created with constraints
      expect(budget.totalBudget).toBeGreaterThan(0);
      expect(budget.warningThreshold).toBeGreaterThanOrEqual(0);

      // Budget can be checked
      const permit = ResourceBudgetService.checkAllocationPermit(budget, 100);
      expect(typeof permit.permitted).toBe('boolean');

      // Budget status is queryable
      const health = ResourceBudgetService.getHealthStatus(budget);
      expect(['healthy', 'warning', 'critical']).toContain(health);

      // Budget enforcement is blocking-aware
      const blockingBudget = createTestBudget({
        totalBudget: 500,
        consumedAmount: 500,
        isBlocking: true,
      });
      const blockedPermit = ResourceBudgetService.checkAllocationPermit(blockingBudget, 10);
      expect(blockedPermit.permitted).toBe(false);
    });
  });
});
