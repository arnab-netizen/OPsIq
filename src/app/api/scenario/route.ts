import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError } from "@/infra/errors";
import { runScenario } from "@/services/scenario/engine";
import { resolveServerRole } from "@/services/auth/server-role";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { classifyOperatorError } from "@/lib/operator-error-governance";
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
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.SCENARIO_ANALYZED,
    entityType: "Scenario",
    entityId: scenarioId,
    actorId,
    actorType: "user",
    workspaceId: ctx.verifiedWorkspaceId,
    payload: {
      role,
      after: {
        baseRevenue,
        baseCost,
        deltaRevenue,
        deltaCost,
        result,
      },
    },
  }).catch((auditError) => {
    const governed = classifyOperatorError(auditError instanceof Error ? auditError : new Error(String(auditError)), { context: "load" });
    console.error(`Audit logging failed: ${governed.operatorMessage}`);
  });

  return result;
  },
  { requireWorkspace: true }
);
