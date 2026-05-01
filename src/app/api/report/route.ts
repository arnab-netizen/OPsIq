import { NextRequest, NextResponse } from "next/server";
import { requireAuthForCapability } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { generateReport } from "@/services/report/engine";

export async function GET(request: NextRequest) {
  try {
    // Require authentication + capability (fail-closed)
    await requireAuthForCapability(CAPABILITIES.SYSTEM_VIEW_AUDIT);

    // Require workspace context
    const workspaceIdParam = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceIdParam) {
      return NextResponse.json(
        { error: "Workspace ID required" },
        { status: 400 }
      );
    }

    const membership = await enforceWorkspaceScoping(request, workspaceIdParam);
    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const report = await generateReport();
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
