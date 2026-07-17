/**
 * POST /api/owner/policies/:policyKey/overrides — create a time-limited owner override for a policy.
 *
 * The override allows proceeding despite a WARN or BLOCK evaluation until it expires or is revoked.
 * Requires OWNER_MANAGE capability and an explicit stated reason (minimum 10 characters).
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { getPolicy, createOverride } from "@/services/governance/operating-policy.service";
import { NotFoundError } from "@/infra/errors";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createOverrideSchema = z.object({
  reason: z.string().min(10).max(1000),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, createOverrideSchema);
    const policy = await getPolicy(ctx.verifiedWorkspaceId, params.policyKey);
    if (!policy) throw new NotFoundError("OperatingPolicy", params.policyKey);
    const overrideId = await createOverride({
      policyId: policy.id,
      workspaceId: ctx.verifiedWorkspaceId,
      overriddenBy: ctx.verifiedActorId,
      reason: body.reason,
      context: body.context,
    });
    return canonicalJson({ overrideId }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
