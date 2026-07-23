/**
 * POST /api/owner/risks/[riskId]/review — lifecycle transition for a business risk.
 * Validates transition legality server-side. OWNER_MANAGE required.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { reviewRisk } from "@/services/owner-mode/business-risk.service";
import { NotFoundError, ValidationError } from "@/infra/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  newStatus: z.enum(["ASSESSED", "MITIGATING", "ACCEPTED", "RESOLVED", "CLOSED"]),
  residualRisk: z.number().int().min(0).max(100).nullish(),
  acceptanceRationale: z.string().trim().max(2000).nullish(),
  reviewNotes: z.string().trim().max(2000).nullish(),
  reviewDueDate: z.string().datetime().nullish(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { riskId } = params;
    const input = await parseRequestBody(ctx.request!, schema);
    try {
      const updated = await reviewRisk({
        workspaceId: ctx.verifiedWorkspaceId,
        riskId,
        actorId: ctx.verifiedActorId,
        newStatus: input.newStatus,
        residualRisk: input.residualRisk,
        acceptanceRationale: input.acceptanceRationale,
        reviewNotes: input.reviewNotes,
        reviewDueDate: input.reviewDueDate ? new Date(input.reviewDueDate) : undefined,
      });
      return canonicalJson({ risk: updated }, { status: 200 });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return canonicalJson({ error: "Risk not found" }, { status: 404 });
      }
      if (err instanceof ValidationError) {
        return canonicalJson({ error: "Invalid status transition" }, { status: 422 });
      }
      throw err;
    }
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
