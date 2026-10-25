/**
 * POST /api/owner/integrations/quickbooks/disconnect — disconnect QuickBooks for a business (OWNER_MANAGE).
 * Body: { businessId }. Revokes the grant at Intuit (best effort, reported), disconnects locally, keeps history/provenance.
 * Idempotent: a second call reports changed:false.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { disconnectQuickBooks } from "@/services/quickbooks/qbo-lifecycle.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.strictObject({ businessId: z.guid() });

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, bodySchema);
    const result = await disconnectQuickBooks(
      { workspaceId: ctx.verifiedWorkspaceId, businessId: body.businessId, actorId: ctx.verifiedActorId },
      { env: process.env },
    );
    return canonicalJson(result, { status: 200, headers: { "cache-control": "no-store" } });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true, requireActorType: "user" },
);
