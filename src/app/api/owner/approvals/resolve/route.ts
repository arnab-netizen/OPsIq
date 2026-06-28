/**
 * Jarvis 360 gap-closure (G07,G08,G10) — live owner approval resolution surface.
 *
 * POST /api/owner/approvals/resolve — an owner-mode client calls this BEFORE asking
 *   the owner to approve a material decision. OpsIQ consults the owner's standing
 *   instructions + recorded approval memory and replies whether the owner must decide
 *   or OpsIQ already handled it (workload reduction, recorded as an attention event).
 *
 * Accepts either a precomputed `contentHash` or a `content` object (hashed server-side).
 * OWNER_MANAGE, workspace-scoped, validated.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { APPROVAL_RISK_CLASSES, hashApprovalContent } from "@/domain/owner-mode/approval-memory";
import { resolveOwnerApproval } from "@/services/owner-mode/owner-approval-resolution.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const resolveSchema = z
  .object({
    scope: z.string().trim().min(1),
    contentHash: z.string().trim().min(8).optional(),
    content: z.unknown().optional(),
    riskClass: z.enum(APPROVAL_RISK_CLASSES),
    actionType: z.string().trim().min(1),
    amount: z.number().finite().nonnegative().optional(),
  })
  .refine((v) => !!v.contentHash || v.content !== undefined, {
    message: "Provide either contentHash or content.",
  });

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, resolveSchema);
    const contentHash = input.contentHash ?? hashApprovalContent(input.content);
    const resolution = await resolveOwnerApproval({
      workspaceId: ctx.verifiedWorkspaceId,
      scope: input.scope,
      contentHash,
      riskClass: input.riskClass,
      actionType: input.actionType,
      amount: input.amount ?? null,
    });
    return canonicalJson(resolution, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
