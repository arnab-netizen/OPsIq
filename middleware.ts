/**
 * Root Middleware: Startup Gate
 *
 * Blocks all requests until application startup is complete.
 * This is a Next.js middleware that runs for every request.
 */

import { NextRequest, NextResponse } from "next/server";
import { isStartupComplete, getStartupError } from "@/infra/startup-state";

export function middleware(request: NextRequest) {
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

  // For protected/API routes, require startup to be complete
  const startupComplete = isStartupComplete();
  if (!startupComplete) {
    const error = getStartupError();
    console.warn(`[MIDDLEWARE] Blocking ${pathname}: startup not complete`, {
      startupComplete,
      error: error?.message,
    });
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
