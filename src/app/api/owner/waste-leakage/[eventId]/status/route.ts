/**
 * PATCH /api/owner/waste-leakage/[eventId]/status — advance event lifecycle.
 * Valid transitions: detected → investigating → confirmed → recovering → verified | dismissed
 * OWNER_MANAGE required. Workspace-scoped (enforced via workspaceId in service).
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { updateLeakageStatus } from "@/services/owner-mode/waste-leakage.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const updateStatusSchema = z.object({
  newStatus: z.enum(["investigating", "confirmed", "recovering", "verified", "dismissed"]),
  dismissalReason: z.string().max(500).nullable().optional(),
  recoveryAmount: z.number().positive().nullable().optional(),
});

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.eventId);
    const body = await parseRequestBody(ctx.request!, updateStatusSchema);
    await updateLeakageStatus(params.eventId, {
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      newStatus: body.newStatus,
      dismissalReason: body.dismissalReason ?? null,
      recoveryAmount: body.recoveryAmount ?? null,
    });
    return canonicalJson({ ok: true }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
