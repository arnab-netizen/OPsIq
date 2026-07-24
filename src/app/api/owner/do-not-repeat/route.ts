/**
 * Jarvis 360 Slice 12 — do-not-repeat memory surface.
 * POST /api/owner/do-not-repeat — record a do_not_repeat rule (blocks matching
 *      recommendations at promotion). OWNER_MANAGE, workspace-scoped.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { recordDoNotRepeat } from "@/services/owner-mode/do-not-repeat.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  businessId: z.string().uuid(),
  memoryKey: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  recommendationId: z.string().uuid().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, schema);
    const id = await recordDoNotRepeat({ ...input, workspaceId: ctx.verifiedWorkspaceId });
    return canonicalJson({ id }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
