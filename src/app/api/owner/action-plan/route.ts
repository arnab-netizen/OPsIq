/**
 * GET /api/owner/action-plan?businessId=... — the structured assignment + proof framing for the
 *     whole-business plan analysis's suggested step (supporting context — the owner's main target is
 *     the canonical owner decision, never this plan step): responsible party, owner/delegate split, OpsIQ-prepared work, proof required +
 *     type, acceptance criteria, reassessment metric, escalation trigger, approval + delegatable flags.
 *     Derived from the runtime whole-business plan. OWNER_VIEW, workspace-scoped, canonically enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { getOwnerActionAssignment } from "@/services/owner-mode/owner-action-assignment.service";
import type { PrismaClient } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    if (!businessId) {
      return canonicalJson(
        { found: false, reason: "no_business_configured", workspaceId: ctx.verifiedWorkspaceId },
        { status: 200 }
      );
    }
    const view = await getOwnerActionAssignment({
      db: db as unknown as PrismaClient,
      workspaceId: ctx.verifiedWorkspaceId,
      businessId,
      now: new Date(),
    });
    return canonicalJson(view, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
