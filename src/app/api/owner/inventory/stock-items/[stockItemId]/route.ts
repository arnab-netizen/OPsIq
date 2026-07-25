import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getStockItem, updateStockItem, updateStockItemSchema } from "@/services/owner-inventory/stock-item.service";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.stockItemId);
    const item = await getStockItem(ctx.verifiedWorkspaceId, params.stockItemId);
    if (!item) return canonicalJson({ error: "Stock item not found" }, { status: 404 });
    return canonicalJson(item, { status: 200 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_VIEW] }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.stockItemId);
    const body = await parseRequestBody(ctx.request!, updateStockItemSchema);
    const item = await updateStockItem(ctx.verifiedWorkspaceId, params.stockItemId, body, ctx.verifiedActorId);
    if (!item) return canonicalJson({ error: "Stock item not found" }, { status: 404 });
    return canonicalJson(item, { status: 200 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_MANAGE] }
);
