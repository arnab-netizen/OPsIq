import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { db } from "@/lib/db";
import { getSession } from "@/services/auth";
import { UnauthorizedError } from "@/infra/errors";

export async function GET(request: NextRequest) {
  try {
    const workspace = await requireWorkspaceContext();
    const session = await getSession();
    const userId = session?.user.id ?? null;

    if (!userId) {
      throw new UnauthorizedError("Authentication required");
    }

    // Get filter from query params
    const status = request.nextUrl.searchParams.get("status");
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "100"), 1000);
    const offset = Math.max(parseInt(request.nextUrl.searchParams.get("offset") || "0"), 0);

    // Build filter
    const where: any = {
      workspaceId: workspace.workspaceId,
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

    return NextResponse.json({
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
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to fetch decisions: ${message}`);

    return NextResponse.json(
      { error: "Failed to fetch decisions", details: message },
      { status: 500 }
    );
  }
}
