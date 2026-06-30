/**
 * GET /api/owner/input-guidance?businessId=... — dynamic owner-facing input-accuracy guidance.
 *     For every data category: what/why, the decision and confidence domain it affects, expected
 *     confidence gain, the recommendation at risk if missing, whether action can proceed now or must
 *     wait, the minimum for a first diagnosis, and the single next best input — ranked by severity,
 *     confidence impact, and owner effort. Derived from real workspace+business-scoped persisted rows.
 *     OWNER_VIEW, workspace-scoped, canonically enforced (authorization server-side, not in the page).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { getOwnerInputGuidance } from "@/services/owner-mode/owner-input-guidance.service";
import type { PrismaClient } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId") ?? "";
    const view = await getOwnerInputGuidance({
      db: db as unknown as PrismaClient,
      workspaceId: ctx.verifiedWorkspaceId,
      businessId,
      now: new Date(),
    });
    return canonicalJson(view, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
