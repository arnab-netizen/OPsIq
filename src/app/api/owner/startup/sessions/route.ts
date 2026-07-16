/**
 * POST /api/owner/startup/sessions — validate startup ideas and persist the session.
 * GET  /api/owner/startup/sessions — list all sessions for this workspace.
 * OWNER_MANAGE (write) / OWNER_VIEW (read), workspace-scoped.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createStartupSession, listStartupSessions } from "@/services/owner-strategy/startup-session.service";
import { startupIntakeSchema, startupIdeaSchema } from "@/domain/owner-strategy/startup-mode.validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSessionSchema = z.object({
  sessionLabel: z.string().max(200).nullable().optional(),
  intake: startupIntakeSchema,
  ideas: z.array(startupIdeaSchema).min(1).max(20),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, createSessionSchema);
    const sessionId = await createStartupSession({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      sessionLabel: body.sessionLabel ?? null,
      intake: body.intake,
      ideas: body.ideas,
    });
    return canonicalJson({ sessionId }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const sessions = await listStartupSessions(ctx.verifiedWorkspaceId);
    return canonicalJson({ sessions }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
