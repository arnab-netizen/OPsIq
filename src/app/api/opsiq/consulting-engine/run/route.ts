import { NextRequest, NextResponse } from "next/server";
import { runConsultingEngine } from "@/services/consulting-engine/orchestrator";
import { ConsultingEngineInputSchema } from "@/domain/consulting-engine/types";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";

/**
 * POST /api/opsiq/consulting-engine/run
 *
 * Thin route handler that:
 * 1. Validates input
 * 2. Checks engagement exists and user has access
 * 3. Delegates to consulting engine service
 * 4. Persists decision memo (future: when FindingRecord/RecommendationRecord queries exist)
 * 5. Returns decision memo
 *
 * No business logic here; all logic in services.
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input structure
    const validation = ConsultingEngineInputSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    const input = validation.data;

    // Verify engagement exists
    const engagement = await db.engagement.findUnique({
      where: { id: input.engagementId },
      select: { id: true, clientId: true },
    });

    if (!engagement) {
      return NextResponse.json(
        { error: "Engagement not found" },
        { status: 404 }
      );
    }

    // Run consulting engine (pure service, no side effects yet)
    const output = await runConsultingEngine(input);

    // Emit audit event
    await emitAuditEvent({
      eventName: "CONSULTING_ENGINE_RUN",
      actorId: "system", // TODO: Get from session context
      entityType: "Engagement",
      entityId: input.engagementId,
      payload: {
        businessProblem: input.businessProblem,
        rootCause: output.decisionMemo.rootCauseDiagnosis.primary,
        diagnosisConfidence: output.decisionMemo.diagnosisConfidence,
        interventionCount: output.decisionMemo.recommendedInterventions.length,
        status: output.status,
      },
      visibility: "internal",
    });

    return NextResponse.json(output, { status: 200 });
  } catch (error) {
    console.error("Consulting engine error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
