/**
 * Debug Endpoint: Engagements Prisma Error Diagnostics
 *
 * Temporary diagnostic endpoint for surfacing Prisma errors from listEngagements.
 * Only accessible with OPSIQ_DIAGNOSTIC_KEY.
 * Used to debug error propagation without modifying production smoke test.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractSafePrismaError } from "@/infra/classified-error";
import { logger } from "@/infra/logger";

const DIAGNOSTIC_KEY = process.env.OPSIQ_DIAGNOSTIC_KEY;

export const GET = async (req: NextRequest) => {
  // Verify diagnostic key
  const providedKey =
    req.headers.get("x-diagnostic-key") ||
    new URL(req.url).searchParams.get("diagnostic_key");

  if (!DIAGNOSTIC_KEY || !providedKey || providedKey !== DIAGNOSTIC_KEY) {
    return NextResponse.json(
      { error: "Unauthorized: invalid or missing diagnostic key" },
      { status: 401 }
    );
  }

  const workspaceId = "demo"; // Use demo workspace for testing

  try {
    logger.info("debug-engagements-prisma: attempting listEngagements", {
      workspaceId,
    });

    // Attempt the exact same query path as listEngagements service
    const where = {
      workspaceId,
      visibility: "client_visible",
    };

    const engagementListSelect = {
      id: true,
      code: true,
      title: true,
      status: true,
      healthStatus: true,
      interventionMode: true,
      serviceTier: true,
      createdAt: true,
      clientAccount: { select: { id: true, name: true } },
    } as const;

    // Try findMany
    let findManyError: any = null;
    try {
      await db.engagement.findMany({
        where,
        select: engagementListSelect,
        orderBy: { createdAt: "desc" },
        take: 25,
        skip: 0,
      });
    } catch (error) {
      findManyError = error;
    }

    // Try count
    let countError: any = null;
    try {
      await db.engagement.count({ where });
    } catch (error) {
      countError = error;
    }

    // If no errors, return success
    if (!findManyError && !countError) {
      return NextResponse.json({
        status: "success",
        message: "Both findMany and count succeeded",
        serviceVersion: "engagements-service-prisma-debug-v1",
      });
    }

    // Extract safe details from whichever error occurred
    const error = findManyError || countError;
    const failingOperation = findManyError ? "engagement.findMany" : "engagement.count";
    const safeDetails = extractSafePrismaError(error);

    logger.error("debug-engagements-prisma: error occurred", {
      failingOperation,
      errorName: error instanceof Error ? error.name : "unknown",
      errorMessage: error instanceof Error ? error.message : String(error),
      ...safeDetails,
    });

    // Return diagnostic response
    return NextResponse.json({
      status: "error",
      failingOperation,
      errorName: error instanceof Error ? error.name : "unknown",
      errorMessage: error instanceof Error ? error.message.split("\n")[0] : String(error),
      prismaCode: safeDetails.prismaCode || null,
      safeMessage: safeDetails.safeMessage || null,
      classification: findManyError ? "engagements_find_many_failed" : "engagements_count_failed",
      stage: findManyError ? "find_many" : "count",
      serviceVersion: "engagements-service-prisma-debug-v1",
    });
  } catch (error) {
    logger.error("debug-engagements-prisma: unexpected error", {
      errorName: error instanceof Error ? error.name : "unknown",
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        status: "error",
        errorName: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
};
