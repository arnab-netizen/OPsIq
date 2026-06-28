/**
 * Jarvis 360 Slice 0 — owner safety-gate opt-out surface.
 *
 * POST /api/owner/gates/opt-out — record an explicit, audited owner opt-out from
 *      default-on safety-gate enforcement (reason + risk class required).
 * DELETE /api/owner/gates/opt-out — clear an opt-out (re-enable enforcement).
 *
 * OWNER_MANAGE, workspace-scoped, validated. The capability guard guarantees the
 * actor is an owner-manager, so actorIsOwner is true once enforcement passes.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import {
  recordGateOptOut,
  clearGateOptOut,
  GATE_OPT_OUT_RISK_CLASSES,
} from "@/services/owner-mode/gate-enforcement-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const optOutSchema = z.object({
  reason: z.string().trim().min(1, "reason is required"),
  riskClass: z.enum(GATE_OPT_OUT_RISK_CLASSES),
  expiresAt: z.string().datetime().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, optOutSchema);
    await recordGateOptOut({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      actorIsOwner: true,
      reason: input.reason,
      riskClass: input.riskClass,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
    });
    return canonicalJson({ ok: true }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const DELETE = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    await clearGateOptOut({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      actorIsOwner: true,
    });
    return canonicalJson({ ok: true }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
