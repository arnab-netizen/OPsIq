/**
 * GET /api/owner/do-not-repeat/rules?businessId= — the active blocking do-not-repeat rules that apply to that
 * business (the owner action gate's applicability; listOwnerDoNotRepeatRules). OWNER_VIEW, workspace-scoped;
 * the business must belong to the workspace.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { listOwnerDoNotRepeatRules } from "@/services/owner-mode/do-not-repeat.service";
import { NotFoundError } from "@/infra/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const query = z.object({ businessId: z.string().uuid() });

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const parsed = query.safeParse({ businessId: url.searchParams.get("businessId") });
    if (!parsed.success) return canonicalJson({ error: "businessId is required" }, { status: 400 });
    try {
      const rules = await listOwnerDoNotRepeatRules(ctx.verifiedWorkspaceId, parsed.data.businessId);
      return canonicalJson({ rules }, { status: 200 });
    } catch (err) {
      if (err instanceof NotFoundError) return canonicalJson({ error: "Business not found" }, { status: 404 });
      throw err;
    }
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
