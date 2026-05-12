import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { NextRequest } from "next/server";
import {
  createDecision,
  createDecisionsBulk,
  parseCSV,
} from "@/services/decisions/decision-creation-service";
import { logger } from "@/infra/logger";
import { assertCapability } from "@/services/entitlement.service";
import { PlanLimitError } from "@/infra/errors";

export const POST = withRequestContext(async (request) => {
  try {
    // Authenticate + authorize (fail-closed)
    const { session } = await withAuth();

    // Validate workspace membership (fail-closed)
    const nextRequest = request as NextRequest;
    const workspaceId = nextRequest.headers.get("x-workspace-id");
    if (!workspaceId) {
      return Response.json(
        { error: "Workspace ID is required (x-workspace-id header)" },
        { status: 400 }
      );
    }

    const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
    if (!membership) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Check entitlement: decision_create (plan-based quota enforcement)
    const capabilityCheck = await assertCapability(workspaceId, "decision_create");
    if (!capabilityCheck.allowed) {
      throw new PlanLimitError("decision_create", capabilityCheck.reason || "Plan limit exceeded");
    }

    const contentType = request.headers.get("content-type") || "";
    const userId = session.user.id;

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

        return Response.json(result, { status: 201 });
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

        return Response.json(decision, { status: 201 });
      }
    }

    // Handle FormData request (CSV upload)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File;

      if (!file) {
        return Response.json(
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

        return Response.json(result, { status: 201 });
      } catch (parseError) {
        return Response.json(
          {
            error: "CSV parsing failed",
            details: parseError instanceof Error ? parseError.message : String(parseError),
          },
          { status: 400 }
        );
      }
    }

    return Response.json(
      { error: "Unsupported content type" },
      { status: 415 }
    );
  } catch (error) {
    logger.error("Decision creation API error", {
      error: error instanceof Error ? error.message : String(error),
    });

    return Response.json(
      {
        error: "Failed to create decision(s)",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
});
