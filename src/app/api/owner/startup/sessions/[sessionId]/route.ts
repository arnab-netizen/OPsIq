/**
 * GET  /api/owner/startup/sessions/[sessionId] — full session view.
 * PATCH /api/owner/startup/sessions/[sessionId] — transition status.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getStartupSession, transitionSession } from "@/services/owner-strategy/startup-session.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const session = await getStartupSession(ctx.verifiedWorkspaceId, params.sessionId);
    return canonicalJson({ session }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

const patchSchema = z.object({
  status: z.string(),
});

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, patchSchema);
    await transitionSession(
      ctx.verifiedWorkspaceId,
      params.sessionId,
      ctx.verifiedActorId,
      body.status as Parameters<typeof transitionSession>[3]
    );
    return canonicalJson({ success: true }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
