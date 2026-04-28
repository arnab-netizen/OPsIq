import { Report } from "@/domain/report/types";
import { getItems, getCalibrationRecords } from "@/services/operator/store";

export function generateReport(): Report {
  const items = getItems();
  const calibrationRecords = getCalibrationRecords();

  const totalImpact = items.reduce((sum, item) => sum + item.impactExpected, 0);
  const totalActions = items.length;
  const completedActions = items.filter((item) => item.status === "done").length;

  let accuracyScore = 1.0;
  if (calibrationRecords.length > 0) {
    const avgDeviation =
      calibrationRecords.reduce((sum, record) => sum + record.deviation, 0) /
      calibrationRecords.length;
    accuracyScore = Math.max(0, 1 - avgDeviation);
  }

  return {
    totalImpact,
    totalActions,
    completedActions,
    accuracyScore,
    generatedAt: new Date().toISOString(),
  };
}
