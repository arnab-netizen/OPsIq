import type { DecisionExplanation } from "@/domain/decision/types";

export type OperatorItem = {
  id: string;
  problem: string;
  action: string;

  impactExpected: number;
  impactLow: number;
  impactHigh: number;

  confidence: number;

  priorityScore: number;

  status: "pending" | "in_progress" | "done";

  dueAt: string | null;

  blockingDependencies: string[];

  expectedOutcome: string | null;
  actualOutcome: string | null;

  explanation?: DecisionExplanation;

  createdAt: string;
};
