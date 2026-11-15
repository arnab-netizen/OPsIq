/**
 * POST /api/admin/acceptance-fixtures/businesses
 *
 * Creates an acceptance FIXTURE business in the caller's own verified workspace. There is no
 * fixture flag in the request: the service is called with isFixtureBusiness hard-wired to true, so
 * this route cannot create an ordinary business (no silent downgrade is possible). The tenant is
 * always ctx.verifiedWorkspaceId; there is no workspace parameter. Authorization is decided by the
 * canonical wrapper before this handler runs, so an unauthorized call writes nothing.
 * See docs/opsiq-governance/ACCEPTANCE_FIXTURE_AUTHORITY.md.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { parseRequestBody } from "@/lib/validation";
import { emitAuditEvent } from "@/infra/audit";
import { acceptanceFixtureBusinessSchema } from "@/domain/acceptance-fixtures/validation";
import { createBusiness } from "@/services/founder-recovery/business.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, acceptanceFixtureBusinessSchema);
    const business = await createBusiness(input, ctx.verifiedActorId, ctx.verifiedWorkspaceId, { isFixtureBusiness: true });
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ACCEPTANCE_FIXTURE_CREATED,
      actorId: ctx.verifiedActorId,
      workspaceId: ctx.verifiedWorkspaceId,
      entityType: "OwnerBusiness",
      entityId: business.id,
      payload: { kind: "business" },
    });
    return canonicalJson(business, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE], requireWorkspace: true }
);
