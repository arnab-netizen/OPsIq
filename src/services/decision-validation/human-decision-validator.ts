import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { logger } from "@/infra/logger";

export interface DecisionValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  financialConsequences: {
    expectedImpact: number;
    confidenceScore: number;
    riskLevel: string;
  };
}

export interface DecisionAcceptanceInput {
  decisionId: string;
  engagementId: string;
  workspaceId: string;
  acceptedBy: string;
  rationale?: string;
}

export interface DecisionRejectionInput {
  decisionId: string;
  engagementId: string;
  workspaceId: string;
  rejectedBy: string;
  reason: string;
}

export async function validateDecisionForAcceptance(input: {
  decisionId: string;
  engagementId: string;
  workspaceId: string;
}): Promise<DecisionValidationResult> {
  // Fetch the OperatorItem (decision)
  const decision = await db.operatorItem.findUnique({
    where: { id: input.decisionId },
  });

  if (!decision) {
    throw new NotFoundError("Decision", input.decisionId);
  }

  // Verify workspace isolation
  if (decision.workspaceId !== input.workspaceId) {
    throw new Error("Workspace mismatch");
  }

  // Verify engagement association
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId, workspaceId: input.workspaceId },
  });

  if (!engagement) {
    throw new NotFoundError("Engagement", input.engagementId);
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Validation checks
  // DEC-01: only a PENDING decision may be accepted. Previously "in_progress" was also
  // allowed, but acceptDecision SETS status to "in_progress" — so an already-accepted
  // decision passed validation again and could be re-accepted repeatedly (silent
  // re-mutation of an accepted governed record).
  if (decision.status !== "pending") {
    errors.push(`Decision is ${decision.status} - cannot accept`);
  }

  if (!decision.confidence || decision.confidence < 0.3) {
    warnings.push("Low confidence score - consider reviewing rationale");
  }

  if (decision.blockStage && decision.blockStage !== null) {
    errors.push(`Decision is blocked at ${decision.blockStage} stage`);
  }

  // Financial consequence checks
  const expectedImpact = decision.impactExpected || 0;
  let riskLevel = "low";

  if (Math.abs(expectedImpact) > 100000) {
    riskLevel = "high";
  } else if (Math.abs(expectedImpact) > 50000) {
    riskLevel = "medium";
  }

  logger.info("Decision validation completed", {
    decisionId: input.decisionId,
    isValid: errors.length === 0,
    errorCount: errors.length,
    warningCount: warnings.length,
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    financialConsequences: {
      expectedImpact,
      confidenceScore: decision.confidence || 0,
      riskLevel,
    },
  };
}

export async function checkDecisionExists(
  decisionId: string,
  workspaceId: string
): Promise<boolean> {
  const decision = await db.operatorItem.findUnique({
    where: { id: decisionId },
  });

  if (!decision) {
    return false;
  }

  return decision.workspaceId === workspaceId;
}
