import type { DecisionExplanation, ProblemType } from "@/domain/decision/types";

export type OperatorItem = {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  createdBy: string;
  lastUpdatedBy: string | null;
  recommendationId?: string | null;
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

  baselineValue?: number | null;
  projectedWithoutAction?: number | null;

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
  completedBy?: string | null;
  executionStatus?: "not_started" | "started" | "completed";

  verificationStatus?: string;
  verificationMethod?: string | null;
  verificationConfidence?: number | null;
  verificationEvidence?: Record<string, unknown> | null;
  auditTrail?: Array<Record<string, unknown>> | null;

  firstCompletedAt?: string | null;
  firstPositiveOutcomeAt?: string | null;

  firstWinAchieved?: boolean;

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
