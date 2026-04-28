import { OperatorItem } from "@/domain/operator/types";

export function sortByPriority(items: OperatorItem[]): OperatorItem[] {
  return [...items].sort((a, b) => b.priorityScore - a.priorityScore);
}
