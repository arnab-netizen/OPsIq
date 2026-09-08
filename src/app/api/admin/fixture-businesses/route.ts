/**
 * GET /api/admin/fixture-businesses?workspaceId=...
 *
 * Read-only, SYSTEM_ADMIN-only view of acceptance/QA fixture businesses (isFixtureBusiness: true)
 * within one workspace. This is the ONLY governed path that can see fixture rows — ordinary owner
 * queries (listBusinesses) always exclude them. Used by acceptance/QA tooling to locate and, via
 * the existing PATCH /api/owner/recovery/businesses/[id] archive path, clean them up; this
 * endpoint never mutates anything itself.
 *
 * See docs/opsiq-governance/ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ValidationError } from "@/infra/errors";
import { listFixtureBusinesses } from "@/services/founder-recovery/business.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId) throw new ValidationError("workspaceId query parameter is required");

    const businesses = await listFixtureBusinesses(workspaceId);
    return {
      businesses: businesses.map((b: any) => ({
        id: b.id,
        workspaceId: b.workspaceId,
        name: b.name,
        businessType: b.businessType,
        isActive: b.isActive,
        createdAt: b.createdAt,
      })),
    };
  },
  { requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN] }
);
