/**
 * GET /api/owner/first-run/improve-target?category=[&businessId=] — where "Improve this recommendation" sends the owner
 * for one question, decided on the SERVER from persisted evidence: add it, edit the Finance entry the read is about,
 * edit the Cashflow entry that speaks for the read's period, or "saved, but this read doesn't use it". The client
 * supplies only the business and the category; it never says whether the evidence exists or whether to add or edit.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseSearchParams, uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NotFoundError } from "@/infra/errors";
import { getFirstRunContext } from "@/services/owner-first-run/first-run.service";
import { resolveImproveTarget } from "@/services/owner-first-run/improve-target.service";

// `businessId` is optional: omitted, it is the workspace's own first-run business (the one the first read is about).
const querySchema = z.object({ businessId: uuidSchema.optional(), category: z.string().trim().min(1).max(60) });

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const q = parseSearchParams(ctx.request!.url, querySchema);
    const businessId = q.businessId ?? (await getFirstRunContext(ctx.verifiedWorkspaceId)).business?.id;
    if (!businessId) throw new NotFoundError("OwnerBusiness", "first-run");
    return { target: await resolveImproveTarget(ctx.verifiedWorkspaceId, businessId, q.category) };
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
