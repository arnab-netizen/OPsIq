/**
 * POST /api/owner/risks/[riskId]/tasks — link a DelegatedTask to a business risk.
 * Idempotent upsert on (workspaceId, riskId, taskId). OWNER_MANAGE required.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { linkTaskToRisk } from "@/services/owner-mode/business-risk.service";
import { NotFoundError } from "@/infra/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  taskId: z.string().uuid(),
  linkType: z.enum(["MITIGATION", "EVIDENCE"]).optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { riskId } = params;
    const input = await parseRequestBody(ctx.request!, schema);
    try {
      const link = await linkTaskToRisk({
        workspaceId: ctx.verifiedWorkspaceId,
        riskId,
        taskId: input.taskId,
        linkType: input.linkType,
        actorId: ctx.verifiedActorId,
      });
      return canonicalJson({ link }, { status: 201 });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return canonicalJson({ error: err.message }, { status: 404 });
      }
      throw err;
    }
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
