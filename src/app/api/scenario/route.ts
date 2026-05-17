import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError } from "@/infra/errors";
import { runScenario } from "@/services/scenario/engine";
import { resolveServerRole } from "@/services/auth/server-role";
import { logAuditEvent } from "@/services/audit/audit-log";
import { randomUUID } from "crypto";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // Enforce server-side auth (scenario analysis affects decisions)
    const role = await resolveServerRole();
    if (!role) {
      throw new UnauthorizedError("Unauthorized");
    }

    // Get actor ID for audit
    const actorId = ctx.verifiedActorId;

  const body = await ctx.request!.json();
  const { baseRevenue, baseCost, deltaRevenue, deltaCost } = body;

  // Validate input types
  if (
    typeof baseRevenue !== "number" ||
    typeof baseCost !== "number" ||
    typeof deltaRevenue !== "number" ||
    typeof deltaCost !== "number"
  ) {
    throw new Error("Invalid input: baseRevenue, baseCost, deltaRevenue, deltaCost must be numbers");
  }

  const result = runScenario({
    baseRevenue,
    baseCost,
    deltaRevenue,
    deltaCost,
  });

  // Log audit event for scenario analysis
  const scenarioId = randomUUID();
  await logAuditEvent({
    eventName: "ANALYZE",
    entityType: "Scenario",
    entityId: scenarioId,
    actorId,
    role,
    before: null,
    after: {
      baseRevenue,
      baseCost,
      deltaRevenue,
      deltaCost,
      result,
    },
  }).catch((auditError) => {
    console.error(`Audit logging failed: ${auditError}`);
  });

  return result;
  },
  { requireWorkspace: true }
);
