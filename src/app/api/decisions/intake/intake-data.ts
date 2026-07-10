import { randomUUID } from "crypto";

/**
 * Validated intake input for a decision (the fields POST /api/decisions/intake accepts).
 */
export interface IntakeDecisionInput {
  title: string;
  description: string;
  confidence: number;
  risk: "low" | "medium" | "high";
  recommendationId?: string;
}

/**
 * Builds the schema-valid `operatorItem.create` data for a decision intake.
 *
 * Extracted from the route so the exact create payload is unit-testable against a real database.
 * Historically this create raw-500'd: it wrote a phantom `createdBy` column (real: `createdByUserId`),
 * omitted the required `id`/`updatedAt` (OperatorItem has no defaults for them), and wrote phantom
 * `decisionType`/`problemType` columns. This builder writes only real columns and all required fields.
 */
export function buildIntakeOperatorItemData(
  input: IntakeDecisionInput,
  workspaceId: string,
  userId: string
) {
  return {
    id: randomUUID(),
    workspaceId,
    createdByUserId: userId,
    ownerUserId: userId,
    recommendationId: input.recommendationId,
    problem: input.title,
    action: input.description,
    confidence: input.confidence,
    impactExpected: 0,
    impactLow: 0,
    impactHigh: 0,
    status: "pending",
    blockStage: null,
    blockReason: null,
    updatedAt: new Date(),
    inputsSnapshot: {
      title: input.title,
      description: input.description,
      confidence: input.confidence,
      risk: input.risk,
      recommendationId: input.recommendationId,
      createdAt: new Date().toISOString(),
    },
    priorityScore: 0.5,
    executionStatus: "not_started",
    engineVersion: "v1.0.0",
  };
}
