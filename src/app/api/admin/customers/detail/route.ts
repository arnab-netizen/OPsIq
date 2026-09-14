/**
 * GET /api/admin/customers/detail?email=...
 *
 * Read-only customer detail: BetaRequest state, user existence/verification/
 * active state, workspace memberships and their real access status. Gated
 * on CUSTOMER_ACCESS_MANAGE.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getCustomerDetail } from "@/services/admin/customer-access.service";
import { ValidationError } from "@/infra/errors";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const email = url.searchParams.get("email");
    if (!email) {
      return canonicalJson({ error: "email query parameter is required" }, { status: 400 });
    }
    try {
      return await getCustomerDetail(email);
    } catch (error) {
      if (error instanceof ValidationError) {
        // error.message on a ValidationError is hand-written at each throw
        // site in customer-access.service.ts specifically to be
        // owner-safe -- never raw Prisma/stack text.
        const ownerSafeDetail = error.message;
        return canonicalJson({ error: ownerSafeDetail }, { status: 400 });
      }
      throw error;
    }
  },
  { requireCapabilities: [CAPABILITIES.CUSTOMER_ACCESS_MANAGE] }
);
