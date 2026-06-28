/**
 * Jarvis 360 Slice 7 — equipment record surface.
 * POST /api/owner/equipment — record equipment that feeds the growth capacity gate.
 * OWNER_MANAGE, workspace-scoped.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { recordEquipment } from "@/services/owner-mode/equipment.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  businessId: z.string().uuid().optional(),
  equipmentType: z.string().trim().min(1),
  name: z.string().trim().min(1),
  ratedCapacity: z.number().optional(),
  practicalCapacity: z.number().optional(),
  unit: z.string().optional(),
  utilization: z.number().min(0).max(1).optional(),
  status: z.string().optional(),
  downtimeState: z.enum(["up", "down"]).optional(),
  maintenanceDueAt: z.string().datetime().optional(),
  operatorSkill: z.string().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, schema);
    const id = await recordEquipment({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      ...input,
      maintenanceDueAt: input.maintenanceDueAt ? new Date(input.maintenanceDueAt) : null,
    });
    return canonicalJson({ id }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
