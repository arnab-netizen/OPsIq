// DebtPressureEngine - Debt burden and leverage analysis
// Phase 4 Slice 3: Debt sustainability relative to revenue

export interface DebtPressureAnalysis {
  totalDebt: number;
  annualRevenue: number;
  debtToRevenueRatio: number;
  debtServicePercent: number;
  riskLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'HEALTHY' | 'STRONG';
  monthlyDebtService: number;
  debtBurden: string;
}

export class DebtPressureEngine {
  /**
   * Analyze debt pressure (debt burden relative to revenue)
   * High debt-to-revenue = limited flexibility, constrained growth
   */
  static analyzeDebtPressure(
    totalDebt: number,
    annualRevenue: number,
    monthlyDebtService: number = 0
  ): DebtPressureAnalysis {
    // Prevent division by zero
    if (annualRevenue <= 0) annualRevenue = 1;
    if (totalDebt < 0) totalDebt = 0;

    // Calculate debt-to-revenue ratio
    const debtToRevenueRatio = totalDebt / annualRevenue;

    // Calculate debt service as % of revenue
    const annualDebtService = monthlyDebtService * 12;
    const debtServicePercent =
      annualRevenue > 0 ? (annualDebtService / annualRevenue) * 100 : 0;

    // Determine risk level (fail-closed)
    let riskLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'HEALTHY' | 'STRONG';
    if (debtToRevenueRatio > 3) {
      riskLevel = 'CRITICAL'; // Debt > 3x revenue
    } else if (debtToRevenueRatio > 2) {
      riskLevel = 'HIGH'; // Debt 2-3x revenue
    } else if (debtToRevenueRatio > 1) {
      riskLevel = 'MODERATE'; // Debt 1-2x revenue
    } else if (debtToRevenueRatio > 0.5) {
      riskLevel = 'HEALTHY'; // Debt 0.5-1x revenue
    } else {
      riskLevel = 'STRONG'; // Debt < 0.5x revenue
    }

    // Human-readable debt burden description
    let debtBurden: string;
    if (debtToRevenueRatio > 3) {
      debtBurden = 'Unsustainable - debt service consuming all flexibility';
    } else if (debtToRevenueRatio > 2) {
      debtBurden = 'Heavy - debt limits growth and pivot ability';
    } else if (debtToRevenueRatio > 1) {
      debtBurden = 'Elevated - debt constrains options';
    } else if (debtToRevenueRatio > 0.5) {
      debtBurden = 'Manageable - debt is sustainable';
    } else {
      debtBurden = 'Low - debt is not a constraint';
    }

    return {
      totalDebt,
      annualRevenue,
      debtToRevenueRatio,
      debtServicePercent,
      riskLevel,
      monthlyDebtService,
      debtBurden,
    };
  }

  /**
   * Check if debt level is critical (blocks growth)
   */
  static isDebtCritical(debtToRevenueRatio: number): boolean {
    return debtToRevenueRatio > 3; // Debt > 3x annual revenue
  }

  /**
   * Check if debt service consumes too much revenue
   */
  static isDebtServiceHigh(debtServicePercent: number): boolean {
    return debtServicePercent > 30; // Debt service > 30% of revenue
  }

  /**
   * Calculate debt reduction needed to reach target ratio
   */
  static calculateRequiredDebtReduction(
    currentDebt: number,
    annualRevenue: number,
    targetRatio: number = 1
  ): {
    reductionNeeded: number;
    timelineMonths: number;
    monthlyReductionRequired: number;
  } {
    const targetDebt = annualRevenue * targetRatio;
    const reductionNeeded = Math.max(0, currentDebt - targetDebt);

    // Estimate timeline to reach target (assume 10% annual reduction possible)
    const annualReductionCapacity = currentDebt * 0.1;
    const timelineMonths =
      annualReductionCapacity > 0
        ? (reductionNeeded / annualReductionCapacity) * 12
        : 0;

    const monthlyReductionRequired = reductionNeeded / Math.max(1, timelineMonths);

    return {
      reductionNeeded,
      timelineMonths,
      monthlyReductionRequired,
    };
  }

  /**
   * Get debt risk level description
   */
  static getRiskLevelDescription(level: string): string {
    const descriptions: Record<string, string> = {
      CRITICAL: 'Debt > 3x revenue - constrains all strategic decisions',
      HIGH: 'Debt 2-3x revenue - limits growth and flexibility',
      MODERATE: 'Debt 1-2x revenue - manageable but monitored',
      HEALTHY: 'Debt 0.5-1x revenue - sustainable and reasonable',
      STRONG: 'Debt < 0.5x revenue - very low leverage',
    };
    return descriptions[level] || 'Unknown';
  }

  /**
   * Calculate debt sustainability index (0-100)
   * Higher = better ability to manage debt
   */
  static calculateSustainabilityIndex(
    debtToRevenueRatio: number,
    debtServicePercent: number
  ): number {
    // Start at 100, deduct points for poor metrics
    let score = 100;

    // Deduct for high debt ratio
    if (debtToRevenueRatio > 0.5) {
      score -= Math.min(50, debtToRevenueRatio * 20);
    }

    // Deduct for high debt service
    if (debtServicePercent > 10) {
      score -= Math.min(50, debtServicePercent * 1.5);
    }

    return Math.max(0, Math.min(100, score));
  }
}
