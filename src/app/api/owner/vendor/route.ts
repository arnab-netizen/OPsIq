import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createVendor, getVendors } from "@/services/owner-budget/vendor.service";
import { z } from "zod/v4";

const createVendorSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().min(1).max(200),
  bankAccountRef: z.string().max(200).nullable().optional(),
  relatedParty: z.boolean().optional(),
  paymentTermsDays: z.number().int().min(0).max(365).nullable().optional(),
  switchingCostEstimate: z.number().min(0).nullable().optional(),
  replacementLeadTimeDays: z.number().int().min(0).max(730).nullable().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, createVendorSchema);
    const vendor = await createVendor(body.businessId, body, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
    return canonicalJson(vendor, { status: 201 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_MANAGE] }
);

const listVendorsSchema = z.object({
  businessId: z.string().uuid(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const parsed = listVendorsSchema.safeParse({ businessId: url.searchParams.get("businessId") });
    if (!parsed.success) return canonicalJson({ error: "businessId query parameter is required" }, { status: 400 });
    const vendors = await getVendors(ctx.verifiedWorkspaceId, parsed.data.businessId);
    return canonicalJson(vendors, { status: 200 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_VIEW] }
);
