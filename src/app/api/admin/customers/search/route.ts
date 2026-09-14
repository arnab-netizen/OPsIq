/**
 * GET /api/admin/customers/search?query=...
 *
 * Read-only customer directory search (by email or workspace-name
 * substring). Gated on CUSTOMER_ACCESS_MANAGE.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { searchCustomers } from "@/services/admin/customer-access.service";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const query = url.searchParams.get("query") ?? "";
    const limitParam = url.searchParams.get("limit");
    const results = await searchCustomers(query, limitParam ? parseInt(limitParam, 10) : undefined);
    return { results };
  },
  { requireCapabilities: [CAPABILITIES.CUSTOMER_ACCESS_MANAGE] }
);
