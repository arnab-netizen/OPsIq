/**
 * POST /api/owner/compliance/[itemId]/review — lifecycle transition for a compliance item.
 * Validates transition legality server-side. OWNER_MANAGE required.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { updateComplianceStatus } from "@/services/owner-mode/compliance.service";
import { NotFoundError, ValidationError } from "@/infra/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  newStatus: z.enum(["active", "evidence_pending", "review_pending", "compliant", "breached", "waived"]),
  complianceNotes: z.string().trim().max(2000).nullish(),
  reviewedBy: z.string().uuid().nullish(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { itemId } = params;
    const input = await parseRequestBody(ctx.request!, schema);
    try {
      const updated = await updateComplianceStatus({
        workspaceId: ctx.verifiedWorkspaceId,
        itemId,
        actorId: ctx.verifiedActorId,
        newStatus: input.newStatus,
        complianceNotes: input.complianceNotes,
        reviewedBy: input.reviewedBy,
      });
      return canonicalJson({ item: updated }, { status: 200 });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return canonicalJson({ error: "Compliance item not found" }, { status: 404 });
      }
      if (err instanceof ValidationError) {
        return canonicalJson({ error: "Invalid status transition" }, { status: 422 });
      }
      throw err;
    }
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
