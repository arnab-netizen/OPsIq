import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { RevenueEngine } from "@/services/growth/revenue-engine";
import { z } from "zod/v4";

const createStreamSchema = z.object({
  name: z.string().min(1, "Stream name required"),
  basePrice: z.number().positive("Base price must be positive"),
  currency: z.string().length(3, "Currency must be 3-letter code").optional(),
  model: z.string().optional(),
  billingCycle: z.string().optional(),
  volume: z.number().nonnegative().optional(),
  volumeUnit: z.string().optional(),
  activationDate: z.coerce.date().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
});

/**
 * GET  /api/growth/revenue-streams — list persisted revenue streams for the workspace.
 * POST /api/growth/revenue-streams — create and persist a new revenue stream.
 */
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    return RevenueEngine.listStreams(ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, createStreamSchema);
    const stream = await RevenueEngine.persistStream(
      ctx.verifiedWorkspaceId,
      ctx.verifiedActorId,
      body as any
    );
    return canonicalJson(stream, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE], requireWorkspace: true }
);
