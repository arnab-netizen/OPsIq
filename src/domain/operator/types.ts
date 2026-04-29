import type { DecisionExplanation, ProblemType } from "@/domain/decision/types";

export type OperatorItem = {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  createdBy: string;
  lastUpdatedBy: string | null;
  problem: string;
  action: string;

  impactExpected: number;
  impactLow: number;
  impactHigh: number;

  confidence: number;

  priorityScore: number;

  status: "pending" | "in_progress" | "done" | "failed";

  dueAt: string | null;

  decisionType: string;

  problemType?: ProblemType;

  blockingDependencies: string[];

  expectedOutcome: string | null;
  actualOutcome: string | null;
  actualOutcomeValue?: number | null;
  outcomeDelta?: number | null;
  decisionAccuracy?: number | null;
  decisionError?: number | null;
  outcomeNotes?: string | null;

  startedAt?: string | null;
  completedAt?: string | null;
  executionStatus?: "not_started" | "started" | "completed";

  explanation?: DecisionExplanation;

  decisionHash?: string;
  signedHash?: string;
  signature?: string;
  signatureAlgo?: string;
  publicKeyId?: string;
  inputsSnapshot?: Record<string, unknown>;
  engineVersion: string;

  createdAt: string;
};
