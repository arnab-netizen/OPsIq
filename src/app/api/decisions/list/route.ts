import { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
import { db } from "@/lib/db";
import { getSession } from "@/services/auth";
import { enforceWorkspaceScoping, hasPermission } from "@/middleware/workspace-enforcement";

export const GET = withEnforcementFull(async (request: NextRequest) => {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");

  if (!workspaceId) {
    throw new Error("Workspace ID required");
  }

  // Enforce workspace scoping
  const membership = await enforceWorkspaceScoping(request, workspaceId);
  if (!membership) {
    throw new Error("Unauthorized or invalid workspace");
  }

  // Check permission to read/view decisions
  if (!hasPermission(membership.role, "read")) {
    throw new Error("Insufficient permissions to view decisions");
  }

  // Get filter from query params
  const status = request.nextUrl.searchParams.get("status");
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "100"), 1000);
  const offset = Math.max(parseInt(request.nextUrl.searchParams.get("offset") || "0"), 0);

  // Build filter
  const where: any = {
    workspaceId,
  };

  if (status && ["pending", "blocked", "approved", "done", "failed"].includes(status)) {
    where.status = status;
  }

  // Fetch decisions
  const decisionsRaw = await db.operatorItem.findMany({
    where,
    select: {
      id: true,
      problem: true,
      action: true,
      impactExpected: true,
      confidence: true,
      status: true,
      blockStage: true,
      blockReason: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
    skip: offset,
  });

  const total = await db.operatorItem.count({ where });

  return {
    decisions: decisionsRaw.map((d: typeof decisionsRaw[0]) => ({
      id: d.id,
      title: d.problem,
      status: d.status,
      impact: d.impactExpected,
      confidence: d.confidence,
      blockStage: d.blockStage,
      blockReason: d.blockReason,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })),
    total,
    limit,
    offset,
  };
});
