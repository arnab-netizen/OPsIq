/**
 * Phase 0 — System Truth Contract
 * Consolidated contracts for recommendation validation
 */


/**
 * RollbackRequirementPolicy: Enforce rollback capability
 * Phase 0 acceptance criterion: Missing rollback fails validation
 */
export class RollbackRequirementPolicy {
  validate(rollbackPlan?: string): { valid: boolean; message?: string } {
    if (!rollbackPlan || rollbackPlan.trim().length === 0) {
      return {
        valid: false,
        message: "Rollback plan is required. Every recommendation must be reversible.",
      };
    }

    if (rollbackPlan.length < 20) {
      return {
        valid: false,
        message: "Rollback plan must be substantive (at least 20 characters). Provide clear reversal procedure.",
      };
    }

    return { valid: true };
  }
}

/**
 * RecommendationExpiryPolicy: Enforce time-bound recommendations
 * Phase 0 acceptance criterion: Expired recommendation becomes non-actionable
 */
export class RecommendationExpiryPolicy {
  /**
   * Default expiration: 30 days if not specified
   */
  getDefaultExpiration(): Date {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date;
  }

  isExpired(expiresAt?: Date): boolean {
    if (!expiresAt) return false;
    return new Date() > expiresAt;
  }

  validate(expiresAt?: Date): { valid: boolean; message?: string } {
    if (!expiresAt) {
      // If no expiry set, recommend default
      return { valid: true };
    }

    if (expiresAt <= new Date()) {
      return {
        valid: false,
        message: "Expiration date must be in the future",
      };
    }

    return { valid: true };
  }
}

/**
 * MinimumUsefulOutputPolicy: Ensure minimum utility under low confidence
 * Phase 0 acceptance criterion: Minimum useful output exists under low confidence
 */
export class MinimumUsefulOutputPolicy {
  /**
   * Under low confidence/NEED_MORE_DATA states, provide minimum safe actions
   */
  getMinimumUsefulOutput(confidenceLevel?: string): string[] {
    if (!confidenceLevel || confidenceLevel === "NEED_MORE_DATA" || confidenceLevel === "LOW_CONFIDENCE") {
      return [
        "Evidence collection task: Gather more data",
        "Observation task: Monitor metrics",
        "Reversible micro-action: Test on small segment first",
        "Human review request: Schedule leadership review",
        "Low-risk monitoring: Set up alerts and dashboards",
      ];
    }

    return [];
  }

  validate(confidenceLevel?: string, description?: string): { valid: boolean; message?: string } {
    // Low confidence recommendations must still provide useful minimum output
    if (confidenceLevel === "NEED_MORE_DATA" || confidenceLevel === "LOW_CONFIDENCE") {
      if (!description || description.length < 50) {
        return {
          valid: false,
          message:
            "Low confidence recommendations must provide detailed minimum useful output (at least 50 characters describing safe next steps)",
        };
      }
    }

    return { valid: true };
  }
}

/**
 * AIProposalSandbox: Contain AI-generated recommendations
 * Phase 0 acceptance criterion: AI cannot bypass validation
 */
export class AIProposalSandbox {
  validate(isAIProposal: boolean, confidenceLevel?: string): { valid: boolean; message?: string } {
    if (!isAIProposal) {
      return { valid: true };
    }

    // AI proposals must not have DANGER_DO_NOT_ACT confidence
    if (confidenceLevel === "DANGER_DO_NOT_ACT") {
      return {
        valid: false,
        message: "AI proposals cannot be marked with DANGER_DO_NOT_ACT confidence. Require human review to escalate.",
      };
    }

    // AI proposals must have explicit confidence assessment
    if (!confidenceLevel) {
      return {
        valid: false,
        message: "AI proposals must have explicit confidence level assessment.",
      };
    }

    return { valid: true };
  }

  /**
   * Generate sandbox metadata for tracking AI proposal approval workflow
   */
  generateSandboxMetadata(sourceModel: string) {
    return {
      sourceModel,
      sandboxedAt: new Date(),
      requiresApproval: true,
      approvalLevel: "human_review_required",
    };
  }
}

/**
 * RecommendationExplanationContract: Enforce explainability
 * Phase 0 acceptance criterion: All recommendations must justify their existence
 */
export class RecommendationExplanationContract {
  validate(title?: string, rationale?: string, description?: string): { valid: boolean; message?: string } {
    const totalLength = (title?.length || 0) + (rationale?.length || 0) + (description?.length || 0);

    if (totalLength < 50) {
      return {
        valid: false,
        message:
          "Insufficient explanation. Combine title + rationale + description must exceed 50 characters. Provide substantive justification.",
      };
    }

    if (!rationale || rationale.length < 20) {
      return {
        valid: false,
        message: "Rationale is required and must justify why this action should happen now.",
      };
    }

    return { valid: true };
  }
}

// Export singleton instances
export const rollbackRequirementPolicy = new RollbackRequirementPolicy();
export const recommendationExpiryPolicy = new RecommendationExpiryPolicy();
export const minimumUsefulOutputPolicy = new MinimumUsefulOutputPolicy();
export const aiProposalSandbox = new AIProposalSandbox();
export const recommendationExplanationContract = new RecommendationExplanationContract();

/**
 * Phase 0 consolidated validator
 */
export async function validatePhase0Contracts(input: {
  title?: string;
  description?: string;
  rationale?: string;
  priority: string;
  rollbackPlan?: string;
  constraintsConsidered?: string[];
  confidenceLevel?: string;
  expiresAt?: Date;
  isAIProposal?: boolean;
  estimatedImpact?: string;
}): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Rollback requirement
  const rollbackResult = rollbackRequirementPolicy.validate(input.rollbackPlan);
  if (!rollbackResult.valid) errors.push(rollbackResult.message || "Rollback validation failed");

  // Expiration policy
  const expiryResult = recommendationExpiryPolicy.validate(input.expiresAt);
  if (!expiryResult.valid) errors.push(expiryResult.message || "Expiry validation failed");

  // Explanation contract
  const explanationResult = recommendationExplanationContract.validate(input.title, input.rationale, input.description);
  if (!explanationResult.valid) errors.push(explanationResult.message || "Explanation validation failed");

  // Minimum useful output
  const minimumResult = minimumUsefulOutputPolicy.validate(input.confidenceLevel, input.description);
  if (!minimumResult.valid) errors.push(minimumResult.message || "Minimum output validation failed");

  // AI sandbox
  const sandboxResult = aiProposalSandbox.validate(input.isAIProposal || false, input.confidenceLevel);
  if (!sandboxResult.valid) errors.push(sandboxResult.message || "AI sandbox validation failed");

  return {
    valid: errors.length === 0,
    errors,
  };
}
