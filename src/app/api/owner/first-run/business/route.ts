/**
 * POST /api/owner/first-run/business — create the workspace's first business (OWNER_MANAGE) through the
 * canonical governed creation service. The name defaults to the one typed at signup; only type and currency
 * are genuinely new. Idempotent and race-safe: a repeat submit returns the existing business.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { BUSINESS_TYPES } from "@/domain/founder-recovery/types";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { createFirstBusiness, recordProductEventOnce } from "@/services/owner-first-run/first-run.service";

const bodySchema = z.strictObject({
  name: z.string().trim().min(1).max(200).optional(),
  businessType: z.enum(BUSINESS_TYPES),
  currency: z.string().trim().min(3).max(8),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, bodySchema);
    const { business, replayed } = await createFirstBusiness(ctx.verifiedWorkspaceId, ctx.verifiedActorId, body);
    if (!replayed) {
      await recordProductEventOnce({
        name: "business_profile_completed",
        eventName: AUDIT_EVENTS.PRODUCT_BUSINESS_PROFILE_COMPLETED,
        workspaceId: ctx.verifiedWorkspaceId,
        actorId: ctx.verifiedActorId,
        businessId: business.id,
      });
    }
    return canonicalJson({ business, replayed }, { status: replayed ? 200 : 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
