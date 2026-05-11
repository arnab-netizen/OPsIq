import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  detectHighPriorityOverdueActions,
  detectKPIDeteriorationPattern,
} from "@/services/escalation";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";

const detectEscalationSchema = z.object({
  engagementId: z.string().uuid(),
});

/**
 * POST /api/engagements/[engagementId]/escalation-checks
 *
 * Detect escalation conditions and generate alerts
 * Wire: escalation.detectHighPriorityOverdueActions()
 *       escalation.detectKPIDeteriorationPattern()
 * Triggers: High-priority action overdue, KPI deterioration pattern detection
 */
export const POST = withRequestContext(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_VIEW,
  });

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const pathSegments = nextRequest.nextUrl.pathname.split("/");
    const engagementId = pathSegments[pathSegments.length - 3]; // Extract from /engagements/[id]/escalation-checks

    if (!engagementId) {
      return Response.json(
        { error: "Engagement ID required in path" },
        { status: 400 }
      );
    }

    const validated = detectEscalationSchema.parse({ engagementId });

    // Run both escalation checks
    const authContext = { session };
    const overdueAlert = await detectHighPriorityOverdueActions(
      validated.engagementId,
      authContext,
      workspaceId
    );

    const deteriorationAlert = await detectKPIDeteriorationPattern(
      validated.engagementId,
      authContext,
      workspaceId
    );

    const alerts = [];
    if (overdueAlert) alerts.push(overdueAlert);
    if (deteriorationAlert) alerts.push(deteriorationAlert);

    return Response.json(
      {
        engagementId: validated.engagementId,
        alerts,
        hasEscalations: alerts.length > 0,
        checkedAt: new Date(),
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

/**
 * GET /api/engagements/[engagementId]/escalation-checks
 *
 * Retrieve last escalation check status
 */
export const GET = withRequestContext(async (request) => {
  await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_VIEW,
  });

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  // TODO: Implement persistent escalation check history when schema is available
  // For now, return current status indicating no history available
  return Response.json({
    note: "Escalation check history not yet persisted",
    lastCheck: null,
  });
});
