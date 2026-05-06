import { z, ZodError } from "zod/v4";
import { logger } from "@/infra/logger";

export interface RecommendationTruthInput {
  title: string;
  description?: string;
  rationale?: string;
  estimatedImpact?: string;
  priority: string;
  rollbackPlan?: string;
  constraintsConsidered?: string[];
  confidenceLevel?: "HIGH_CONFIDENCE" | "MEDIUM_CONFIDENCE" | "LOW_CONFIDENCE" | "NEED_MORE_DATA" | "CANNOT_DETERMINE" | "DANGER_DO_NOT_ACT";
  expiresAt?: Date;
  isAIProposal?: boolean;
}

export interface TruthContractViolation {
  rule: string;
  field: string;
  message: string;
  severity: "ERROR" | "WARNING";
}

export interface RecommendationTruthResult {
  isValid: boolean;
  violations: TruthContractViolation[];
  warnings: TruthContractViolation[];
}

export class RecommendationTruthContract {
  /**
   * Phase 0 core validation: enforce anti-generic behavior.
   * Generic recommendations fail validation per execution.md acceptance criteria.
   */
  private validateNotGeneric(input: RecommendationTruthInput): TruthContractViolation[] {
    const violations: TruthContractViolation[] = [];

    if (!input.title || input.title.trim().length === 0) {
      violations.push({
        rule: "ANTI_GENERIC_TITLE",
        field: "title",
        message: "Title is required and cannot be empty",
        severity: "ERROR",
      });
    }

    if (!input.description || input.description.trim().length < 10) {
      violations.push({
        rule: "ANTI_GENERIC_DESCRIPTION",
        field: "description",
        message: "Description must be provided and at least 10 characters (generic recommendations fail validation)",
        severity: "ERROR",
      });
    }

    if (!input.rationale || input.rationale.trim().length < 20) {
      violations.push({
        rule: "ANTI_GENERIC_RATIONALE",
        field: "rationale",
        message: "Rationale must be provided with substantive explanation (at least 20 characters)",
        severity: "ERROR",
      });
    }

    return violations;
  }

  /**
   * Phase 0: Missing evidence fails validation.
   * Placeholder for future Phase 1 integration when Evidence model is linked.
   */
  private validateEvidenceRequired(input: RecommendationTruthInput): TruthContractViolation[] {
    // Phase 0 ensures structure; Phase 1 validates evidence sufficiency
    return [];
  }

  /**
   * Phase 0: Missing rollback fails validation.
   * RollbackRequirementPolicy enforces rollback capability.
   */
  private validateRollbackCapability(input: RecommendationTruthInput): TruthContractViolation[] {
    const violations: TruthContractViolation[] = [];

    if (!input.rollbackPlan || input.rollbackPlan.trim().length === 0) {
      violations.push({
        rule: "ROLLBACK_REQUIRED",
        field: "rollbackPlan",
        message: "Rollback plan must be specified (missing rollback fails validation)",
        severity: "ERROR",
      });
    }

    return violations;
  }

  /**
   * Phase 0: Missing constraints fails validation.
   * DangerousActionGate enforces constraint awareness.
   */
  private validateConstraintAwareness(input: RecommendationTruthInput): TruthContractViolation[] {
    const violations: TruthContractViolation[] = [];

    if (!input.constraintsConsidered || input.constraintsConsidered.length === 0) {
      violations.push({
        rule: "CONSTRAINTS_REQUIRED",
        field: "constraintsConsidered",
        message: "Must identify constraints considered (missing constraints fails validation)",
        severity: "ERROR",
      });
    }

    return violations;
  }

  /**
   * Phase 0: Enforce confidence state validity.
   * MinimumUsefulOutputPolicy requires valid confidence states.
   */
  private validateConfidenceState(input: RecommendationTruthInput): TruthContractViolation[] {
    const violations: TruthContractViolation[] = [];

    const validStates = [
      "HIGH_CONFIDENCE",
      "MEDIUM_CONFIDENCE",
      "LOW_CONFIDENCE",
      "NEED_MORE_DATA",
      "CANNOT_DETERMINE",
      "DANGER_DO_NOT_ACT",
    ];

    if (input.confidenceLevel && !validStates.includes(input.confidenceLevel)) {
      violations.push({
        rule: "INVALID_CONFIDENCE_STATE",
        field: "confidenceLevel",
        message: `Confidence level must be one of: ${validStates.join(", ")}`,
        severity: "ERROR",
      });
    }

    return violations;
  }

  /**
   * Phase 0: AI proposals must be sandboxed.
   * AIProposalSandbox prevents AI from bypassing validation.
   */
  private validateAIProposalContainment(input: RecommendationTruthInput): TruthContractViolation[] {
    const violations: TruthContractViolation[] = [];

    if (input.isAIProposal) {
      if (input.confidenceLevel === "DANGER_DO_NOT_ACT" || !input.confidenceLevel) {
        violations.push({
          rule: "AI_PROPOSAL_SANDBOX",
          field: "isAIProposal",
          message: "AI proposals must have explicit confidence assessment. Cannot proceed with DANGER_DO_NOT_ACT or undefined confidence.",
          severity: "ERROR",
        });
      }
    }

    return violations;
  }

  /**
   * Phase 0: Expiration enforcement.
   * RecommendationExpiryPolicy ensures expired recommendations become non-actionable.
   */
  private validateExpirationEnforcement(input: RecommendationTruthInput): TruthContractViolation[] {
    const violations: TruthContractViolation[] = [];

    if (input.expiresAt && input.expiresAt <= new Date()) {
      violations.push({
        rule: "RECOMMENDATION_EXPIRED",
        field: "expiresAt",
        message: "Recommendation expiration date must be in the future",
        severity: "ERROR",
      });
    }

    return violations;
  }

  /**
   * Phase 0: Explainability enforcement.
   * RecommendationExplanationContract enforces clear justification.
   */
  private validateExplainability(input: RecommendationTruthInput): TruthContractViolation[] {
    const violations: TruthContractViolation[] = [];

    const totalExplanation = (input.title?.length || 0) + (input.rationale?.length || 0) + (input.description?.length || 0);

    if (totalExplanation < 50) {
      violations.push({
        rule: "INSUFFICIENT_EXPLANATION",
        field: "explanation",
        message: "Must provide sufficient explanation (title + rationale + description must total at least 50 characters)",
        severity: "ERROR",
      });
    }

    return violations;
  }

  async validateTruthContract(input: RecommendationTruthInput): Promise<RecommendationTruthResult> {
    const errors: TruthContractViolation[] = [];

    errors.push(...this.validateNotGeneric(input));
    errors.push(...this.validateRollbackCapability(input));
    errors.push(...this.validateConstraintAwareness(input));
    errors.push(...this.validateConfidenceState(input));
    errors.push(...this.validateAIProposalContainment(input));
    errors.push(...this.validateExpirationEnforcement(input));
    errors.push(...this.validateExplainability(input));
    errors.push(...this.validateEvidenceRequired(input));

    const violations = errors.filter((e) => e.severity === "ERROR");
    const warnings = errors.filter((e) => e.severity === "WARNING");

    const isValid = violations.length === 0;

    if (!isValid) {
      logger.warn("Recommendation truth contract validation failed", {
        violationCount: violations.length,
        violations: violations.map((v) => v.rule),
      });
    }

    return {
      isValid,
      violations,
      warnings,
    };
  }

  async validateAndThrow(input: RecommendationTruthInput): Promise<void> {
    const result = await this.validateTruthContract(input);
    if (!result.isValid) {
      const errorMessages = result.violations.map((v) => `${v.rule} (${v.field}): ${v.message}`);
      throw new Error(`Recommendation truth contract violation: ${errorMessages.join("; ")}`);
    }
  }
}

export const recommendationTruthContract = new RecommendationTruthContract();
