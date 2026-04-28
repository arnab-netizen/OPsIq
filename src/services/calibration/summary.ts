import { CalibrationRecord } from "@/domain/calibration/types";
import { CalibrationSummary } from "@/domain/calibration/types";

export function calculateSummary(
  records: CalibrationRecord[]
): CalibrationSummary {
  if (records.length === 0) {
    return {
      totalRecords: 0,
      avgDeviation: 0,
      accuracyScore: 0,
    };
  }

  const totalRecords = records.length;

  const sumDeviation = records.reduce((sum, r) => sum + r.deviation, 0);
  const avgDeviation = sumDeviation / totalRecords;

  let accuracyScore = 1 - avgDeviation;
  accuracyScore = Math.max(0, Math.min(1, accuracyScore));

  return {
    totalRecords,
    avgDeviation,
    accuracyScore,
  };
}
