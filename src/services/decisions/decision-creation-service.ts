import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { enforceWorkspaceId } from "@/lib/workspace-validation";

export interface CreateDecisionInput {
  title: string;
  type: string;
  impact: number;
  confidence: number;
  workspaceId: string;
  userId: string;
  problemType?: string;
  expectedOutcome?: string;
}

export interface VerifiedDecisionInput {
  // Business data
  title: string;
  type: string;
  impact: number;
  confidence: number;
  problemType?: string;
  expectedOutcome?: string;
  // Verified auth metadata
  verifiedActorId: string;
  verifiedWorkspaceId: string;
}

export interface CreateDecisionResult {
  id: string;
  title: string;
  problem: string;
  decisionType: string;
  impactExpected: number;
  confidence: number;
  createdAt: Date;
}

export async function createDecision(
  input: VerifiedDecisionInput | CreateDecisionInput
): Promise<CreateDecisionResult> {
  // Support both old and new input formats for backward compatibility
  const isVerified = 'verifiedActorId' in input && 'verifiedWorkspaceId' in input;

  const title = input.title;
  const type = input.type;
  const impact = input.impact;
  const confidence = input.confidence;
  const workspaceId = isVerified ? (input as VerifiedDecisionInput).verifiedWorkspaceId : (input as CreateDecisionInput).workspaceId;
  const userId = isVerified ? (input as VerifiedDecisionInput).verifiedActorId : (input as CreateDecisionInput).userId;
  const problemType = input.problemType;
  const expectedOutcome = input.expectedOutcome;

  // Enforce workspace isolation
  enforceWorkspaceId(workspaceId, "createDecision", "OperatorItem");

  // Validate input
  if (!title?.trim()) {
    throw new Error("Decision title is required");
  }
  if (!type?.trim()) {
    throw new Error("Decision type is required");
  }
  if (typeof impact !== "number" || impact <= 0) {
    throw new Error("Impact must be a positive number");
  }
  if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
    throw new Error("Confidence must be between 0 and 1");
  }
  if (!workspaceId) {
    throw new Error("Workspace ID is required");
  }
  if (!userId) {
    throw new Error("User ID is required");
  }

  try {
    const decision = await db.operatorItem.create({
      data: {
        workspaceId,
        problem: title.trim(),
        action: type.trim(),
        impactExpected: impact,
        impactLow: impact * 0.8,
        impactHigh: impact * 1.2,
        confidence,
        decisionType: type.trim(),
        problemType: problemType || null,
        expectedOutcome: expectedOutcome || null,
        priorityScore: calculatePriorityScore(impact, confidence),
        status: "pending",
        ownerUserId: userId,
        createdBy: userId,
        lastUpdatedBy: userId,
      },
    });

    logger.info("Decision created", {
      decisionId: decision.id,
      workspaceId,
      userId,
      title,
      impact,
      confidence,
    });

    return {
      id: decision.id,
      title: decision.problem,
      problem: decision.problem,
      decisionType: decision.decisionType,
      impactExpected: decision.impactExpected,
      confidence: decision.confidence,
      createdAt: decision.createdAt,
    };
  } catch (error) {
    logger.error("Failed to create decision", {
      workspaceId,
      userId,
      title,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export interface BulkCreateInput {
  decisions: (VerifiedDecisionInput | CreateDecisionInput)[];
}

export interface BulkCreateResult {
  successful: CreateDecisionResult[];
  failed: Array<{
    title: string;
    reason: string;
  }>;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}

export async function createDecisionsBulk(
  input: BulkCreateInput
): Promise<BulkCreateResult> {
  const { decisions } = input;

  if (!Array.isArray(decisions) || decisions.length === 0) {
    throw new Error("At least one decision is required");
  }

  if (decisions.length > 1000) {
    throw new Error("Cannot create more than 1000 decisions at once");
  }

  const successful: CreateDecisionResult[] = [];
  const failed: Array<{ title: string; reason: string }> = [];

  for (const decision of decisions) {
    try {
      const result = await createDecision(decision);
      successful.push(result);
    } catch (error) {
      failed.push({
        title: decision.title,
        reason: error instanceof Error ? error.message : String(error),
      });
      const workspaceId = 'verifiedWorkspaceId' in decision ? decision.verifiedWorkspaceId : decision.workspaceId;
      logger.warn("Failed to create decision in bulk", {
        title: decision.title,
        workspaceId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info("Bulk decision creation completed", {
    total: decisions.length,
    succeeded: successful.length,
    failed: failed.length,
  });

  return {
    successful,
    failed,
    summary: {
      total: decisions.length,
      succeeded: successful.length,
      failed: failed.length,
    },
  };
}

function calculatePriorityScore(impact: number, confidence: number): number {
  // Simple priority calculation: impact * confidence
  return impact * confidence;
}

export function parseCSV(
  csvContent: string,
  workspaceId: string,
  userId: string
): CreateDecisionInput[] {
  const lines = csvContent.trim().split("\n");

  if (lines.length < 2) {
    throw new Error("CSV must have header and at least one data row");
  }

  // Parse header
  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().toLowerCase());

  const requiredColumns = ["title", "type", "impact", "confidence"];
  const missingColumns = requiredColumns.filter(
    (col) => !headers.includes(col)
  );

  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${missingColumns.join(", ")}`);
  }

  const decisions: CreateDecisionInput[] = [];

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = line.split(",").map((v) => v.trim());
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    try {
      decisions.push({
        title: row["title"],
        type: row["type"],
        impact: parseFloat(row["impact"]),
        confidence: parseFloat(row["confidence"]),
        workspaceId,
        userId,
        problemType: row["problemtype"] || undefined,
        expectedOutcome: row["expectedoutcome"] || undefined,
      });
    } catch (error) {
      throw new Error(`Error parsing row ${i + 1}: ${String(error)}`);
    }
  }

  if (decisions.length === 0) {
    throw new Error("No valid decisions found in CSV");
  }

  return decisions;
}
