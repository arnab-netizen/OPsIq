/**
 * Build Info Endpoint
 *
 * Safe internal endpoint that returns only the deployed commit SHA.
 * Used by CI/CD workflows to detect when Vercel has deployed latest main.
 * No auth required, no secrets exposed.
 */

import { NextRequest, NextResponse } from "next/server";

export const GET = async (req: NextRequest) => {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
    environment: process.env.VERCEL_ENV ?? "unknown",
    timestamp: new Date().toISOString(),
    routeVersion: "build-info-v1",
  });
};
