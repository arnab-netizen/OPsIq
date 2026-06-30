/**
 * GET /api/owner/readiness?businessId=... — the Owner Pilot Readiness Score for ONE business.
 *     Ten dimensions (data, diagnosis confidence, actionability, proof, delegation, financial,
 *     customer/reputation, capacity/staff, risk/compliance, learning/provenance), an overall score,
 *     hard blockers, and the pilot-ready gate — assembled from the LIVE runtime whole-business plan,
 *     the real workspace+business-scoped supplied data, and the committed max-reliability benchmark.
 *     OWNER_VIEW, workspace-scoped, canonically enforced (authorization server-side, not in the page).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { getOwnerReadiness } from "@/services/owner-mode/owner-readiness.service";
import type { PrismaClient } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId") ?? "";
    const view = await getOwnerReadiness({
      db: db as unknown as PrismaClient,
      workspaceId: ctx.verifiedWorkspaceId,
      businessId,
      now: new Date(),
    });
    return canonicalJson(view, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
