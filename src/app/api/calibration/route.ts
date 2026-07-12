import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError } from "@/infra/errors";
import { getItems } from "@/services/operator/store";
import { computeCalibration, computeCalibrationBySegment } from "@/services/calibration/engine";
import { resolveServerRole } from "@/services/auth/server-role";
import { canView } from "@/services/auth/access";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // Resolve role from server-side session/database (never from request)
    const role = await resolveServerRole();

    if (!role) {
      throw new UnauthorizedError("Unauthorized");
    }

    if (!canView(role)) {
      throw new Error("Insufficient permissions");
    }

    const actorId = ctx.verifiedActorId;
    const workspaceId = ctx.verifiedWorkspaceId;

    // Fetch all items scoped to verified workspace
    const items = await getItems(workspaceId);

    // Compute overall calibration metrics
    const overall = computeCalibration(items);

    // Compute calibration metrics by impact segment
    const byImpactSegment = computeCalibrationBySegment(items);

    const response = {
      overall,
      byImpactSegment,
    };

    // Log audit event for viewing calibration
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.CALIBRATION_VIEWED,
      entityType: "Calibration",
      entityId: "system",
      actorId,
      actorType: "user",
      workspaceId,
      payload: {
        role,
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
  },
  { requireWorkspace: true }
);
