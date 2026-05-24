import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { ForbiddenError } from "@/infra/errors";
import { getWorkspaceSetup, saveWorkspaceSetup } from "@/services/workspace-setup.service";
import type { WorkspaceSetupInputDTO } from "@/lib/workspace-setup/workspace-setup.dto";

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
    const setupState = await getWorkspaceSetup(ctx, workspaceId);
    return Response.json(setupState, { status: 200 });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("not found")
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

    console.error("Workspace setup API error:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  if (!ctx.request) {
    throw new Error("Request object not available");
  }

  const workspaceId = ctx.verifiedWorkspaceId;

  const membership = await enforceWorkspaceScoping(ctx.request, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  try {
    const body = await ctx.request.json();
    const input: WorkspaceSetupInputDTO = body;

    const result = await saveWorkspaceSetup(ctx, workspaceId, input);
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    if (
      error instanceof Error &&
      error.message.includes("not found")
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

    console.error("Workspace setup save error:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

export const PATCH = POST;
