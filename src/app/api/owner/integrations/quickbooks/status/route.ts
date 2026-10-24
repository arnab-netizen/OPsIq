/**
 * GET /api/owner/integrations/quickbooks/status?businessId=… — bounded, owner-readable QuickBooks status (OWNER_VIEW).
 * Workspace comes only from the session; a business outside it is a uniform 404. Never returns tokens, provider bodies,
 * raw errors or another tenant's data.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ValidationError } from "@/infra/errors";
import { getQboOwnerStatus } from "@/services/quickbooks/qbo-status.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const query = z.strictObject({ businessId: z.guid() });

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const parsed = query.safeParse(Object.fromEntries(new URL(ctx.request!.url).searchParams));
    if (!parsed.success) throw new ValidationError("A valid businessId is required.", { fieldErrors: [{ path: "businessId", message: "Required" }] });
    const status = await getQboOwnerStatus({ workspaceId: ctx.verifiedWorkspaceId, businessId: parsed.data.businessId }, { env: process.env });
    return canonicalJson(status, { status: 200, headers: { "cache-control": "no-store" } });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true, requireActorType: "user" },
);
