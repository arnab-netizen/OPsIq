/**
 * Jarvis 360 Slice 4 — owner approval-memory surface (load reduction).
 *
 * POST /api/owner/approvals/memory — owner records a reusable approval for a
 *      content-hashed decision/rule (scope + risk), so OpsIQ stops re-asking.
 * GET  /api/owner/approvals/memory?scope=&contentHash=&riskClass= — check whether
 *      an approval is remembered (so a re-ask can be suppressed).
 *
 * OWNER_MANAGE, workspace-scoped, validated. The capability guard guarantees owner.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { APPROVAL_RISK_CLASSES } from "@/domain/owner-mode/approval-memory";
import { recordApproval, isApprovalRemembered } from "@/services/owner-mode/approval-memory.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const recordSchema = z.object({
  scope: z.string().trim().min(1),
  contentHash: z.string().trim().min(8),
  riskClass: z.enum(APPROVAL_RISK_CLASSES),
  validUntil: z.string().datetime().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, recordSchema);
    await recordApproval({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      actorIsOwner: true,
      scope: input.scope,
      contentHash: input.contentHash,
      riskClass: input.riskClass,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
    });
    return canonicalJson({ ok: true }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const scope = url.searchParams.get("scope") ?? "";
    const contentHash = url.searchParams.get("contentHash") ?? "";
    const riskClassRaw = url.searchParams.get("riskClass") ?? "";
    const riskClass = (APPROVAL_RISK_CLASSES as readonly string[]).includes(riskClassRaw)
      ? (riskClassRaw as (typeof APPROVAL_RISK_CLASSES)[number])
      : "critical"; // unknown risk → strictest (least likely to reuse)
    const remembered = await isApprovalRemembered({
      workspaceId: ctx.verifiedWorkspaceId,
      scope,
      contentHash,
      riskClass,
    });
    return canonicalJson({ remembered }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
