import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ForbiddenError, NotFoundError, AppError } from "@/infra/errors";
import { getFirstValue } from "@/services/first-value.service";

export const GET = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  if (!ctx.request) {
    throw new Error("Request object not available");
  }

  const workspaceId = ctx.verifiedWorkspaceId;

  try {
    const firstValue = await getFirstValue(ctx, workspaceId);

    return firstValue;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Workspace not found")
    ) {
      throw new NotFoundError("Workspace", workspaceId);
    }

    if (error instanceof ForbiddenError) {
      throw error;
    }

    console.error("First-value API error:", error);
    throw new AppError(
      "INTERNAL_ERROR",
      "Internal server error",
      500,
      {
        telemetryClass: "INTERNAL_ERROR",
        auditClass: "INTERNAL_ERROR",
        severity: "HIGH",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: true,
        abuseRelevant: false,
        handlerAllowed: true,
        mutationAllowed: false,
      }
    );
  }
}, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_VIEW] });
