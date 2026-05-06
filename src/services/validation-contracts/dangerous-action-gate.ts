import { logger } from "@/infra/logger";

/**
 * Phase 0: DangerousActionGate
 *
 * Blocks unsafe recommendations from being approved or actioned.
 * Enforces constraint awareness per execution.md:
 * "Missing constraints fail validation"
 */

export interface DangerousActionInput {
  title: string;
  description?: string;
  constraintsConsidered?: string[];
  priority: string;
  rollbackPlan?: string;
  estimatedImpact?: string;
}

export interface GateViolation {
  rule: string;
  severity: "BLOCK" | "WARN";
  message: string;
}

export interface DangerousActionGateResult {
  isAllowed: boolean;
  violations: GateViolation[];
  recommendations: string[];
}

export class DangerousActionGate {
  /**
   * Critical recommendation patterns that indicate danger without proper safeguards
   */
  private readonly DANGER_KEYWORDS = [
    "delete all",
    "drop table",
    "disable",
    "remove entirely",
    "stop all",
    "terminate",
    "massive",
    "irreversible",
    "permanent",
  ];

  /**
   * Critical constraints that must always be considered
   */
  private readonly CRITICAL_CONSTRAINTS = [
    "Budget",
    "Cash flow",
    "Runway",
    "Compliance",
    "Legal",
    "Regulatory",
    "Safety",
    "Security",
    "Customer impact",
    "Revenue impact",
    "Team capacity",
  ];

  private checkForDangerPatterns(input: DangerousActionInput): GateViolation[] {
    const violations: GateViolation[] = [];
    const combinedText = `${input.title} ${input.description || ""}`.toLowerCase();

    for (const keyword of this.DANGER_KEYWORDS) {
      if (combinedText.includes(keyword)) {
        // Check if there's an adequate rollback plan
        if (!input.rollbackPlan || input.rollbackPlan.length < 50) {
          violations.push({
            rule: "DANGER_PATTERN_INSUFFICIENT_ROLLBACK",
            severity: "BLOCK",
            message: `Detected dangerous pattern (${keyword}) without comprehensive rollback plan. Rollback plan must be detailed.`,
          });
        }

        // Check for constraint awareness
        if (!input.constraintsConsidered || input.constraintsConsidered.length < 2) {
          violations.push({
            rule: "DANGER_PATTERN_INSUFFICIENT_CONSTRAINTS",
            severity: "BLOCK",
            message: `Detected dangerous pattern (${keyword}) without adequate constraint analysis. Must identify at least 2 constraints.`,
          });
        }
      }
    }

    return violations;
  }

  private checkCriticalConstraints(input: DangerousActionInput): GateViolation[] {
    const violations: GateViolation[] = [];

    if (!input.constraintsConsidered || input.constraintsConsidered.length === 0) {
      return violations; // Already caught by truth contract
    }

    // For high/critical priority actions, ensure critical constraints are considered
    if (input.priority === "high" || input.priority === "critical") {
      const consideredConstraints = input.constraintsConsidered.map((c) => c.toLowerCase());
      let foundCriticalConstraint = false;

      for (const critical of this.CRITICAL_CONSTRAINTS) {
        if (consideredConstraints.some((c) => c.includes(critical.toLowerCase()))) {
          foundCriticalConstraint = true;
          break;
        }
      }

      if (!foundCriticalConstraint) {
        violations.push({
          rule: "CRITICAL_CONSTRAINT_MISSING",
          severity: "WARN",
          message: `High/critical priority action should consider critical constraints (${this.CRITICAL_CONSTRAINTS.slice(0, 3).join(", ")}, etc.)`,
        });
      }
    }

    return violations;
  }

  private checkImpactAlignment(input: DangerousActionInput): GateViolation[] {
    const violations: GateViolation[] = [];

    // High impact without adequate rollback is dangerous
    if (input.estimatedImpact === "high") {
      if (!input.rollbackPlan || input.rollbackPlan.length < 50) {
        violations.push({
          rule: "HIGH_IMPACT_INSUFFICIENT_ROLLBACK",
          severity: "WARN",
          message: "High-impact recommendation should have detailed rollback plan. Current plan is too brief.",
        });
      }
    }

    return violations;
  }

  /**
   * Check if an action is safe to proceed.
   * Phase 0 requirement: DangerousActionGate prevents unsafe recommendations.
   */
  async evaluate(input: DangerousActionInput): Promise<DangerousActionGateResult> {
    const violations: GateViolation[] = [];
    const recommendations: string[] = [];

    violations.push(...this.checkForDangerPatterns(input));
    violations.push(...this.checkCriticalConstraints(input));
    violations.push(...this.checkImpactAlignment(input));

    const blocks = violations.filter((v) => v.severity === "BLOCK");
    const isAllowed = blocks.length === 0;

    if (!isAllowed) {
      logger.warn("DangerousActionGate blocked recommendation", {
        title: input.title,
        blockCount: blocks.length,
      });

      recommendations.push("Review recommendation for hidden risks");
      recommendations.push("Ensure rollback plan is comprehensive");
      recommendations.push("Document all considered constraints");
    }

    return {
      isAllowed,
      violations,
      recommendations,
    };
  }

  async evaluateAndThrow(input: DangerousActionInput): Promise<void> {
    const result = await this.evaluate(input);
    if (!result.isAllowed) {
      const blockMessages = result.violations
        .filter((v) => v.severity === "BLOCK")
        .map((v) => `${v.rule}: ${v.message}`);
      throw new Error(`DangerousActionGate: ${blockMessages.join("; ")}`);
    }
  }
}

export const dangerousActionGate = new DangerousActionGate();
