/**
 * GET /api/owner/compliance/[itemId] — fetch a single compliance item with task links.
 * OWNER_VIEW capability required. Workspace isolation enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getComplianceItem } from "@/services/owner-mode/compliance.service";
import { NotFoundError } from "@/infra/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { itemId } = params;
    try {
      const item = await getComplianceItem(ctx.verifiedWorkspaceId, itemId);
      return canonicalJson({ item }, { status: 200 });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return canonicalJson({ error: "Compliance item not found" }, { status: 404 });
      }
      throw err;
    }
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
