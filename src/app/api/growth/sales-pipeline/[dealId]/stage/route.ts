import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { SalesPipelineEngine } from "@/services/growth/sales-pipeline-engine";
import { DealStage } from "@/domain/growth/growth-engines";
import { z } from "zod/v4";

const progressDealSchema = z.object({
  newStage: z.nativeEnum(DealStage),
});

/**
 * PATCH /api/growth/sales-pipeline/[dealId]/stage — advance a deal's pipeline stage.
 */
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.dealId);
    const body = await parseRequestBody(ctx.request!, progressDealSchema);
    const result = await SalesPipelineEngine.progressDeal(
      ctx.verifiedWorkspaceId,
      ctx.verifiedActorId,
      params.dealId,
      body.newStage
    );
    return canonicalJson(result, { status: 200 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE] }
);
