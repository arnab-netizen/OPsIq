/**
 * GET /api/owner/onboarding?businessId=... — first-use owner onboarding state for ONE business.
 *     Returns the ordered setup steps, missing minimum data with plain-language reasons, the HONEST
 *     confidence available before diagnosis, whether a limited first diagnosis can run, a cautious
 *     first-action preview, what-not-to-do, the next best upload, and role-aware proof/delegation
 *     guidance — all derived from real workspace+business-scoped persisted rows.
 *     OWNER_VIEW, workspace-scoped, canonically enforced (authorization server-side, not in the page).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { getOwnerOnboardingState } from "@/services/owner-mode/owner-onboarding.service";
import type { PrismaClient } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId") ?? "";
    const view = await getOwnerOnboardingState({
      db: db as unknown as PrismaClient,
      workspaceId: ctx.verifiedWorkspaceId,
      businessId,
      now: new Date(),
    });
    return canonicalJson(view, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
