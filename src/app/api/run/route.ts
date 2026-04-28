import { NextRequest, NextResponse } from "next/server";
import { runSystem } from "@/services/system/run";
import { createBaseline } from "@/services/onboarding/basic";
import { generateOperatorItems } from "@/services/operator/generate";
import { addItems } from "@/services/operator/store";
import { resolveServerRole } from "@/services/auth/server-role";
import { getSession } from "@/services/auth";
import { canEdit } from "@/services/auth/access";
import { logAuditEvent } from "@/services/audit/audit-log";

export async function POST(request: NextRequest) {
  try {
    // Enforce server-side auth
    const role = await resolveServerRole();
    if (!role) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    if (!canEdit(role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // 1. Parse body
    const body = await request.json();
    const { revenue, cost } = body;

    // Validate input types
    if (typeof revenue !== "number" || typeof cost !== "number") {
      return NextResponse.json(
        { error: "Invalid input: revenue and cost must be numbers" },
        { status: 400 }
      );
    }

    // 2. Create baseline using onboarding service
    const baseline = createBaseline(revenue, cost);

    // 3. Build inputMetrics
    const inputMetrics: Record<string, number> = {
      baselineRevenue: revenue,
      baselineCost: cost,
      revenueChange: revenue * 0.1,
      costChange: cost * 0.05,
      confidence: 0.75,
      risk: 5,
    };

    // 4. Call runSystem
    const result = runSystem(inputMetrics);

    // 5. Generate operator items and store them
    const operatorItems = generateOperatorItems(result.decisions, result.impact);

    // Get actor ID for audit
    const session = await getSession();
    const actorId = session?.user.id ?? null;

    await addItems(operatorItems);

    // Log audit event for each operator item created (fail-closed if audit fails)
    for (const item of operatorItems) {
      await logAuditEvent({
        eventName: "CREATE",
        entityType: "OperatorItem",
        entityId: item.id,
        actorId,
        role,
        before: null,
        after: item,
        metadata: {
          source: "run_system",
          impact: result.impact,
        },
      });
    }

    // 6. Return JSON
    return NextResponse.json({
      decisions: result.decisions,
      impact: result.impact,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
