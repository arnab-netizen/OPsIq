import { OperatorItem } from "@/domain/operator/types";

let store: OperatorItem[] = [];

export function addItems(items: OperatorItem[]): void {
  store.push(...items);
}

export function getItems(): OperatorItem[] {
  return store;
}

export function updateItem(
  id: string,
  updates: Partial<OperatorItem>
): void {
  store = store.map((i) =>
    i.id === id ? { ...i, ...updates } : i
  );
}
