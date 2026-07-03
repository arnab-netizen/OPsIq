/**
 * Owner standing-instructions write surface (Wave 2 — REAL_OWNER_RUNTIME_LOOP).
 * POST /api/owner/standing-instructions — record an owner standing instruction that
 * bounds later approval resolution (OWNER_MANAGE, workspace-scoped, owner-only, audited).
 *
 * Closes the orphaned-write gap: the eval/read side (evaluateRequestAgainstStandingInstructions
 * via /api/owner/approvals/resolve) already existed, but there was no route to create an
 * instruction, so an owner could never seed the rules the resolver consults. No transition/gate
 * logic here — the service enforces owner authority + workspace/business scope and emits the audit.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { recordStandingInstruction } from "@/services/owner-mode/owner-load.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  businessId: z.string().uuid().optional(),
  scope: z.string().trim().min(1),
  allowedActionTypes: z.array(z.string().trim().min(1)).default([]),
  forbiddenActionTypes: z.array(z.string().trim().min(1)).default([]),
  maxAmount: z.number().nonnegative().optional(),
  riskClass: z.string().trim().min(1),
  validUntil: z.string().datetime().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, schema);
    await recordStandingInstruction({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      // OWNER_MANAGE enforcement above means the actor is an owner-manager (same derivation as
      // owner/gates/opt-out, owner/approvals/memory, owner/sop-documents).
      actorIsOwner: true,
      businessId: input.businessId ?? null,
      scope: input.scope,
      allowedActionTypes: input.allowedActionTypes,
      forbiddenActionTypes: input.forbiddenActionTypes,
      maxAmount: input.maxAmount ?? null,
      riskClass: input.riskClass,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
    });
    return canonicalJson({ ok: true }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
