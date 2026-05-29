/**
 * Route Proof Endpoint: Engagements Execution Path Verification
 *
 * Static proof that the exact route and service versions are deployed.
 * Used by smoke tests to verify the correct code path is executing before testing /api/engagements.
 * Protected by OPSIQ_DIAGNOSTIC_KEY.
 * No DB calls. No secrets.
 */

import { NextRequest, NextResponse } from "next/server";
import { ENGAGEMENTS_SERVICE_VERSION } from "@/services/engagement";

const ROUTE_VERSION = "engagements-route-debug-v2";
const SERVICE_IMPORT_PATH = "@/services/engagement";
const HANDLER_NAME = "engagementsGetHandler";

export const GET = async (req: NextRequest) => {
  // Verify diagnostic key
  const providedKey =
    req.headers.get("x-opsiq-diagnostic-key") ||
    new URL(req.url).searchParams.get("key");

  const expectedKey = process.env.OPSIQ_DIAGNOSTIC_KEY;

  if (!expectedKey || !providedKey || providedKey !== expectedKey) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 404 }
    );
  }

  // Return static proof - no DB calls
  return NextResponse.json({
    routeVersion: ROUTE_VERSION,
    serviceImportPath: SERVICE_IMPORT_PATH,
    handlerName: HANDLER_NAME,
    serviceVersion: ENGAGEMENTS_SERVICE_VERSION,
    deployedCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
    environment: process.env.VERCEL_ENV ?? "unknown",
  });
};
