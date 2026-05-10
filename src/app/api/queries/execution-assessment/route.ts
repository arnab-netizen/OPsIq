import { withAuth } from "@/lib/auth-guard";
import { withRequestContext } from "@/lib/api-handler";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { executionAssessmentResolver } from "@/graphql/resolvers/execution-assessment.resolver";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";

const querySchema = z.object({
  engagementId: z.string().uuid("Invalid engagement ID"),
  decisionId: z.string().uuid("Invalid decision ID"),
});

/**
 * GET /api/queries/execution-assessment
 *
 * Phase 7 Execution Assessment Query
 * Wires executionAssessmentResolver.Query.executionAssessment
 *
 * Query Parameters:
 * - engagementId: UUID of the engagement
 * - decisionId: UUID of the decision
 *
 * Returns: ExecutionAssessmentDTO
 */
export const GET = withRequestContext(async (request) => {
  // Auth check
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_VIEW,
  });

  // Validate workspace membership
  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    // Parse and validate query parameters
    const searchParams = nextRequest.nextUrl.searchParams;
    const engagementId = searchParams.get("engagementId");
    const decisionId = searchParams.get("decisionId");

    const parsed = querySchema.parse({ engagementId, decisionId });

    // Call resolver with context
    const result = await executionAssessmentResolver.Query.executionAssessment(
      null,
      {
        engagementId: parsed.engagementId,
        decisionId: parsed.decisionId,
      },
      {
        userId: session.user.id,
        workspaceId: workspaceId,
      }
    );

    return Response.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return Response.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
