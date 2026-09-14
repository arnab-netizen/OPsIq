/**
 * GET /api/admin/customers/diagnostics?email=...&workspaceId=...
 *
 * "Can request/sign up/verify/sign in/access [workspace]" — answered using
 * the SAME authoritative predicates the real routes use (see
 * customer-access.service.ts's diagnoseAccess doc comment). Gated on
 * CUSTOMER_ACCESS_MANAGE.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { diagnoseAccess } from "@/services/admin/customer-access.service";
import { ValidationError } from "@/infra/errors";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const email = url.searchParams.get("email");
    const workspaceId = url.searchParams.get("workspaceId") ?? undefined;
    if (!email) {
      return canonicalJson({ error: "email query parameter is required" }, { status: 400 });
    }
    try {
      return await diagnoseAccess(email, workspaceId);
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
