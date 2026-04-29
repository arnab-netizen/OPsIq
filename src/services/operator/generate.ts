import { DecisionOutput } from "@/domain/decision/types";
import { OperatorItem } from "@/domain/operator/types";
import type { ImpactEstimate } from "@/domain/finance/types";
import { calculatePriority } from "./priority";
import { randomUUID } from "crypto";

export function generateOperatorItems(
  decisions: DecisionOutput[],
  impact: ImpactEstimate,
  workspaceId: string
): OperatorItem[] {
  return decisions.map((decision) => {
    const item: OperatorItem = {
      id: randomUUID(),
      workspaceId,
      problem: decision.problem,
      action: decision.action,

      impactExpected: impact.impactExpected,
      impactLow: impact.impactLow,
      impactHigh: impact.impactHigh,

      confidence: decision.confidence,

      priorityScore: 0,

      status: "pending",

      dueAt: null,

      decisionType: "general",

      blockingDependencies: [],

      expectedOutcome: null,
      actualOutcome: null,

      engineVersion: "v1.0.0",

      createdAt: new Date().toISOString(),
    };

    item.priorityScore = calculatePriority(item);

    return item;
  });
}
