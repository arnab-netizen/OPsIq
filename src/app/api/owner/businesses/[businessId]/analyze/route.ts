/**
 * POST /api/owner/businesses/[businessId]/analyze — "Analyze my business": runs every
 *      eligible domain diagnosis (Finance, Sales, Operations) for this business in one
 *      action, instead of requiring the owner to trigger each domain separately.
 *      OWNER_MANAGE, workspace-scoped. See analyze-business.service.ts for the full
 *      per-domain eligibility/rate-limit/failure contract.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { analyzeBusiness } from "@/services/owner-mode/analyze-business.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const result = await analyzeBusiness(params.businessId, ctx.verifiedWorkspaceId, ctx.verifiedActorId);
    return canonicalJson(result, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
