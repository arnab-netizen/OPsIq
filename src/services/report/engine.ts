import { Report } from "@/domain/report/types";
import { getItems } from "@/services/operator/store";
import { computeCalibration } from "@/services/calibration/engine";

export async function generateReport(workspaceId: string): Promise<Report> {
  const items = await getItems(workspaceId);

  const totalImpact = items.reduce((sum, item) => sum + item.impactExpected, 0);
  const totalActions = items.length;
  const completedActions = items.filter((item) => item.status === "done").length;

  // Derive accuracy from real DB-backed items instead of the in-memory
  // calibration store which resets on every serverless cold start.
  const calibration = computeCalibration(items);
  let accuracyScore = 1.0;
  if (calibration.valid && calibration.avgAccuracy !== null) {
    accuracyScore = Math.max(0, Math.min(1, calibration.avgAccuracy));
  }

  return {
    totalImpact,
    totalActions,
    completedActions,
    accuracyScore,
    generatedAt: new Date().toISOString(),
  };
}
