/** POST /api/owner/first-run/result/viewed — records (once) that the first read was shown. */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { recordFirstResultViewed } from "@/services/owner-first-run/first-run.service";

const bodySchema = z.strictObject({ businessId: uuidSchema });

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, bodySchema);
    await recordFirstResultViewed(ctx.verifiedWorkspaceId, ctx.verifiedActorId, body.businessId);
    return canonicalJson({ ok: true }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
