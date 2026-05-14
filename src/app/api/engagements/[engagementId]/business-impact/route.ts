import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { generateBusinessImpact } from "@/services/business-impact/business-impact.service";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);

    const workspaceId = ctx.request!.headers.get("x-workspace-id") ||
                        ctx.request!.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new Error("Workspace ID required");
    }

    const impact = await generateBusinessImpact(engagementId, ctx.verifiedActorId, workspaceId);

    return {
      success: true,
      data: impact,
    };
  },
  { requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW] }
);