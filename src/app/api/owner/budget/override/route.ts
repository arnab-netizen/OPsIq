/**
 * POST /api/owner/budget/override — record an owner override (risk-disclosed,
 *      logged, reassessed). Hard safety/legal blocks are refused server-side.
 *      OWNER_MANAGE, workspace-scoped, validated, enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { ownerOverrideCreateSchema } from "@/domain/owner-budget/validation";
import { recordOwnerOverride } from "@/services/owner-budget/governance.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const { businessId, ...input } = await parseRequestBody(ctx.request!, ownerOverrideCreateSchema);
    const override = await recordOwnerOverride(businessId, input, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
    return canonicalJson(override, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
