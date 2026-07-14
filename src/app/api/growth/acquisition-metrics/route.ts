/**
 * GET  /api/growth/acquisition-metrics — list persisted acquisition metrics for the workspace.
 * POST /api/growth/acquisition-metrics — record a channel-month acquisition snapshot (workspace-scoped, DB-backed).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { AcquisitionEngine } from "@/services/growth/acquisition-engine";
import { AcquisitionChannel } from "@/domain/growth/growth-engines";
import { z } from "zod/v4";

const recordMetricsSchema = z.object({
  channel: z.nativeEnum(AcquisitionChannel),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM format"),
  leads: z.number().int().nonnegative("Leads must be a non-negative integer"),
  qualifiedLeads: z.number().int().nonnegative("Qualified leads must be a non-negative integer").optional(),
  conversions: z.number().int().nonnegative("Conversions must be a non-negative integer"),
  costPerLead: z.number().nonnegative("Cost per lead must be non-negative"),
  costPerAcquisition: z.number().nonnegative("Cost per acquisition must be non-negative"),
  targetCPA: z.number().nonnegative("Target CPA must be non-negative"),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    return AcquisitionEngine.listMetrics(ctx.verifiedWorkspaceId);
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW] }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, recordMetricsSchema);

    const metrics = await AcquisitionEngine.recordMetrics(
      ctx.verifiedWorkspaceId,
      ctx.verifiedActorId,
      body
    );

    return canonicalJson(metrics, { status: 201 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE] }
);
