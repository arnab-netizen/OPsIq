import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createQuickStartEngagement, QuickStartInput } from "@/services/quick-start/quick-start.service";
import { parseOrThrow } from "@/lib/validation";
import { z } from "zod";
import { logger } from "@/infra/logger";

const quickStartInputSchema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  monthlyRevenueINR: z.number().positive().optional(),
  problems: z.array(z.string().min(1)).min(1, "At least one problem is required"),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withRequestContext(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_CREATE,
  });

  try {
    const body = await request.json();
    const input = parseOrThrow(quickStartInputSchema, body);

    logger.debug("Quick start engagement request", {
      actorId: session.user.id,
      businessName: input.businessName,
      problemCount: input.problems.length,
    });

    const result = await createQuickStartEngagement(input);

    logger.info("Quick start engagement created", {
      actorId: session.user.id,
      clientId: result.clientId,
      engagementId: result.engagementId,
    });

    return Response.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Quick start engagement creation failed", {
      error: message,
      actorId: session.user.id,
    });

    return Response.json(
      {
        success: false,
        error: message,
      },
      { status: 400 }
    );
  }
});
