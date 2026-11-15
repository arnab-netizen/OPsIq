/**
 * POST /api/admin/acceptance-fixtures/startup-sessions
 *
 * Creates an acceptance FIXTURE Startup session in the caller's own verified workspace. The fixture
 * flag is hard-wired (no request field), the tenant is always ctx.verifiedWorkspaceId, and
 * authorization is decided by the canonical wrapper before the handler runs.
 * See docs/opsiq-governance/ACCEPTANCE_FIXTURE_AUTHORITY.md.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { parseRequestBody } from "@/lib/validation";
import { emitAuditEvent } from "@/infra/audit";
import { acceptanceFixtureStartupSessionSchema } from "@/domain/acceptance-fixtures/validation";
import { createStartupSession } from "@/services/owner-strategy/startup-session.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, acceptanceFixtureStartupSessionSchema);
    const sessionId = await createStartupSession(
      {
        workspaceId: ctx.verifiedWorkspaceId,
        actorId: ctx.verifiedActorId,
        sessionLabel: body.sessionLabel ?? null,
        intake: body.intake,
        ideas: body.ideas,
      },
      { isFixtureBusiness: true }
    );
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ACCEPTANCE_FIXTURE_CREATED,
      actorId: ctx.verifiedActorId,
      workspaceId: ctx.verifiedWorkspaceId,
      entityType: "OwnerStartupSession",
      entityId: sessionId,
      payload: { kind: "startup_session" },
    });
    return canonicalJson({ sessionId }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE], requireWorkspace: true }
);
