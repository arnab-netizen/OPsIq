import { OverrideRecord } from "@/domain/override/types";

const overrideStore: OverrideRecord[] = [];

export function addOverride(record: OverrideRecord): void {
  overrideStore.push(record);
}

export function getOverrides(): OverrideRecord[] {
  return overrideStore;
}
