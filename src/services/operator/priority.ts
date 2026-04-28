import { OperatorItem } from "@/domain/operator/types";

export function calculatePriority(item: OperatorItem): number {
  // Validate impact
  if (item.impactExpected <= 0) {
    return 0;
  }

  // Base: expected impact
  const base = item.impactExpected;

  // Weight by confidence
  const confidenceWeight = item.confidence;

  // Urgency factor: 1.5x if overdue
  let urgencyFactor = 1;
  if (item.dueAt !== null) {
    const now = new Date();
    const dueDate = new Date(item.dueAt);
    urgencyFactor = now > dueDate ? 1.5 : 1;
  }

  // Calculate priority score
  const priorityScore = base * confidenceWeight * urgencyFactor;

  return priorityScore;
}
