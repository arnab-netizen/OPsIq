import { OperatorItem } from "@/domain/operator/types";
import { CalibrationRecord } from "@/domain/calibration/types";
import { calculateDeviation } from "@/services/calibration/engine";

let store: OperatorItem[] = [];
let calibrationStore: CalibrationRecord[] = [];

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

export function addCalibrationRecord(
  operatorItemId: string,
  predictedImpact: number,
  actualImpact: number,
  confidence: number
): void {
  const deviation = calculateDeviation(predictedImpact, actualImpact);

  calibrationStore.push({
    id: Date.now().toString(),
    operatorItemId,
    predictedImpact,
    actualImpact,
    confidence,
    deviation,
    createdAt: new Date().toISOString(),
  });
}

export function getCalibrationRecords(): CalibrationRecord[] {
  return calibrationStore;
}
