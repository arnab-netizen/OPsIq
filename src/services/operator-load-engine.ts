// OperatorLoadEngine - Operator capacity and utilization analysis
// Phase 4 Slice 4: Human execution capacity constraints

export interface OperatorLoadAnalysis {
  operatorCapacityPercent: number;
  availableCapacity: number;
  utilizationLevel: 'CRITICAL' | 'OVERLOADED' | 'AT_CAPACITY' | 'HEALTHY' | 'UNDERUTILIZED';
  canTakeNewWork: boolean;
  recoveryWeeks: number;
  bottleneckRisk: boolean;
}

export class OperatorLoadEngine {
  /**
   * Analyze operator load (utilization of operator capacity)
   * High load = limited ability to execute new recommendations
   */
  static analyzeOperatorLoad(
    operatorCapacityPercent: number
  ): OperatorLoadAnalysis {
    // Ensure percentage is within bounds
    operatorCapacityPercent = Math.max(0, Math.min(100, operatorCapacityPercent));

    // Determine utilization level (fail-closed: more conservative)
    let utilizationLevel: 'CRITICAL' | 'OVERLOADED' | 'AT_CAPACITY' | 'HEALTHY' | 'UNDERUTILIZED';
    if (operatorCapacityPercent > 95) {
      utilizationLevel = 'CRITICAL'; // >95% capacity
    } else if (operatorCapacityPercent > 85) {
      utilizationLevel = 'OVERLOADED'; // 85-95% capacity
    } else if (operatorCapacityPercent > 75) {
      utilizationLevel = 'AT_CAPACITY'; // 75-85% capacity
    } else if (operatorCapacityPercent > 40) {
      utilizationLevel = 'HEALTHY'; // 40-75% capacity
    } else {
      utilizationLevel = 'UNDERUTILIZED'; // <40% capacity
    }

    // Calculate available capacity
    const availableCapacity = 100 - operatorCapacityPercent;

    // Can take new work?
    const canTakeNewWork = operatorCapacityPercent < 80; // Need 20% free capacity

    // Estimate recovery time (weeks to drop from critical to healthy)
    const recoveryWeeks =
      operatorCapacityPercent > 75
        ? Math.ceil((operatorCapacityPercent - 75) / 2) // Assume 2% per week recovery
        : 0;

    // Bottleneck risk: operator is critical path blocker
    const bottleneckRisk = operatorCapacityPercent > 85;

    return {
      operatorCapacityPercent,
      availableCapacity,
      utilizationLevel,
      canTakeNewWork,
      recoveryWeeks,
      bottleneckRisk,
    };
  }

  /**
   * Check if operator is overloaded (blocks execution)
   */
  static isOperatorOverloaded(operatorCapacityPercent: number): boolean {
    return operatorCapacityPercent > 85;
  }

  /**
   * Check if operator is in critical state (immediate relief needed)
   */
  static isOperatorCritical(operatorCapacityPercent: number): boolean {
    return operatorCapacityPercent > 95;
  }

  /**
   * Get utilization level description
   */
  static getUtilizationDescription(level: string): string {
    const descriptions: Record<string, string> = {
      CRITICAL:
        'Operator >95% capacity - cannot add work, burnout risk imminent',
      OVERLOADED:
        'Operator 85-95% capacity - severely constrained, high stress',
      AT_CAPACITY:
        'Operator 75-85% capacity - near limits, risky to add more',
      HEALTHY: 'Operator 40-75% capacity - sustainable utilization',
      UNDERUTILIZED:
        'Operator <40% capacity - can absorb significant new work',
    };
    return descriptions[level] || 'Unknown';
  }

  /**
   * Calculate workload reduction needed to reach target utilization
   */
  static calculateRequiredWorkloadReduction(
    currentCapacityPercent: number,
    targetCapacityPercent: number = 75
  ): {
    reductionNeeded: number;
    reductionPercent: number;
    achievable: boolean;
  } {
    const reductionNeeded = Math.max(
      0,
      currentCapacityPercent - targetCapacityPercent
    );
    const reductionPercent =
      currentCapacityPercent > 0
        ? (reductionNeeded / currentCapacityPercent) * 100
        : 0;

    return {
      reductionNeeded,
      reductionPercent,
      achievable: reductionNeeded >= 0,
    };
  }
}
