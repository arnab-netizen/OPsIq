import { OperatorItem } from "@/domain/operator/types";
import { getQueuedItems } from "./store";

interface MyDayItem extends OperatorItem {
  recommended: true;
}

/**
 * Get top 5 highest-priority items for My Day view.
 * Always returns max 5 items, ordered by priority score DESC, then due date ASC.
 * Deterministic: same operator items always produce same My Day list.
 */
export async function getMyDayItems(): Promise<MyDayItem[]> {
  // Fetch items from queue (pending/in_progress)
  const items = await getQueuedItems(undefined, 5);

  // Add recommended flag and return
  return items.map((item) => ({
    ...item,
    recommended: true as const,
  }));
}
