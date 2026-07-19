/**
 * Phase 4 — Resource Pool and Allocation routes.
 *
 * GET  /api/owner/resource-pools — list resource pools with active allocations
 * POST /api/owner/resource-pools — create a pool, allocate, or release an allocation
 *
 * Workspace isolation enforced via canonical auth. OWNER_MANAGE required.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import {
  createResourcePool,
  allocateResource,
  releaseAllocation,
  listResourcePools,
} from "@/services/owner-mode/resource-pool.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["CREATE_POOL", "ALLOCATE", "RELEASE"]),
  // CREATE_POOL fields
  resourceType: z.enum(["BUDGET", "TIME_HOURS", "STAFF_CAPACITY", "EQUIPMENT_CAPACITY", "OWNER_ATTENTION"]).optional(),
  label: z.string().trim().min(1).max(300).optional(),
  totalCapacity: z.number().positive().optional(),
  unit: z.string().trim().min(1).max(50).optional(),
  periodStart: z.string().datetime().nullish(),
  periodEnd: z.string().datetime().nullish(),
  // ALLOCATE fields
  poolId: z.string().trim().uuid().nullish(),
  objectiveId: z.string().trim().uuid().nullish(),
  allocationAmount: z.number().positive().optional(),
  priority: z.number().int().min(0).max(100).optional(),
  // RELEASE fields
  allocationId: z.string().trim().uuid().nullish(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const pools = await listResourcePools(ctx.verifiedWorkspaceId);
    return canonicalJson({ pools }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, schema);
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    if (input.action === "CREATE_POOL") {
      if (!input.resourceType || !input.label || !input.totalCapacity || !input.unit) {
        return canonicalJson({ error: "resourceType, label, totalCapacity, and unit required" }, { status: 400 });
      }
      const pool = await createResourcePool({
        workspaceId,
        actorId,
        resourceType: input.resourceType,
        label: input.label,
        totalCapacity: input.totalCapacity,
        unit: input.unit,
        periodStart: input.periodStart ? new Date(input.periodStart) : null,
        periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
      });
      return canonicalJson({ pool }, { status: 201 });
    }

    if (input.action === "ALLOCATE") {
      if (!input.poolId || !input.objectiveId || !input.allocationAmount) {
        return canonicalJson({ error: "poolId, objectiveId, and allocationAmount required" }, { status: 400 });
      }
      const allocation = await allocateResource({
        workspaceId,
        actorId,
        poolId: input.poolId,
        objectiveId: input.objectiveId,
        allocationAmount: input.allocationAmount,
        priority: input.priority,
      });
      return canonicalJson({ allocation }, { status: 201 });
    }

    // RELEASE
    if (!input.allocationId) {
      return canonicalJson({ error: "allocationId required for RELEASE" }, { status: 400 });
    }
    const released = await releaseAllocation(workspaceId, actorId, input.allocationId);
    return canonicalJson({ allocation: released }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
