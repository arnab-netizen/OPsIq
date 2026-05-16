import { withAuth } from "@/lib/auth-guard";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { RevenueEngine } from "@/services/growth/revenue-engine";
import { RevenueStream } from "@/domain/growth/growth-engines";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";

const createStreamSchema = z.object({
  name: z.string().min(1, "Stream name required"),
  basePrice: z.number().positive("Base price must be positive"),
  currency: z.string().length(3, "Currency must be 3-letter code"),
  model: z.string().optional(),
  billingCycle: z.string().optional(),
});

/**
 * POST /api/growth/revenue-streams
 *
 * Create a new revenue stream (workspace-scoped)
 * Wire: RevenueEngine.createRevenueStream()
 */
export const POST = withEnforcementFull(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_UPDATE,
  });

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
    throw new ForbiddenError("Unauthorized");
  }

  try {
    const body = await request.json();
    const validated = createStreamSchema.parse(body);

    const result = RevenueEngine.createRevenueStream(workspaceId, validated as Partial<RevenueStream>);

    if (result.error) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json(result.stream, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

/**
 * GET /api/growth/revenue-streams/health
 *
 * Analyze revenue stream health (requires stream data in body)
 * Wire: RevenueEngine.analyzeStreamHealth()
 */
export const GET = withEnforcementFull(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_VIEW,
  });

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
    throw new ForbiddenError("Unauthorized");
  }

  try {
    // For demo: analyze a sample stream
    // In production: would load actual stream from database
    const sampleStream: RevenueStream = {
      id: "rs-sample",
      workspaceId,
      name: "Sample Stream",
      model: "SUBSCRIPTION" as any,
      billingCycle: "MONTHLY" as any,
      basePrice: 99,
      currency: "USD",
      activationDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const health = RevenueEngine.analyzeStreamHealth(workspaceId, sampleStream);

    return Response.json({
      streamId: sampleStream.id,
      streamName: sampleStream.name,
      health: {
        isHealthy: health.isHealthy,
        score: health.score,
        factors: health.factors,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
