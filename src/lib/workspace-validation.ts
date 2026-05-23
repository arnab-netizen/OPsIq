import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/infra/logger";

export function createWorkspaceValidationMiddleware() {
  return async (
    request: NextRequest,
    next: (request: NextRequest) => Promise<NextResponse>
  ): Promise<NextResponse> => {
    // Skip validation for public endpoints
    const publicPaths = [
      "/api/auth/login",
      "/api/auth/logout",
      "/api/health",
      "/api/onboarding",
    ];

    const path = request.nextUrl.pathname;
    if (publicPaths.some((p) => path.startsWith(p))) {
      return next(request);
    }

    // Get workspace ID from headers (format validation only)
    const workspaceId = request.headers.get("x-workspace-id");

    if (!workspaceId) {
      logger.warn("Request missing workspaceId header", { path });
      return NextResponse.json(
        { error: "Workspace ID is required (x-workspace-id header)" },
        { status: 400 }
      );
    }

    // Validate workspace ID format (UUID)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(workspaceId)) {
      logger.warn("Invalid workspaceId format", { workspaceId });
      return NextResponse.json(
        { error: "Invalid workspace ID format" },
        { status: 400 }
      );
    }

    // Add to request headers for use in handlers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-workspace-id-validated", "true");

    const response = await next(
      new NextRequest(request.nextUrl, {
        ...request,
        headers: requestHeaders,
      })
    );

    return response;
  };
}

export function validateWorkspaceId(workspaceId: string | null | undefined): void {
  if (!workspaceId || typeof workspaceId !== "string") {
    throw new Error("Invalid or missing workspace ID");
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(workspaceId)) {
    throw new Error("Workspace ID must be a valid UUID");
  }
}

export function enforceWorkspaceId(
  workspaceId: string | null | undefined,
  operation: string,
  resource: string
): string {
  validateWorkspaceId(workspaceId);
  logger.debug("Workspace enforcement applied", {
    workspaceId,
    operation,
    resource,
  });
  return workspaceId!;
}

/**
 * Query builder helper to ensure workspaceId is always included
 * Usage: withWorkspace(db.operatorItem.findMany, { workspaceId }, { other: filters })
 */
export function withWorkspace<T extends Record<string, unknown>>(
  query: T,
  workspaceId: string,
  whereClause?: Record<string, unknown>
): T {
  validateWorkspaceId(workspaceId);
  return {
    ...query,
    workspaceId,
    ...whereClause,
  } as T;
}
