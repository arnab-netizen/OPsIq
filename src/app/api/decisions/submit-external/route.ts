import { NextResponse } from "next/server";

/**
 * SECURITY: This endpoint is DISABLED.
 *
 * CRITICAL VULNERABILITY: This route previously allowed unauthenticated users to:
 * - Submit decisions to any workspace by slug
 * - Create new user accounts and auto-join workspaces
 * - Bypass all authentication and authorization controls
 * - Corrupt data across multi-tenant boundaries
 *
 * STATUS: Endpoint permanently disabled (2026-05-02).
 *
 * If legitimate external decision submission is required, reimplement with:
 * - API key authentication (via headers, not request body)
 * - Workspace mapped from API key, not from request
 * - System actor for decision creation (no user auto-creation)
 * - Signature verification or HMAC authentication
 * - Rate limiting and abuse detection
 * - Audit trail of all submissions
 *
 * See: AUTH_ADVERSARIAL_REPORT.md - CRITICAL VULN #1
 */

export async function POST() {
  return NextResponse.json(
    {
      error: "Endpoint disabled",
      message: "External decision submission is currently disabled due to security constraints",
      details: "Contact system administrator if you need to re-enable with proper authentication",
    },
    { status: 403 }
  );
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Endpoint disabled",
      message: "This endpoint is not available",
    },
    { status: 403 }
  );
}
