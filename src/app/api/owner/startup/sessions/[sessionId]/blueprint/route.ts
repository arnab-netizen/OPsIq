/**
 * POST /api/owner/startup/sessions/[sessionId]/blueprint — create execution blueprint (idempotent).
 * GET  /api/owner/startup/sessions/[sessionId]/blueprint — get blueprint.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createBlueprint } from "@/services/owner-strategy/startup-execution-blueprint.service";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const blueprint = await db.startupExecutionBlueprint.findFirst({
      where: {
        sessionId: params.sessionId,
        workspaceId: ctx.verifiedWorkspaceId,
        blueprintStatus: { not: "SUPERSEDED" },
      },
    });
    if (!blueprint) throw new NotFoundError("StartupExecutionBlueprint", params.sessionId);
    // Expose arrays at top level for client convenience (blueprint object also included)
    return canonicalJson({
      blueprint,
      objectiveId: blueprint.objectiveId ?? null,
      taskIds: blueprint.taskIds,
      kpiIds: blueprint.kpiIds,
      riskIds: blueprint.riskIds,
    }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

const postSchema = z.object({
  ideaId: z.string().uuid(),
  ownerDecisionId: z.string().uuid(),
  objectiveTitle: z.string().min(1).max(500),
  objectiveDescription: z.string().optional(),
  targetMetricName: z.string().optional(),
  targetValue: z.number().optional(),
  deadline: z.string().optional(),
  initialTaskTitles: z.array(z.string()).optional(),
  isFixtureRecord: z.boolean().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, postSchema);
    // isFixtureRecord is only ever honored for a SYSTEM_ADMIN-capable actor (acceptance/QA
    // tooling) — a self-serve owner's request body can carry it and it is silently ignored
    // without that capability. See ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md.
    const isFixtureRecord =
      body.isFixtureRecord === true && ctx.verifiedCapabilities.has(CAPABILITIES.SYSTEM_ADMIN);
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
      { isFixtureRecord }
    );
    return canonicalJson(result, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
