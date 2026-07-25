import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { transitionPurchaseOrder, type POStatus } from "@/services/owner-procurement/purchase-order.service";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { z } from "zod/v4";

const transitionSchema = z.object({
  toStatus: z.enum(["REVIEWED", "APPROVED", "ISSUED", "DELIVERED", "CANCELLED"]),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.poId);
    const body = await ctx.request!.json();
    const parsed = transitionSchema.safeParse(body);
    if (!parsed.success) {
      return canonicalJson({ error: "toStatus is required" }, { status: 400 });
    }
    try {
      const order = await transitionPurchaseOrder(
        ctx.verifiedWorkspaceId,
        params.poId,
        parsed.data.toStatus as POStatus,
        ctx.verifiedActorId,
      );
      if (!order) return canonicalJson({ error: "Purchase order not found" }, { status: 404 });
      return canonicalJson(order, { status: 200 });
    } catch (err) {
      const governed = classifyOperatorError(err, { context: "mutation" });
      const safeText = governed.operatorMessage;
      return canonicalJson({ error: safeText }, { status: 422 });
    }
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_MANAGE] }
);
