import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { generateReport } from "@/services/report/engine";
import type { NextRequest } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";

export const GET = withEnforcementFull(async (request: NextRequest) => {
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
      throw new ForbiddenError("Unauthorized");
    }

    const report = await generateReport();
    return Response.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
});
