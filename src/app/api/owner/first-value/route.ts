import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { ForbiddenError } from "@/infra/errors";
import { getFirstValue } from "@/services/first-value.service";

export const GET = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  if (!ctx.request) {
    throw new Error("Request object not available");
  }

  const workspaceId = ctx.verifiedWorkspaceId;

  const membership = await enforceWorkspaceScoping(ctx.request, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  try {
    const firstValue = await getFirstValue(ctx, workspaceId);

    return Response.json(firstValue, { status: 200 });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Workspace not found")
    ) {
      return Response.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    if (error instanceof ForbiddenError) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.error("First-value API error:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
