import { UnauthorizedError } from "@/infra/errors";
import { getItems } from "@/services/operator/store";
import { computeCalibration, computeCalibrationBySegment } from "@/services/calibration/engine";
import { resolveServerRole } from "@/services/auth/server-role";
import { canView } from "@/services/auth/access";
import { getSession } from "@/services/auth";
import { logAuditEvent } from "@/services/audit/audit-log";

export const GET = withEnforcement(async () => {
  // Resolve role from server-side session/database (never from request)
  const role = await resolveServerRole();

  if (!role) {
    throw new UnauthorizedError("Unauthorized");
  }

  if (!canView(role)) {
    throw new Error("Insufficient permissions");
  }

  // Get actor ID from session
  const { session } = await withAuth();
  const actorId = session?.user.id ?? null;

  // Fetch all items
  const items = await getItems();

  // Compute overall calibration metrics
  const overall = computeCalibration(items);

  // Compute calibration metrics by impact segment
  const byImpactSegment = computeCalibrationBySegment(items);

  const response = {
    overall,
    byImpactSegment,
  };

  // Log audit event for viewing calibration
  await logAuditEvent({
    eventName: "CALIBRATION_VIEWED",
    entityType: "Calibration",
    entityId: "system",
    actorId,
    role,
    before: null,
    after: null,
    metadata: {
      itemsAnalyzed: overall.itemsAnalyzed,
      successRate: overall.successRate,
      avgAccuracy: overall.avgAccuracy,
      avgError: overall.avgError,
      weightedAccuracy: overall.weightedAccuracy,
      segmentLow: byImpactSegment.low.itemsAnalyzed,
      segmentMedium: byImpactSegment.medium.itemsAnalyzed,
      segmentHigh: byImpactSegment.high.itemsAnalyzed,
    },
  });

  return response;
});
