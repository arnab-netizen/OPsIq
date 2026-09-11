import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getCustomer, updateCustomer, updateCustomerSchema } from "@/services/owner-sales/customer.service";

// businessId is required on both routes below, same convention as GET/POST
// /api/owner/sales/customers (listCustomers/createCustomer): a CustomerRecord belongs to one
// business within the workspace, and the caller's currently-selected business must be supplied
// explicitly rather than inferred from workspace membership alone -- see customer.service.ts's
// getCustomer/updateCustomer for the isolation guard this enforces.
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.customerId);
    const url = new URL(ctx.request!.url);
    const businessId = parseOrThrow(uuidSchema, url.searchParams.get("businessId"));
    const customer = await getCustomer(ctx.verifiedWorkspaceId, businessId, params.customerId);
    if (!customer) return canonicalJson({ error: "Customer not found" }, { status: 404 });
    return canonicalJson(customer, { status: 200 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_VIEW] }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.customerId);
    const url = new URL(ctx.request!.url);
    const businessId = parseOrThrow(uuidSchema, url.searchParams.get("businessId"));
    const body = await parseRequestBody(ctx.request!, updateCustomerSchema);
    const customer = await updateCustomer(ctx.verifiedWorkspaceId, businessId, params.customerId, body, ctx.verifiedActorId);
    if (!customer) return canonicalJson({ error: "Customer not found" }, { status: 404 });
    return canonicalJson(customer, { status: 200 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_MANAGE] }
);
