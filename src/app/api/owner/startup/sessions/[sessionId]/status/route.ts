/**
 * PATCH /api/owner/startup/sessions/[sessionId]/status — lifecycle transition.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { transitionSession } from "@/services/owner-strategy/startup-session.service";
import type { StartupSessionStatus } from "@/domain/owner-strategy/startup-lifecycle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  newStatus: z.string().min(1),
});

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, bodySchema);
    await transitionSession(ctx.verifiedWorkspaceId, params.sessionId, ctx.verifiedActorId, body.newStatus as StartupSessionStatus);
    return canonicalJson({ ok: true }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
