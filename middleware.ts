/**
 * Root Middleware: Startup Gate
 *
 * Blocks all requests until application startup is complete.
 * This is a Next.js middleware that runs for every request.
 */

import { NextRequest, NextResponse } from "next/server";
import { isStartupComplete, getStartupError } from "@/infra/startup-state";

export function middleware(request: NextRequest) {
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
    return NextResponse.next();
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

  return NextResponse.next();
}

// Configure which routes this middleware applies to
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
