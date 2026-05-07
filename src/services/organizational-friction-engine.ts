// OrganizationalFrictionEngine - Organizational cohesion and execution friction analysis
// Phase 4 Slice 4: Team dynamics and execution risk from organizational dysfunction

export interface OrganizationalFrictionAnalysis {
  frictionScore: number; // 0-100, higher = more friction
  frictionLevel: 'HEALTHY' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  communicationBreakdownRisk: boolean;
  changeResistanceRisk: boolean;
  misalignmentRisk: boolean;
  executionRisk: boolean;
  recoveryWeeks: number;
}

export class OrganizationalFrictionEngine {
  /**
   * Analyze organizational friction (team cohesion, alignment, communication)
   * High friction = reduced execution capability despite capacity
   */
  static analyzeFriction(frictionScore: number): OrganizationalFrictionAnalysis {
    // Ensure score is within bounds
    frictionScore = Math.max(0, Math.min(100, frictionScore));

    // Determine friction level (fail-closed: more conservative)
    let frictionLevel: 'HEALTHY' | 'MODERATE' | 'HIGH' | 'CRITICAL';
    if (frictionScore > 75) {
      frictionLevel = 'CRITICAL'; // >75 score
    } else if (frictionScore > 50) {
      frictionLevel = 'HIGH'; // 50-75 score
    } else if (frictionScore > 25) {
      frictionLevel = 'MODERATE'; // 25-50 score
    } else {
      frictionLevel = 'HEALTHY'; // <25 score
    }

    // Risk assessments (higher friction = higher risk)
    const communicationBreakdownRisk = frictionScore > 60;
    const changeResistanceRisk = frictionScore > 50;
    const misalignmentRisk = frictionScore > 40;
    const executionRisk = frictionScore > 35;

    // Recovery time: weeks to reduce friction to healthy levels
    const recoveryWeeks =
      frictionScore > 25
        ? Math.ceil((frictionScore - 25) / 5) // Assume 5 points per week improvement
        : 0;

    return {
      frictionScore,
      frictionLevel,
      communicationBreakdownRisk,
      changeResistanceRisk,
      misalignmentRisk,
      executionRisk,
      recoveryWeeks,
    };
  }

  /**
   * Check if friction is causing execution breakdown
   */
  static isFrictionCritical(frictionScore: number): boolean {
    return frictionScore > 75;
  }

  /**
   * Check if friction is high enough to block execution
   */
  static isFrictionHigh(frictionScore: number): boolean {
    return frictionScore > 50;
  }

  /**
   * Get friction level description
   */
  static getFrictionDescription(level: string): string {
    const descriptions: Record<string, string> = {
      CRITICAL:
        'Organization >75 friction - severe dysfunction, execution breakdown imminent',
      HIGH: 'Organization 50-75 friction - significant dysfunction, major execution delays',
      MODERATE:
        'Organization 25-50 friction - noticeable dysfunction, some execution delays',
      HEALTHY:
        'Organization <25 friction - healthy coordination, execution moving smoothly',
    };
    return descriptions[level] || 'Unknown';
  }

  /**
   * Calculate friction reduction needed to reach target
   */
  static calculateRequiredFrictionReduction(
    currentFrictionScore: number,
    targetFrictionScore: number = 25
  ): {
    reductionNeeded: number;
    reductionPercent: number;
    achievable: boolean;
  } {
    const reductionNeeded = Math.max(0, currentFrictionScore - targetFrictionScore);
    const reductionPercent =
      currentFrictionScore > 0 ? (reductionNeeded / currentFrictionScore) * 100 : 0;

    return {
      reductionNeeded,
      reductionPercent,
      achievable: reductionNeeded >= 0,
    };
  }

  /**
   * Assess communication effectiveness
   */
  static isCommunicationEffective(frictionScore: number): boolean {
    return frictionScore < 60; // Communication breaks down at >60 friction
  }

  /**
   * Assess change readiness
   */
  static isChangeReady(frictionScore: number): boolean {
    return frictionScore < 50; // Cannot successfully implement change at >50 friction
  }
}
