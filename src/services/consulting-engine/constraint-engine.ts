import type { Constraint, EvidenceItem } from "@/domain/consulting-engine/types";
import { ConstraintType } from "@/domain/consulting-engine/types";
import { v4 as uuidv4 } from "uuid";

/**
 * Constraint Engine: Identifies constraints that limit intervention options.
 *
 * A constraint is something that:
 * - Cannot be changed in the short term (< 3 months)
 * - Blocks or delays certain types of interventions
 * - Must be released or worked around to proceed
 *
 * Deterministic: no external calls, pure function.
 */

interface ConstraintPattern {
  pattern: (evidence: EvidenceItem[], context: any) => boolean;
  constraint: (evidence: EvidenceItem[], context: any) => Constraint;
}

const constraintPatterns: ConstraintPattern[] = [
  {
    pattern: (evidence, context) =>
      // High turnaround time + limited equipment mentions = resource constraint
      evidence.some(
        (e) =>
          e.dimension === "operational_efficiency" &&
          e.isCritical &&
          e.finding.toLowerCase().includes("turnaround")
      ) && context.industryRequiresCapital,
    constraint: (evidence, context) => ({
      id: uuidv4(),
      type: ConstraintType.RESOURCE,
      description:
        "Limited production/service capacity requires capital investment",
      severity: "HIGH",
      blocksActions: [
        "volume_increase",
        "market_expansion",
        "aggressive_growth",
      ],
      releasableVia: ["equipment_investment", "facility_upgrade"],
    }),
  },
  {
    pattern: (evidence, context) =>
      // High complaint rate with no quality process evidence = skill constraint
      evidence.some(
        (e) =>
          e.dimension === "quality_delivery" &&
          e.finding.toLowerCase().includes("complaint")
      ) &&
      !evidence.some(
        (e) =>
          e.dimension === "process_maturity" &&
          e.finding.toLowerCase().includes("quality")
      ),
    constraint: (evidence, context) => ({
      id: uuidv4(),
      type: ConstraintType.SKILL,
      description:
        "Quality control processes not documented; team quality assurance capability limited",
      severity: "MEDIUM",
      blocksActions: ["scale_quality", "automated_quality"],
      releasableVia: ["training_program", "process_documentation"],
    }),
  },
  {
    pattern: (evidence, context) =>
      // Low repeat customers + no retention mechanism = organizational constraint
      evidence.some(
        (e) =>
          e.dimension === "customer_retention" &&
          e.finding.toLowerCase().includes("repeat")
      ),
    constraint: (evidence, context) => ({
      id: uuidv4(),
      type: ConstraintType.ORGANIZATIONAL,
      description:
        "No customer relationship management system or loyalty program infrastructure",
      severity: "MEDIUM",
      blocksActions: ["retention_focus", "relationship_marketing"],
      releasableVia: ["crm_implementation", "loyalty_program_design"],
    }),
  },
  {
    pattern: (evidence, context) =>
      // Evidence of manual processes + low team capability = process constraint
      evidence.some(
        (e) =>
          e.dimension === "process_maturity" &&
          e.finding.toLowerCase().includes("manual")
      ),
    constraint: (evidence, context) => ({
      id: uuidv4(),
      type: ConstraintType.PROCESS,
      description: "Manual processes limit scalability and consistency",
      severity: "MEDIUM",
      blocksActions: ["scale", "automate"],
      releasableVia: ["process_redesign", "system_implementation"],
    }),
  },
];

export interface ConstraintAnalysis {
  identifiedConstraints: Constraint[];
  activeBlocks: Map<string, string[]>; // intervention ID -> list of constraint IDs
  releasePath: Constraint[]; // constraints that must be released first
  quickWins: string[]; // actions that DON'T require constraint release
}

export function identifyConstraints(
  evidence: EvidenceItem[],
  context: {
    industryRequiresCapital?: boolean;
    businessSize?: string;
    currentTeamSize?: number;
  }
): ConstraintAnalysis {
  const identifiedConstraints: Constraint[] = [];

  for (const patternDef of constraintPatterns) {
    if (patternDef.pattern(evidence, context)) {
      identifiedConstraints.push(
        patternDef.constraint(evidence, context)
      );
    }
  }

  // Determine release path (topologically sort by dependencies)
  const releasePath = topoSortConstraints(identifiedConstraints);

  const activeBlocks = new Map<string, string[]>();

  return {
    identifiedConstraints,
    activeBlocks,
    releasePath,
    quickWins: generateQuickWins(evidence, identifiedConstraints),
  };
}

function topoSortConstraints(constraints: Constraint[]): Constraint[] {
  // Simple topological sort: constraints with fewer dependencies first
  return constraints.sort((a, b) => {
    const aBlocks = a.blocksActions.length;
    const bBlocks = b.blocksActions.length;
    return aBlocks - bBlocks;
  });
}

function generateQuickWins(
  evidence: EvidenceItem[],
  constraints: Constraint[]
): string[] {
  const wins: string[] = [];

  // Quick wins are interventions that don't require constraint release
  if (
    evidence.some(
      (e) =>
        e.dimension === "quality_delivery" &&
        e.finding.toLowerCase().includes("complaint")
    )
  ) {
    // If we have quality complaints but no capital constraint, we can create QA checkpoints
    const hasCapitalConstraint = constraints.some(
      (c) => c.type === ConstraintType.CAPITAL
    );
    if (!hasCapitalConstraint) {
      wins.push("Implement complaint tracking and root-cause review process");
    }
  }

  if (
    evidence.some(
      (e) =>
        e.dimension === "customer_retention" &&
        e.finding.toLowerCase().includes("repeat")
    )
  ) {
    // Customer retention can often start with simple process changes
    const hasOrgConstraint = constraints.some(
      (c) => c.type === ConstraintType.ORGANIZATIONAL
    );
    if (!hasOrgConstraint) {
      wins.push("Create simple customer follow-up communication protocol");
    }
  }

  return wins;
}

export function formatConstraintSummary(analysis: ConstraintAnalysis): string {
  const lines: string[] = [];

  if (analysis.identifiedConstraints.length === 0) {
    lines.push("No critical constraints identified.");
    return lines.join("\n");
  }

  lines.push(`${analysis.identifiedConstraints.length} constraint(s) identified:`);
  for (const constraint of analysis.identifiedConstraints) {
    lines.push(`\n• [${constraint.type}] ${constraint.description}`);
    lines.push(`  Severity: ${constraint.severity}`);
    lines.push(
      `  Blocks: ${constraint.blocksActions.join(", ")}`
    );
  }

  if (analysis.releasePath.length > 0) {
    lines.push(
      `\nRelease sequence: ${analysis.releasePath.map((c) => c.type).join(" → ")}`
    );
  }

  if (analysis.quickWins.length > 0) {
    lines.push(`\nQuick wins (no constraint release required):`);
    for (const win of analysis.quickWins) {
      lines.push(`  - ${win}`);
    }
  }

  return lines.join("\n");
}
