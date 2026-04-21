import type {
  Intervention,
  PrioritizedIntervention,
  PrioritizationFactor,
  Constraint,
} from "@/domain/consulting-engine/types";

/**
 * Prioritization Engine: Ranks interventions by impact, feasibility, and
 * sequencing constraints.
 *
 * Deterministic: pure scoring function.
 */

interface PrioritizationContext {
  revenueUrgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  executionCapacity: "LOW" | "MEDIUM" | "HIGH";
  constraints: Constraint[];
}

export function prioritizeInterventions(
  interventions: Intervention[],
  context: PrioritizationContext
): PrioritizedIntervention[] {
  const scored = interventions.map((intervention) =>
    scoreIntervention(intervention, context)
  );

  // Sort by score descending
  scored.sort((a, b) => b.priorityScore - a.priorityScore);

  // Apply sequencing constraints
  const sequenced = applySequencingConstraints(scored, context.constraints);

  return sequenced;
}

function scoreIntervention(
  intervention: Intervention,
  context: PrioritizationContext
): PrioritizedIntervention {
  const factors: PrioritizationFactor[] = [];
  let totalScore = 0;

  // 1. Revenue impact (30% weight)
  const revenueScore = scoreRevenueImpact(
    intervention.expectedImpactOnRevenue,
    context.revenueUrgency
  );
  factors.push({
    factor: "Revenue Impact",
    score: revenueScore,
    rationale: `Expected revenue impact: ${intervention.expectedImpactOnRevenue}. Urgency: ${context.revenueUrgency}`,
  });
  totalScore += revenueScore * 0.3;

  // 2. Implementation feasibility (25% weight)
  const feasibilityScore = scoreImplementationFeasibility(
    intervention,
    context.executionCapacity
  );
  factors.push({
    factor: "Feasibility",
    score: feasibilityScore,
    rationale: `Duration: ${intervention.estimatedTotalDays} days. Team capacity: ${context.executionCapacity}. Cost: ${intervention.estimatedCostBand}`,
  });
  totalScore += feasibilityScore * 0.25;

  // 3. Risk management (20% weight)
  const riskScore = scoreRiskProfile(intervention);
  factors.push({
    factor: "Risk Management",
    score: riskScore,
    rationale: `Failure risks: ${intervention.failureRisks.length}. Fallback plan available: ${intervention.fallbackPlan ? "Yes" : "No"}`,
  });
  totalScore += riskScore * 0.2;

  // 4. Sequencing advantage (15% weight)
  const sequencingScore = scoreSequencingAdvantage(intervention);
  factors.push({
    factor: "Sequencing",
    score: sequencingScore,
    rationale: `Enables ${intervention.expectedImpactOnRevenue === "TRANSFORMATIVE" ? "multiple" : "few"} downstream interventions`,
  });
  totalScore += sequencingScore * 0.15;

  // 5. Cost efficiency (10% weight)
  const costScore = scoreCostEfficiency(
    intervention.estimatedCostBand,
    intervention.expectedImpactOnRevenue
  );
  factors.push({
    factor: "Cost Efficiency",
    score: costScore,
    rationale: `Cost band: ${intervention.estimatedCostBand} vs Expected impact: ${intervention.expectedImpactOnRevenue}`,
  });
  totalScore += costScore * 0.1;

  // Scale to 0-100
  const priorityScore = Math.round(totalScore * 10);

  const sequencingReason = determineSequencingReason(
    intervention,
    context
  );

  return {
    intervention,
    priorityScore,
    factors,
    sequencingReason,
  };
}

function scoreRevenueImpact(
  expectedImpact: string,
  urgency: string
): number {
  const baseScores: Record<string, number> = {
    NONE: 2,
    MINOR: 4,
    SIGNIFICANT: 8,
    TRANSFORMATIVE: 10,
  };

  const urgencyMultipliers: Record<string, number> = {
    LOW: 0.8,
    MEDIUM: 1,
    HIGH: 1.2,
    CRITICAL: 1.5,
  };

  const base = baseScores[expectedImpact] || 2;
  const multiplier = urgencyMultipliers[urgency] || 1;

  return Math.min(10, base * multiplier);
}

function scoreImplementationFeasibility(
  intervention: Intervention,
  capacity: string
): number {
  const capacityModifier: Record<string, number> = {
    LOW: 0.6,
    MEDIUM: 1,
    HIGH: 1.2,
  };

  const costModifier: Record<string, number> = {
    MINIMAL: 10,
    LOW: 8,
    MEDIUM: 6,
    HIGH: 2,
  };

  const daysModifier =
    intervention.estimatedTotalDays < 14 ? 2 : intervention.estimatedTotalDays < 30 ? 1 : 0.5;

  const baseScore = costModifier[intervention.estimatedCostBand] * daysModifier;
  const adjustedScore =
    baseScore * capacityModifier[capacity];

  return Math.min(10, adjustedScore);
}

function scoreRiskProfile(intervention: Intervention): number {
  const riskCount = intervention.failureRisks.length;
  const hasBackupPlan = !!intervention.fallbackPlan;

  let score = 10 - Math.min(riskCount * 1.5, 8);
  if (hasBackupPlan) {
    score += 2;
  }

  return Math.max(1, Math.min(10, score));
}

function scoreSequencingAdvantage(intervention: Intervention): number {
  // Interventions that enable others or release constraints score higher
  // For now, structural repairs score higher than growth
  const classScores: Record<string, number> = {
    CONTAINMENT: 4,
    STABILIZATION: 7,
    STRUCTURAL_REPAIR: 9,
    GROWTH_ENABLEMENT: 6,
    RESILIENCE_PROTECTION: 5,
  };

  return classScores[intervention.class] || 5;
}

function scoreCostEfficiency(
  costBand: string,
  expectedImpact: string
): number {
  const costBandScore: Record<string, number> = {
    MINIMAL: 10,
    LOW: 8,
    MEDIUM: 5,
    HIGH: 2,
  };

  const impactScore: Record<string, number> = {
    NONE: 1,
    MINOR: 3,
    SIGNIFICANT: 7,
    TRANSFORMATIVE: 10,
  };

  const cost = costBandScore[costBand] || 5;
  const impact = impactScore[expectedImpact] || 5;

  // Efficiency is impact / cost
  return Math.min(10, (impact / cost) * 5);
}

function determineSequencingReason(
  intervention: Intervention,
  context: PrioritizationContext
): string {
  if (
    context.revenueUrgency === "CRITICAL" &&
    intervention.class === "STABILIZATION"
  ) {
    return "Critical revenue urgency requires immediate stabilization";
  }

  if (
    intervention.class === "STRUCTURAL_REPAIR" &&
    intervention.expectedImpactOnRevenue === "TRANSFORMATIVE"
  ) {
    return "Foundational repair that enables downstream improvements";
  }

  if (intervention.estimatedTotalDays < 14) {
    return "Quick implementation builds momentum and shows progress";
  }

  return "Optimal balance of impact and feasibility";
}

function applySequencingConstraints(
  scored: PrioritizedIntervention[],
  constraints: Constraint[]
): PrioritizedIntervention[] {
  // Enforce natural intervention class sequence: CONTAINMENT → STABILIZATION → STRUCTURAL_REPAIR
  const classSequence: Record<string, number> = {
    CONTAINMENT: 1,
    STABILIZATION: 2,
    STRUCTURAL_REPAIR: 3,
    RESILIENCE_PROTECTION: 2,
    GROWTH_ENABLEMENT: 3,
  };

  const blockingConstraints = constraints.filter(
    (c) => c.blocksActions && c.blocksActions.length > 0
  );

  return scored.sort((a, b) => {
    // First, check if either releases a constraint
    const aReleasesConstraint = blockingConstraints.some((c) =>
      c.releasableVia.some((release) =>
        a.intervention.title.toLowerCase().includes(release.toLowerCase())
      )
    );

    const bReleasesConstraint = blockingConstraints.some((c) =>
      c.releasableVia.some((release) =>
        b.intervention.title.toLowerCase().includes(release.toLowerCase())
      )
    );

    if (aReleasesConstraint && !bReleasesConstraint) return -1;
    if (!aReleasesConstraint && bReleasesConstraint) return 1;

    // Then, enforce class sequence
    const aSequence = classSequence[a.intervention.class] || 999;
    const bSequence = classSequence[b.intervention.class] || 999;

    if (aSequence !== bSequence) {
      return aSequence - bSequence;
    }

    // Finally, sort by score within the same class
    return b.priorityScore - a.priorityScore;
  });
}

export function formatPrioritization(
  interventions: PrioritizedIntervention[]
): string {
  const lines: string[] = [];

  for (let i = 0; i < interventions.length; i++) {
    const item = interventions[i];
    lines.push(
      `\n${i + 1}. [PRIORITY ${item.priorityScore}/100] ${item.intervention.title}`
    );
    lines.push(`   ${item.sequencingReason}`);

    lines.push(`\n   Scoring factors:`);
    for (const factor of item.factors) {
      lines.push(
        `     • ${factor.factor}: ${factor.score.toFixed(1)}/10 - ${factor.rationale}`
      );
    }

    if (item.blockedUntil && item.blockedUntil.length > 0) {
      lines.push(`   ⚠ Blocked until: ${item.blockedUntil.join(", ")}`);
    }
  }

  return lines.join("\n");
}
