/**
 * GET   /api/owner/policies/:policyKey — get a single operating policy.
 * PATCH /api/owner/policies/:policyKey — update threshold, hardBlock, isActive, or expiryAfterOverrideMinutes.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { getPolicy, updatePolicy } from "@/services/governance/operating-policy.service";
import { NotFoundError } from "@/infra/errors";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const updatePolicySchema = z.object({
  threshold: z.number().positive().optional(),
  hardBlock: z.boolean().optional(),
  isActive: z.boolean().optional(),
  expiryAfterOverrideMinutes: z.number().int().positive().nullable().optional(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const policy = await getPolicy(ctx.verifiedWorkspaceId, params.policyKey);
    if (!policy) throw new NotFoundError("OperatingPolicy", params.policyKey);
    return canonicalJson({ policy }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, updatePolicySchema);
    const updated = await updatePolicy(ctx.verifiedWorkspaceId, params.policyKey, body, ctx.verifiedActorId);
    return canonicalJson({ policy: updated }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
