import { NextRequest, NextResponse } from "next/server";
import { runScenario } from "@/services/scenario/engine";
import { resolveServerRole } from "@/services/auth/server-role";
import { getSession } from "@/services/auth";
import { logAuditEvent } from "@/services/audit/audit-log";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    // Enforce server-side auth (scenario analysis affects decisions)
    const role = await resolveServerRole();
    if (!role) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Get actor ID for audit
    const session = await getSession();
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
      return NextResponse.json(
        {
          error:
            "Invalid input: baseRevenue, baseCost, deltaRevenue, deltaCost must be numbers",
        },
        { status: 400 }
      );
    }

    const result = runScenario({
      baseRevenue,
      baseCost,
      deltaRevenue,
      deltaCost,
    });

    // Log audit event for scenario analysis (fail-closed if audit fails)
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
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
