import { NextRequest, NextResponse } from "next/server";
import { runConsultingPipeline } from "@/services/consulting-engine/pipeline";
import { db } from "@/lib/db";
import { z } from "zod";

/**
 * POST /api/opsiq/consulting-engine/run
 *
 * Integrated pipeline that:
 * 1. Accepts engagementId
 * 2. Loads engagement and validated findings
 * 3. Runs consulting engine
 * 4. Persists recommendations and actions
 * 5. Returns complete results with persisted records
 *
 * No business logic here; all logic in services.
 */

const RequestSchema = z.object({
  engagementId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input structure
    const validation = RequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { engagementId } = validation.data;

    // Verify engagement exists
    const engagement = await db.engagement.findUnique({
      where: { id: engagementId },
      select: { id: true, clientId: true },
    });

    if (!engagement) {
      return NextResponse.json(
        { error: "Engagement not found" },
        { status: 404 }
      );
    }

    // Run consulting pipeline (loads findings, runs engine, persists results)
    const result = await runConsultingPipeline(engagementId, "system");

    // Return appropriate status code based on pipeline result
    const statusCode =
      result.status === "SUCCESS"
        ? 200
        : result.status === "INSUFFICIENT_DATA"
          ? 400
          : 500;

    return NextResponse.json(result, { status: statusCode });
  } catch (error) {
    console.error("Consulting pipeline error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
