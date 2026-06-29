/**
 * GET /api/owner/whole-business-plan?businessId=... — the NEW production owner-advice runtime,
 *     surfaced for the command center. Composes real DB providers + persisted-state context +
 *     workspace-private learning into ONE whole-business operating plan view.
 *     OWNER_VIEW, workspace-scoped, canonically enforced (authorization server-side, not in the page).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";
import type { PrismaClient } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    // Mirrors the sibling owner routes: an absent businessId yields the service's safe not-found
    // view (found:false) rather than a hand-rendered error — the page only renders when found.
    const businessId = url.searchParams.get("businessId") ?? "";
    const view = await getOwnerWholeBusinessPlan({
      db: db as unknown as PrismaClient,
      workspaceId: ctx.verifiedWorkspaceId,
      businessId,
      now: new Date(),
    });
    return canonicalJson(view, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
