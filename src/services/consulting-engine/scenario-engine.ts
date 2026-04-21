import type { Scenario, PrioritizedIntervention, Constraint } from "@/domain/consulting-engine/types";
import { v4 as uuidv4 } from "uuid";

/**
 * Scenario Engine: Creates alternative execution scenarios
 *
 * Deterministic: pattern-based scenario generation.
 */

export function generateScenarios(
  prioritizedInterventions: PrioritizedIntervention[],
  constraints: Constraint[]
): Scenario[] {
  const scenarios: Scenario[] = [];

  // Scenario 1: Aggressive path (all interventions, best case)
  scenarios.push({
    id: uuidv4(),
    name: "Aggressive Recovery (Best Case)",
    description:
      "Execute all interventions in optimal sequence with full team commitment",
    assumptions: [
      "Team capacity fully available (no other initiatives)",
      "Client budget approved for all recommended interventions",
      "No external market shocks during implementation",
      "Suppliers/partners responsive to needs",
    ],
    interventionSubset: prioritizedInterventions.map((i) => i.intervention.id),
    expectedOutcome:
      "Revenue recovery within 90 days, competitive positioning restored",
    risks: [
      "Team burnout from simultaneous initiatives",
      "Cascading failures if one intervention stumbles",
      "Over-confidence leading to quality issues",
    ],
    likelihood: "LOW",
  });

  // Scenario 2: Staged path (prioritized only)
  scenarios.push({
    id: uuidv4(),
    name: "Staged Implementation (Recommended)",
    description:
      "Execute top 3 prioritized interventions sequentially, measure, then decide on next wave",
    assumptions: [
      "Top 3 interventions address critical path to revenue recovery",
      "Team capacity for 1-2 major initiatives at a time",
      "Monthly review gates to assess progress and adjust",
    ],
    interventionSubset: prioritizedInterventions
      .slice(0, 3)
      .map((i) => i.intervention.id),
    expectedOutcome:
      "Measurable improvement in 60 days, foundation for growth set",
    risks: [
      "Slower overall recovery than aggressive path",
      "Competitors may advance while we execute gradually",
    ],
    likelihood: "HIGH",
  });

  // Scenario 3: Minimal/defensive path (containment only)
  const containmentOnly = prioritizedInterventions
    .filter((i) => i.intervention.class === "CONTAINMENT")
    .slice(0, 2);

  if (containmentOnly.length > 0) {
    scenarios.push({
      id: uuidv4(),
      name: "Defensive Hold (Minimal Risk)",
      description:
        "Execute containment interventions only to stabilize immediate crisis",
      assumptions: [
        "Longer-term structural fixes deferred 6+ months",
        "Focus on preserving cash and customer base",
        "External investment or M&A may be needed for growth",
      ],
      interventionSubset: containmentOnly.map((i) => i.intervention.id),
      expectedOutcome:
        "Stabilize revenue decline, buy time for external support",
      risks: [
        "Does not address root causes; temporary relief only",
        "Competitors gain market share during hold period",
        "Team morale declines with no visible improvement",
      ],
      likelihood: "MODERATE",
    });
  }

  return scenarios;
}

export function formatScenarios(scenarios: Scenario[]): string {
  const lines: string[] = [];

  for (const scenario of scenarios) {
    lines.push(`\n### ${scenario.name}`);
    lines.push(`**Likelihood**: ${scenario.likelihood}`);
    lines.push(`\n${scenario.description}`);

    lines.push(`\n**Assumptions**:`);
    for (const assumption of scenario.assumptions) {
      lines.push(`  - ${assumption}`);
    }

    lines.push(`\n**Expected Outcome**: ${scenario.expectedOutcome}`);

    if (scenario.risks && scenario.risks.length > 0) {
      lines.push(`\n**Risks**:`);
      for (const risk of scenario.risks) {
        lines.push(`  ⚠ ${risk}`);
      }
    }
  }

  return lines.join("\n");
}
