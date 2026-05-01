import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { generateReport } from "@/services/report/engine";
import type { NextRequest } from "next/server";

export const GET = withRequestContext(async (request) => {
  try {
    await withAuth({ capability: CAPABILITIES.SYSTEM_VIEW_AUDIT, internalOnly: true });

    const nextRequest = request as NextRequest;
    const workspaceId = nextRequest.headers.get("x-workspace-id");
    if (!workspaceId) {
      return Response.json(
        { error: "Workspace ID required (x-workspace-id header)" },
        { status: 400 }
      );
    }

    const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
    if (!membership) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const report = await generateReport(workspaceId);
    return Response.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
});
