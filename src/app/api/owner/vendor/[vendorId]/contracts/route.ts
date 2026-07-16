import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { recordVendorContract, listVendorContracts } from "@/services/owner-budget/vendor.service";
import { z } from "zod/v4";

const recordContractSchema = z.object({
  businessId: z.string().uuid(),
  contractRef: z.string().max(200).nullable().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  pricePerUnit: z.number().min(0).nullable().optional(),
  currency: z.string().max(10).optional(),
  termsDaysNet: z.number().int().min(0).max(365).nullable().optional(),
  scope: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.vendorId);
    const body = await parseRequestBody(ctx.request!, recordContractSchema);
    const row = await recordVendorContract(ctx.verifiedWorkspaceId, ctx.verifiedActorId, {
      vendorId: params.vendorId,
      ...body,
    });
    return canonicalJson(row, { status: 201 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_MANAGE] }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.vendorId);
    const contracts = await listVendorContracts(ctx.verifiedWorkspaceId, params.vendorId);
    return canonicalJson(contracts, { status: 200 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_VIEW] }
);
