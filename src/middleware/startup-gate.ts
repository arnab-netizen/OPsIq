/**
 * Startup Gate Middleware
 *
 * Blocks all HTTP requests until application startup is complete.
 * Returns 503 Service Unavailable if startup not done.
 */

import { NextRequest, NextResponse } from "next/server";
import { isStartupComplete, getStartupError } from "@/infra/startup-state";

/**
 * Middleware: Block all requests until startup is complete
 */
export function withStartupGate(
  handler: (request: NextRequest) => Promise<NextResponse | Response>
) {
  return async (request: NextRequest): Promise<NextResponse | Response> => {
    // Allow health/readiness/startup probes even before startup
    const pathname = new URL(request.url).pathname;
    const allowedBeforeStartup = [
      "/api/health",
      "/api/readiness",
      "/api/liveness",
      "/api/startup",
    ];

    if (allowedBeforeStartup.includes(pathname)) {
      // Let health checks through
      return handler(request);
    }

    // For all other requests, require startup to be complete
    if (!isStartupComplete()) {
      const error = getStartupError();
      return NextResponse.json(
        {
          error: "SERVICE_UNAVAILABLE",
          message: "Application starting up",
          details: error ? error.message : "Startup checks in progress",
        },
        { status: 503 }
      );
    }

    return handler(request);
  };
}
