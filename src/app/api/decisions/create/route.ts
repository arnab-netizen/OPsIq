import { NextRequest, NextResponse } from "next/server";
import {
  createDecision,
  createDecisionsBulk,
  parseCSV,
} from "@/services/decisions/decision-creation-service";
import { logger } from "@/infra/logger";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // Get workspace and user from request context
    const workspaceId = request.headers.get("x-workspace-id");
    const userId = request.headers.get("x-user-id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID is required (x-workspace-id header)" },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required (x-user-id header)" },
        { status: 400 }
      );
    }

    // Handle JSON request (single decision)
    if (contentType.includes("application/json")) {
      const body = await request.json();

      if (body.decisions && Array.isArray(body.decisions)) {
        // Bulk creation via JSON
        const decisions = body.decisions.map((d: any) => ({
          ...d,
          workspaceId,
          userId,
        }));

        const result = await createDecisionsBulk({ decisions });

        logger.info("Bulk decisions created via API", {
          workspaceId,
          userId,
          count: result.summary.succeeded,
        });

        return NextResponse.json(result, { status: 201 });
      } else {
        // Single decision creation
        const { title, type, impact, confidence, problemType, expectedOutcome } =
          body;

        const decision = await createDecision({
          title,
          type,
          impact,
          confidence,
          workspaceId,
          userId,
          problemType,
          expectedOutcome,
        });

        logger.info("Decision created via API", {
          decisionId: decision.id,
          workspaceId,
          userId,
        });

        return NextResponse.json(decision, { status: 201 });
      }
    }

    // Handle FormData request (CSV upload)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File;

      if (!file) {
        return NextResponse.json(
          { error: "CSV file is required" },
          { status: 400 }
        );
      }

      const csvContent = await file.text();

      try {
        const decisions = parseCSV(csvContent, workspaceId, userId);
        const result = await createDecisionsBulk({ decisions });

        logger.info("Bulk decisions created via CSV upload", {
          workspaceId,
          userId,
          fileName: file.name,
          count: result.summary.succeeded,
        });

        return NextResponse.json(result, { status: 201 });
      } catch (parseError) {
        return NextResponse.json(
          {
            error: "CSV parsing failed",
            details: parseError instanceof Error ? parseError.message : String(parseError),
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Unsupported content type" },
      { status: 415 }
    );
  } catch (error) {
    logger.error("Decision creation API error", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        error: "Failed to create decision(s)",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
