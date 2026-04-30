import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/services/auth";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { getControlSurface } from "@/services/control/control-surface.service";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const workspaceIdParam = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceIdParam) {
      return NextResponse.json(
        { error: "Workspace ID required" },
        { status: 400 }
      );
    }

    const membership = await enforceWorkspaceScoping(request, workspaceIdParam);
    if (!membership) {
      return NextResponse.json(
        { error: "Unauthorized or invalid workspace" },
        { status: 403 }
      );
    }

    const workspaceId = workspaceIdParam;
    const surface = await getControlSurface(workspaceId);

    return NextResponse.json(surface);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to fetch daily control: ${message}`);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
