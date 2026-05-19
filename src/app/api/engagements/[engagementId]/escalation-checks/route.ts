import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  detectHighPriorityOverdueActions,
  detectKPIDeteriorationPattern,
} from "@/services/escalation";
import { z } from "zod/v4";

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
export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
  try {
    const validated = detectEscalationSchema.parse({ engagementId: params.engagementId });

    // Run both escalation checks
    const overdueAlert = await detectHighPriorityOverdueActions(
      validated.engagementId,
      ctx,
      ctx.verifiedWorkspaceId
    );

    const deteriorationAlert = await detectKPIDeteriorationPattern(
      validated.engagementId,
      ctx,
      ctx.verifiedWorkspaceId
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
}, {
  requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW],
  requireWorkspace: true,
});

/**
 * GET /api/engagements/[engagementId]/escalation-checks
 *
 * Retrieve last escalation check status
 */
export const GET = withCanonicalEnforcement(async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
  // TODO: Implement persistent escalation check history when schema is available
  // For now, return current status indicating no history available
  return Response.json({
    note: "Escalation check history not yet persisted",
    lastCheck: null,
  });
}, {
  requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW],
  requireWorkspace: true,
});
