// Service for managing resource budgets and enforcement
// Phase 2 Acceptance Criterion #9: "Resource budgets are enforced"

import {
  CreateResourceBudgetRequest,
  CreateResourceBudgetRequestSchema,
  ResourceBudget,
  ResourceBudgetSchema,
  ResourceType,
  BudgetAllocation,
} from '../domain/resource-budget';

export class ResourceBudgetService {
  /**
   * Calculate remaining budget
   */
  static getRemainingBudget(budget: ResourceBudget): number {
    return Math.max(0, budget.totalBudget - budget.consumedAmount);
  }

  /**
   * Calculate utilization percentage (0-100)
   */
  static getUtilizationPercentage(budget: ResourceBudget): number {
    if (budget.totalBudget === 0) return 0;
    const percentage = (budget.consumedAmount / budget.totalBudget) * 100;
    return Math.min(100, Math.max(0, percentage));
  }

  /**
   * Check if budget can accommodate a proposed allocation
   */
  static canAllocate(budget: ResourceBudget, amount: number): boolean {
    const remaining = this.getRemainingBudget(budget);
    return amount <= remaining;
  }

  /**
   * Check if budget is exhausted
   */
  static isExhausted(budget: ResourceBudget): boolean {
    return budget.consumedAmount >= budget.totalBudget;
  }

  /**
   * Check if budget is at warning threshold
   */
  static isAtWarning(budget: ResourceBudget): boolean {
    const utilization = this.getUtilizationPercentage(budget);
    return utilization >= budget.warningThreshold;
  }

  /**
   * Check if a resource allocation is permitted by budget
   * Returns {permitted: boolean, reason?: string}
   */
  static checkAllocationPermit(
    budget: ResourceBudget,
    requestedAmount: number
  ): { permitted: boolean; reason?: string } {
    if (this.isExhausted(budget) && budget.isBlocking) {
      return {
        permitted: false,
        reason: `Budget exhausted: ${budget.consumedAmount}/${budget.totalBudget} ${budget.unit} consumed`,
      };
    }

    if (!this.canAllocate(budget, requestedAmount)) {
      const remaining = this.getRemainingBudget(budget);
      return {
        permitted: false,
        reason: `Insufficient budget: requested ${requestedAmount} but only ${remaining} ${budget.unit} available`,
      };
    }

    return { permitted: true };
  }

  /**
   * Calculate aggregate remaining budget across multiple budgets
   */
  static getAggregateRemaining(budgets: ResourceBudget[], resourceType?: ResourceType): number {
    return budgets
      .filter((b) => !resourceType || b.resourceType === resourceType)
      .reduce((sum, b) => sum + this.getRemainingBudget(b), 0);
  }

  /**
   * Get health status: healthy, warning, critical
   */
  static getHealthStatus(budget: ResourceBudget): 'healthy' | 'warning' | 'critical' {
    const utilization = this.getUtilizationPercentage(budget);

    if (utilization >= 100) return 'critical';
    if (utilization >= budget.warningThreshold) return 'warning';
    return 'healthy';
  }

  /**
   * Estimate time to budget exhaustion based on current burn rate
   * Returns days remaining (or null if budget is increasing/stable)
   */
  static estimateDaysToExhaustion(
    budget: ResourceBudget,
    dailyBurnRate: number
  ): number | null {
    const remaining = this.getRemainingBudget(budget);
    if (dailyBurnRate <= 0) return null; // Not burning or static
    return Math.ceil(remaining / dailyBurnRate);
  }

  /**
   * Get budget summary for operator visibility
   */
  static getBudgetSummary(budget: ResourceBudget): {
    resourceType: ResourceType;
    total: number;
    consumed: number;
    remaining: number;
    utilization: number;
    health: 'healthy' | 'warning' | 'critical';
    isBlocking: boolean;
  } {
    return {
      resourceType: budget.resourceType,
      total: budget.totalBudget,
      consumed: budget.consumedAmount,
      remaining: this.getRemainingBudget(budget),
      utilization: this.getUtilizationPercentage(budget),
      health: this.getHealthStatus(budget),
      isBlocking: budget.isBlocking,
    };
  }

  static validateRequest(request: unknown): CreateResourceBudgetRequest {
    return CreateResourceBudgetRequestSchema.parse(request);
  }

  static validateBudget(budget: unknown): ResourceBudget {
    return ResourceBudgetSchema.parse(budget);
  }
}
