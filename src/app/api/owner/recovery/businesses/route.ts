/**
 * GET  /api/owner/recovery/businesses  — list owner businesses (OWNER_VIEW)
 * POST /api/owner/recovery/businesses  — create a business (OWNER_MANAGE)
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { businessCreateSchema } from "@/domain/founder-recovery/validation";
import { createBusiness, listBusinesses } from "@/services/founder-recovery/business.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    return listBusinesses(ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, businessCreateSchema);
    // isFixtureBusiness is only ever honored for a SYSTEM_ADMIN-capable actor (acceptance/QA
    // tooling) — a self-serve owner can never mark their own business a fixture. See
    // ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md.
    const isFixtureBusiness = input.isFixtureBusiness === true && ctx.verifiedCapabilities.has(CAPABILITIES.SYSTEM_ADMIN);
    const business = await createBusiness(input, ctx.verifiedActorId, ctx.verifiedWorkspaceId, { isFixtureBusiness });
    return canonicalJson(business, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
