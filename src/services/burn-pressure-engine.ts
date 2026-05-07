// BurnPressureEngine - Burn rate pressure and sustainability analysis
// Phase 4 Slice 3: Cash burn intensity relative to cash position

export interface BurnPressureAnalysis {
  monthlyBurn: number;
  currentCash: number;
  burnIntensity: number;
  burnPressurePercent: number;
  pressureLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'HEALTHY' | 'SUSTAINABLE';
  monthsOfCashRemaining: number;
  weeksOfCashRemaining: number;
  criticalThreshold: boolean;
}

export class BurnPressureEngine {
  /**
   * Analyze burn pressure (burn rate relative to cash position)
   * High burn pressure = cash depletes quickly
   */
  static analyzeBurnPressure(
    monthlyBurn: number,
    currentCash: number
  ): BurnPressureAnalysis {
    // Prevent division by zero
    if (currentCash <= 0) currentCash = 1;
    if (monthlyBurn <= 0) monthlyBurn = 0;

    // Calculate burn intensity: burn as % of current cash
    const burnIntensity = monthlyBurn / currentCash;
    const burnPressurePercent = (burnIntensity / 1) * 100; // Monthly burn as % of total cash

    // Determine pressure level (fail-closed: more conservative)
    let pressureLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'HEALTHY' | 'SUSTAINABLE';
    if (burnPressurePercent > 50) {
      pressureLevel = 'CRITICAL'; // Burn > 50% of cash per month
    } else if (burnPressurePercent > 25) {
      pressureLevel = 'HIGH'; // Burn > 25% per month
    } else if (burnPressurePercent > 10) {
      pressureLevel = 'MODERATE'; // Burn > 10% per month
    } else if (burnPressurePercent > 3) {
      pressureLevel = 'HEALTHY'; // Burn 3-10% per month
    } else {
      pressureLevel = 'SUSTAINABLE'; // Burn < 3% per month
    }

    // Calculate time to depletion
    const monthsOfCashRemaining =
      monthlyBurn === 0 ? 999 : currentCash / monthlyBurn;
    const weeksOfCashRemaining = monthsOfCashRemaining * 4.33;

    // Critical threshold: less than 1 month of burn remaining in cash
    const criticalThreshold = monthsOfCashRemaining < 1;

    return {
      monthlyBurn,
      currentCash,
      burnIntensity,
      burnPressurePercent,
      pressureLevel,
      monthsOfCashRemaining,
      weeksOfCashRemaining,
      criticalThreshold,
    };
  }

  /**
   * Check if burn is unsustainable (immediate action required)
   */
  static isBurnUnsustainable(burnPressurePercent: number): boolean {
    return burnPressurePercent > 50; // More than 50% of cash per month
  }

  /**
   * Get burn pressure level description
   */
  static getPressureLevelDescription(level: string): string {
    const descriptions: Record<string, string> = {
      CRITICAL: 'Burn > 50% of cash monthly - immediate action required',
      HIGH: 'Burn 25-50% monthly - urgent stabilization needed',
      MODERATE: 'Burn 10-25% monthly - monitor closely, plan reductions',
      HEALTHY: 'Burn 3-10% monthly - sustainable but watch for acceleration',
      SUSTAINABLE: 'Burn < 3% monthly - very healthy burn rate',
    };
    return descriptions[level] || 'Unknown';
  }

  /**
   * Calculate required cost reduction to reach target burn
   */
  static calculateRequiredCostReduction(
    currentBurn: number,
    targetBurn: number
  ): {
    reductionNeeded: number;
    reductionPercent: number;
    achievable: boolean;
  } {
    const reductionNeeded = Math.max(0, currentBurn - targetBurn);
    const reductionPercent =
      currentBurn > 0 ? (reductionNeeded / currentBurn) * 100 : 0;

    return {
      reductionNeeded,
      reductionPercent,
      achievable: reductionNeeded >= 0,
    };
  }
}
