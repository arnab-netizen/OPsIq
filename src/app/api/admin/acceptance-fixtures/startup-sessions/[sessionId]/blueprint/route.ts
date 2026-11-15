/**
 * POST /api/admin/acceptance-fixtures/startup-sessions/[sessionId]/blueprint
 *
 * Creates the fixture-tagged execution blueprint for an acceptance FIXTURE Startup session. The
 * session must be a fixture in the caller's own workspace; anything else (a real owner's session, a
 * session in another workspace, an unknown id) is the same 404, so this authority can never be used
 * to mark a real owner's records as fixtures (which would hide them from that owner). The fixture
 * flag is hard-wired (no request field). See docs/opsiq-governance/ACCEPTANCE_FIXTURE_AUTHORITY.md.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { parseRequestBody } from "@/lib/validation";
import { emitAuditEvent } from "@/infra/audit";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { acceptanceFixtureBlueprintSchema } from "@/domain/acceptance-fixtures/validation";
import { createBlueprint } from "@/services/owner-strategy/startup-execution-blueprint.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, acceptanceFixtureBlueprintSchema);
    const session = await db.ownerStartupSession.findFirst({
      where: { id: params.sessionId, workspaceId: ctx.verifiedWorkspaceId, isFixtureBusiness: true },
      select: { id: true },
    });
    if (!session) throw new NotFoundError("OwnerStartupSession", params.sessionId);

    const result = await createBlueprint(
      ctx.verifiedWorkspaceId,
      ctx.verifiedActorId,
      {
        sessionId: params.sessionId,
        ideaId: body.ideaId,
        ownerDecisionId: body.ownerDecisionId,
        objectiveTitle: body.objectiveTitle,
        objectiveDescription: body.objectiveDescription,
        targetMetricName: body.targetMetricName,
        targetValue: body.targetValue,
        deadline: body.deadline ? new Date(body.deadline) : undefined,
        initialTaskTitles: body.initialTaskTitles,
      },
      { isFixtureRecord: true }
    );
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ACCEPTANCE_FIXTURE_CREATED,
      actorId: ctx.verifiedActorId,
      workspaceId: ctx.verifiedWorkspaceId,
      entityType: "OwnerStartupSession",
      entityId: params.sessionId,
      payload: { kind: "startup_blueprint" },
    });
    return canonicalJson(result, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE], requireWorkspace: true }
);
