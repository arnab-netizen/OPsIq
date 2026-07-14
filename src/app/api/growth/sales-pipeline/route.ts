import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { SalesPipelineEngine } from "@/services/growth/sales-pipeline-engine";
import { DealStage } from "@/domain/growth/growth-engines";
import { z } from "zod/v4";

const recordDealSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  stage: z.nativeEnum(DealStage).optional(),
  value: z.number().nonnegative("Deal value must be non-negative"),
  currency: z.string().length(3, "Currency must be 3-letter code").optional(),
  probability: z.number().min(0).max(1, "Probability must be 0-1").optional(),
  expectedCloseDate: z.coerce.date().optional(),
  owner: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * GET /api/growth/sales-pipeline — list persisted deals for the workspace.
 * POST /api/growth/sales-pipeline — record a new sales deal.
 */
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    return SalesPipelineEngine.listDeals(ctx.verifiedWorkspaceId);
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW] }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, recordDealSchema);
    const deal = await SalesPipelineEngine.recordDeal(
      ctx.verifiedWorkspaceId,
      ctx.verifiedActorId,
      body
    );
    return canonicalJson(deal, { status: 201 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE] }
);
