/**
 * Smoke test cleanup endpoint.
 *
 * Removes the deterministic smoke workspace, user, and all their associated data.
 * Enabled ONLY in development and test environments. Returns 404 in production.
 *
 * Authentication: OPSIQ_DIAGNOSTIC_KEY header (same as other internal routes).
 *
 * This endpoint is the cleanup counterpart to smoke scripts that use
 * SMOKE_EMAIL / SMOKE_WORKSPACE_NAME from @/lib/smoke-identity.
 *
 * Safe to call repeatedly — idempotent (NOP if smoke rows don't exist).
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SMOKE_EMAIL } from "@/lib/smoke-identity";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { verifyDiagnosticKeyFromRequest } from "@/lib/security/diagnostic-key";

function isAllowedEnvironment(): boolean {
  const env = process.env.NODE_ENV;
  const vercelEnv = process.env.VERCEL_ENV;
  // Never enabled in production Vercel deployment.
  if (vercelEnv === "production") return false;
  return env === "development" || env === "test";
}

export async function DELETE(request: Request): Promise<NextResponse> {
  if (!isAllowedEnvironment()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!verifyDiagnosticKeyFromRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deleted = { user: 0, workspaces: 0 };

  try {
    // Find smoke user (may not exist if smoke never ran or already cleaned up).
    const smokeUser = await db.user.findUnique({
      where: { email: SMOKE_EMAIL },
      select: { id: true },
    });

    if (!smokeUser) {
      return NextResponse.json({ ok: true, action: "noop", reason: "smoke user not found" });
    }

    // Delete workspace memberships first, then workspaces owned by smoke user.
    const memberships = await db.workspaceMembership.findMany({
      where: { userId: smokeUser.id },
      select: { workspaceId: true },
    });

    for (const m of memberships) {
      // Cascade delete workspace and all its data via Prisma relations.
      await db.workspace.delete({ where: { id: m.workspaceId } }).catch(() => {});
      deleted.workspaces++;
    }

    // Delete the smoke user.
    await db.user.delete({ where: { id: smokeUser.id } }).catch(() => {});
    deleted.user = 1;

    logger.info("Smoke cleanup completed", deleted);
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    const governed = classifyOperatorError(
      err instanceof Error ? err : new Error(String(err)),
      { context: "load" }
    );
    const safeDetail = governed.operatorMessage;
    logger.error("Smoke cleanup error", { error: safeDetail });
    return NextResponse.json({ error: "Cleanup failed", detail: safeDetail }, { status: 500 });
  }
}
