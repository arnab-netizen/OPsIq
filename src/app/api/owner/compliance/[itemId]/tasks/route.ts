/**
 * POST /api/owner/compliance/[itemId]/tasks — link a DelegatedTask to a compliance item.
 * Idempotent upsert on (workspaceId, complianceItemId, taskId). OWNER_MANAGE required.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { linkTaskToComplianceItem } from "@/services/owner-mode/compliance.service";
import { NotFoundError } from "@/infra/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  taskId: z.string().uuid(),
  linkType: z.enum(["REMEDIATION", "EVIDENCE"]).optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { itemId } = params;
    const input = await parseRequestBody(ctx.request!, schema);
    try {
      const link = await linkTaskToComplianceItem({
        workspaceId: ctx.verifiedWorkspaceId,
        itemId,
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
