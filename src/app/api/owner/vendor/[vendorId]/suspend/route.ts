import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { suspendVendor } from "@/services/owner-budget/vendor.service";
import { z } from "zod/v4";

const suspendSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.vendorId);
    const body = await parseRequestBody(ctx.request!, suspendSchema);
    const vendor = await suspendVendor(ctx.verifiedWorkspaceId, params.vendorId, ctx.verifiedActorId, body.reason);
    return canonicalJson(vendor, { status: 200 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_MANAGE] }
);
