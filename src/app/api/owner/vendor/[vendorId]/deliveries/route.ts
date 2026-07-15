import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { recordVendorDelivery } from "@/services/owner-budget/vendor.service";
import { z } from "zod/v4";

const recordDeliverySchema = z.object({
  businessId: z.string().uuid(),
  expectedDate: z.coerce.date(),
  actualDate: z.coerce.date().nullable().optional(),
  onTime: z.boolean().nullable().optional(),
  qualityAccepted: z.boolean().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.vendorId);
    const body = await parseRequestBody(ctx.request!, recordDeliverySchema);
    const row = await recordVendorDelivery(ctx.verifiedWorkspaceId, ctx.verifiedActorId, {
      vendorId: params.vendorId,
      ...body,
    });
    return canonicalJson(row, { status: 201 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_MANAGE] }
);
