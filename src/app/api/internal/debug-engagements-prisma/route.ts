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
import { listEngagements } from "@/services/engagement";
import { verifyDiagnosticKeyFromRequest } from "@/lib/security/diagnostic-key";

const ROUTE_VERSION = "engagements-route-debug-v1";
const SERVICE_IMPORT_PATH = "@/services/engagement";

export const GET = async (req: NextRequest) => {
  // Verify diagnostic key using timing-safe comparison
  if (!verifyDiagnosticKeyFromRequest(req)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 404 }
    );
  }

  const workspaceId = "demo"; // Use demo workspace for testing

  try {
    logger.info("debug-engagements-prisma: attempting listEngagements", {
      workspaceId,
    });

    // Call the exact same listEngagements function as the route
    const result = await listEngagements(
      workspaceId,
      { limit: 25, offset: 0 },
      false
    );

    return NextResponse.json({
      status: "success",
      message: "listEngagements succeeded",
      routeVersion: ROUTE_VERSION,
      serviceImportPath: SERVICE_IMPORT_PATH,
      serviceVersion: result._engagementsServiceVersion,
      engagementCount: result.engagements.length,
      totalCount: result.total,
    });
  } catch (error) {
    // Extract safe details from error
    const safeDetails = extractSafePrismaError(error);
    const errorMsg = error instanceof Error ? error.message : String(error);

    logger.error("debug-engagements-prisma: error occurred", {
      errorName: error instanceof Error ? error.name : "unknown",
      errorMessage: errorMsg,
      ...safeDetails,
    });

    // Check if error is a ClassifiedApiError with safeDetails
    const classifiedError = error as any;
    const hasServiceVersion = classifiedError.safeDetails?.engagementsServiceVersion;
    const hasRouteVersion = classifiedError.safeDetails?.routeVersion;

    return NextResponse.json({
      status: "error",
      errorName: error instanceof Error ? error.name : "unknown",
      errorMessage: errorMsg.split("\n")[0],
      classification: classifiedError.classification || "unknown",
      stage: classifiedError.stage || "unknown",
      prismaCode: safeDetails.prismaCode || null,
      safeMessage: safeDetails.safeMessage || null,
      failingOperation: classifiedError.safeDetails?.failingOperation || null,
      routeVersion: classifiedError.safeDetails?.routeVersion || ROUTE_VERSION,
      serviceImportPath: SERVICE_IMPORT_PATH,
      serviceVersion: classifiedError.safeDetails?.engagementsServiceVersion || "NOT_INCLUDED",
      handlerName: classifiedError.safeDetails?.handlerName || "unknown",
      callsActualListEngagements: true,
    });
  }
};
