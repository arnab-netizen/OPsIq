import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { UnauthorizedError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { runScenario } from "@/services/scenario/engine";
import { resolveServerRole } from "@/services/auth/server-role";
import { getSession } from "@/services/auth";
import { logAuditEvent } from "@/services/audit/audit-log";
import { randomUUID } from "crypto";

export const POST = withEnforcementFull(async (request: NextRequest) => {
  // Enforce server-side auth (scenario analysis affects decisions)
  const role = await resolveServerRole();
  if (!role) {
    throw new UnauthorizedError("Unauthorized");
  }

  // Get actor ID for audit
  const { session } = await withAuth();
  const actorId = session?.user.id ?? null;

  const body = await request.json();
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
});
