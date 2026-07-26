import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getCustomer, updateCustomer, updateCustomerSchema } from "@/services/owner-sales/customer.service";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.customerId);
    const customer = await getCustomer(ctx.verifiedWorkspaceId, params.customerId);
    if (!customer) return canonicalJson({ error: "Customer not found" }, { status: 404 });
    return canonicalJson(customer, { status: 200 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_VIEW] }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.customerId);
    const body = await parseRequestBody(ctx.request!, updateCustomerSchema);
    const customer = await updateCustomer(ctx.verifiedWorkspaceId, params.customerId, body, ctx.verifiedActorId);
    if (!customer) return canonicalJson({ error: "Customer not found" }, { status: 404 });
    return canonicalJson(customer, { status: 200 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_MANAGE] }
);
