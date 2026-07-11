/**
 * POST /api/owner/capacity/assess — Equipment Capacity Assessment (Module #16).
 *
 * Accepts a fleet of equipment records and returns a worst-case fleet capacity
 * status with bottleneck identification and a growth-safety gate:
 *
 * - "safe"       — spare capacity available; growth is not blocked
 * - "caution"    — high utilization or unknown; growth is cautioned
 * - "high_risk"  — utilization at ceiling; growth is unsafe
 * - "blocked"    — equipment down, out of service, or maintenance overdue; growth blocked
 *
 * Hard governance rules (enforced by the pure domain engine):
 * - A down or maintenance-overdue machine always blocks growth
 * - Unknown utilization is never treated as safe — it surfaces as "caution"
 * - Growth recommendation only green-lit when ALL equipment is safe
 * - No DB writes; no fabricated utilization estimates
 *
 * Pure analysis — no persistence. workspaceId from canonical session context only.
 *
 * Auth: OWNER_VIEW capability, workspace-scoped, canonically enforced.
 * Body: validated via Zod (capacityAssessRequestSchema).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { capacityAssessRequestSchema } from "@/domain/owner-mode/capacity-assess.validation";
import {
  assessFleetCapacity,
  capacityBlocksGrowth,
  type EquipmentRecord,
} from "@/domain/owner-mode/equipment-capacity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const { equipment, evaluatedAt } = await parseRequestBody(
      ctx.request!,
      capacityAssessRequestSchema,
    );

    const now = evaluatedAt ? new Date(evaluatedAt) : new Date();

    // Map validated body records to the domain type (maintenanceDueAt as Date | null).
    const domainEquipment: Array<EquipmentRecord & { name: string }> = equipment.map((eq) => ({
      name: eq.name,
      utilization: eq.utilization,
      downtimeState: eq.downtimeState,
      maintenanceDueAt: eq.maintenanceDueAt ? new Date(eq.maintenanceDueAt) : null,
      status: eq.status,
    }));

    const fleetResult = assessFleetCapacity(domainEquipment, now);
    const growthBlocked = capacityBlocksGrowth(fleetResult.status);

    return {
      workspaceId: ctx.verifiedWorkspaceId,
      evaluatedAt: now.toISOString(),
      fleet: fleetResult,
      growthBlocked,
      equipmentCount: equipment.length,
    };
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
