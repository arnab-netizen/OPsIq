/**
 * Root Middleware: Startup Gate
 *
 * Reads durable startup status from database.
 * Blocks protected routes until startup complete.
 * This is a Next.js middleware that runs for every request.
 */

import { NextRequest, NextResponse } from "next/server";
import { getStartupStatus } from "@/services/startup-status";

export async function middleware(request: NextRequest) {
  const pathname = new URL(request.url).pathname;

  // Allow health/readiness/startup probes even before startup
  const allowedProbes = [
    "/api/health",
    "/api/readiness",
    "/api/liveness",
    "/api/startup",
  ];

  // Allow public routes (login, signup, public content) even before startup
  const allowedPublic = [
    "/login",
    "/auth",
    "/api/auth",
    "/public",
  ];

  const isProbe = allowedProbes.includes(pathname);
  const isPublic = allowedPublic.some(p => pathname.startsWith(p));

  if (isProbe || isPublic) {
    return NextResponse.next();
  }

  // For protected/API routes, check durable startup status
  try {
    const status = await getStartupStatus();

    if (status.status !== "READY") {
      console.warn(`[MIDDLEWARE] Blocking ${pathname}: status=${status.status}`, {
        error: status.error,
      });
      return NextResponse.json(
        {
          error: "SERVICE_UNAVAILABLE",
          message: "Application starting up",
          details: status.error || `Status: ${status.status}`,
        },
        { status: 503 }
      );
    }
  } catch (error) {
    // If we can't read status, fail closed
    console.error(`[MIDDLEWARE] Failed to read startup status for ${pathname}`, { error });
    return NextResponse.json(
      {
        error: "SERVICE_UNAVAILABLE",
        message: "Unable to verify startup status",
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
