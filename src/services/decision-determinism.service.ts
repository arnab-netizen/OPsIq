import { db } from "@/lib/db";
import type { PrimaryDecision } from "./decision-control/decision-control.service";

export interface DecisionInput {
  actions: Array<{ id: string; title: string; priority: string; status: string; dueDate: Date | null }>;
  findings: Array<{ id: string; title: string; severity: string; status: string }>;
  recommendations: Array<{ id: string; title: string; status: string; priority: string }>;
  drift: { driftDetected: boolean; severity: string };
  confidence: { score: number; level: string };
  timestamp: string;
}

export async function captureDecisionSnapshot(
  engagementId: string,
  input: DecisionInput,
  output: PrimaryDecision
): Promise<string> {
  const snapshot = await db.decisionSnapshot.create({
    data: {
      engagementId,
      decisionInput: input as any,
      decisionOutput: output as any,
      version: 1,
    },
  });

  return snapshot.id;
}

export async function getDecisionSnapshot(snapshotId: string) {
  return db.decisionSnapshot.findUnique({
    where: { id: snapshotId },
  });
}

export async function verifyDecisionDeterminism(
  snapshotId: string,
  replayOutput: PrimaryDecision
): Promise<{ isDeterministic: boolean; differences?: string[] }> {
  const snapshot = await getDecisionSnapshot(snapshotId);
  if (!snapshot) {
    return { isDeterministic: false, differences: ["Snapshot not found"] };
  }

  const originalOutput = snapshot.decisionOutput as unknown as PrimaryDecision;
  const differences: string[] = [];

  // Compare decision type
  if (originalOutput.type !== replayOutput.type) {
    differences.push(`Type mismatch: ${originalOutput.type} vs ${replayOutput.type}`);
  }

  // Compare title
  if (originalOutput.title !== replayOutput.title) {
    differences.push(`Title mismatch: ${originalOutput.title} vs ${replayOutput.title}`);
  }

  // Compare instruction
  if (originalOutput.instruction !== replayOutput.instruction) {
    differences.push(`Instruction mismatch`);
  }

  // Compare consequence
  if (originalOutput.consequence !== replayOutput.consequence) {
    differences.push(`Consequence mismatch`);
  }

  // Allow confidence score to vary by ±5 points (rounding tolerance)
  if (Math.abs(originalOutput.confidenceScore - replayOutput.confidenceScore) > 5) {
    differences.push(
      `Confidence score variance: ${originalOutput.confidenceScore} vs ${replayOutput.confidenceScore}`
    );
  }

  // Compare action ID if set
  if (
    originalOutput.actionId &&
    replayOutput.actionId &&
    originalOutput.actionId !== replayOutput.actionId
  ) {
    differences.push(`Action ID mismatch: ${originalOutput.actionId} vs ${replayOutput.actionId}`);
  }

  return {
    isDeterministic: differences.length === 0,
    differences: differences.length > 0 ? differences : undefined,
  };
}

export async function queryDecisionSnapshots(engagementId: string) {
  return db.decisionSnapshot.findMany({
    where: { engagementId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
