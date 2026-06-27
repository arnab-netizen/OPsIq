/**
 * GET  /api/owner/budget/working-capital?businessId=... — list persisted receivable/
 *      payable working-capital items (manual / import-ready). OWNER_VIEW, workspace-scoped.
 * POST /api/owner/budget/working-capital — record a receivable/payable item.
 *      OWNER_MANAGE, workspace-scoped, Zod-validated, canonically enforced.
 *
 * Reuses the existing working-capital service (PR #45). No new persistence/engine.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { workingCapitalItemCreateSchema } from "@/domain/owner-budget/validation";
import { recordWorkingCapitalItem, listWorkingCapitalItems } from "@/services/owner-budget/working-capital.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    if (!businessId) return { error: "businessId is required" };
    return listWorkingCapitalItems(ctx.verifiedWorkspaceId, businessId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const { businessId, ...input } = await parseRequestBody(ctx.request!, workingCapitalItemCreateSchema);
    const item = await recordWorkingCapitalItem(businessId, input, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
    return canonicalJson(item, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
