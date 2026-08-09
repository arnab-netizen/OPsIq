/**
 * GET /api/owner/priorities?businessId=... — the top 3–5 runtime-fed priority cards for the command
 *     center. Each card answers what is wrong, why it matters, what to do next, who owns it, what proof
 *     is needed, when OpsIQ reassesses, and the confidence/data limitation. Assembled from the live
 *     whole-business plan + readiness + action assignment + input guidance. No static fallback.
 *     OWNER_VIEW, workspace-scoped, canonically enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { getOwnerCommandPriorities } from "@/services/owner-mode/owner-command-priorities.service";
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
    const view = await getOwnerCommandPriorities({
      db: db as unknown as PrismaClient,
      workspaceId: ctx.verifiedWorkspaceId,
      businessId,
      now: new Date(),
    });
    return canonicalJson(view, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
