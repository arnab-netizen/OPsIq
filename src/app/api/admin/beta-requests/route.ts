/**
 * GET /api/admin/beta-requests
 *
 * List controlled-beta homepage capture requests (read-only admin
 * operability view). Gated on BETA_REQUEST_REVIEW — a narrow OpsIQ
 * platform-operator capability (see ROLES.BETA_REQUEST_OPERATOR in
 * domain/constants/roles.ts), NOT the full SYSTEM_ADMIN bundle. A
 * SYSTEM_ADMIN holder still passes this check (SYSTEM_ADMIN's role grants
 * every capability), but a beta-request operator granted only
 * BETA_REQUEST_REVIEW/BETA_REQUEST_INVITE gets no other admin surface —
 * see src/__tests__/policies/beta-request-operator.test.ts and
 * src/__tests__/api/admin/beta-requests-rbac.test.ts for the privilege
 * boundary proofs.
 *
 * This is the "HOW_OWNER_REVIEWS_REQUESTS" mechanism for the controlled-beta
 * homepage capture — API-only, mirroring the existing
 * GET /api/admin/workspaces pattern exactly. No new UI dashboard.
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { listBetaRequestsForAdmin } from "@/services/admin/admin-operability.service";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const limitParam = url.searchParams.get("limit");
    const cursor = url.searchParams.get("cursor");
    const status = url.searchParams.get("status") ?? undefined;

    const result = await listBetaRequestsForAdmin({
      status,
      limit: limitParam !== null ? parseInt(limitParam, 10) : undefined,
      cursor,
    });

    return result;
  },
  {
    requireCapabilities: [CAPABILITIES.BETA_REQUEST_REVIEW],
  }
);
