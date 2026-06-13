/**
 * GET  /api/owner/marketing/businesses/[businessId]/snapshots — list (OWNER_VIEW)
 * POST /api/owner/marketing/businesses/[businessId]/snapshots — create (OWNER_MANAGE)
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { marketingSnapshotCreateSchema } from "@/domain/owner-marketing/validation";
import { createMarketingSnapshot, listMarketingSnapshots } from "@/services/owner-marketing/snapshot.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    return listMarketingSnapshots(params.businessId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const input = await parseRequestBody(ctx.request!, marketingSnapshotCreateSchema);
    const snapshot = await createMarketingSnapshot(params.businessId, input, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
    return canonicalJson(snapshot, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
