import { DecisionOutput, ImpactEstimate } from "@/domain/decision/types";
import { OperatorItem } from "@/domain/operator/types";
import { calculatePriority } from "./priority";
import { randomUUID } from "crypto";

export function generateOperatorItems(
  decisions: DecisionOutput[],
  impact: ImpactEstimate
): OperatorItem[] {
  return decisions.map((decision) => {
    const item: OperatorItem = {
      id: randomUUID(),
      problem: decision.problem,
      action: decision.action,

      impactExpected: impact.impactExpected,
      impactLow: impact.impactLow,
      impactHigh: impact.impactHigh,

      confidence: decision.confidence,

      priorityScore: 0,

      status: "pending",

      dueAt: null,

      blockingDependencies: [],

      expectedOutcome: null,
      actualOutcome: null,

      createdAt: new Date().toISOString(),
    };

    item.priorityScore = calculatePriority(item);

    return item;
  });
}
