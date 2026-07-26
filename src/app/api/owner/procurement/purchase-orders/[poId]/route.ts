import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getPurchaseOrder } from "@/services/owner-procurement/purchase-order.service";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.poId);
    const order = await getPurchaseOrder(ctx.verifiedWorkspaceId, params.poId);
    if (!order) return canonicalJson({ error: "Purchase order not found" }, { status: 404 });
    return canonicalJson(order, { status: 200 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_VIEW] }
);
