import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { ForbiddenError } from "@/infra/errors";
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
export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  const workspaceId = ctx.verifiedWorkspaceId;

  try {
    const body = await (ctx.request as NextRequest).json();
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
}, { requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE], requireWorkspace: true });

/**
 * GET /api/growth/revenue-streams/health
 *
 * Analyze revenue stream health (requires stream data in body)
 * Wire: RevenueEngine.analyzeStreamHealth()
 */
export const GET = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  const workspaceId = ctx.verifiedWorkspaceId;

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
}, { requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW], requireWorkspace: true });
