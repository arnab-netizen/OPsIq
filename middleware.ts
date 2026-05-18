/**
 * Root Middleware: Lightweight Routing
 *
 * ZERO Node.js imports - Edge Runtime safe.
 * Only routes requests. Does NOT check readiness.
 * Readiness enforcement belongs in Node handlers.
 */

import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const pathname = new URL(request.url).pathname;

  // Public routes that are always allowed (no checks needed)
  const alwaysAllow = [
    "/login",
    "/auth",
    "/api/auth",
    "/api/health",
    "/api/readiness",
    "/api/liveness",
    "/api/startup",
    "/_next",
    "/public",
    "/favicon.ico"
  ];

  // Check if this is a public route
  const isPublic = alwaysAllow.some(allowed => pathname.startsWith(allowed));

  if (isPublic) {
    // Public routes pass through without checks
    return NextResponse.next();
  }

  // Protected routes pass through to handlers
  // Handlers will check readiness and auth
  return NextResponse.next();
}

// Apply middleware to all routes
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - Static files (_next/static)
     * - Image optimization (_next/image)
     * - Favicon
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
