import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { generateReport } from "@/services/report/engine";
import { UnauthorizedError } from "@/infra/errors";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // Verify internal-only requirement (service actor only)
    if (ctx.verifiedActorType !== "service") {
      throw new UnauthorizedError("This endpoint requires internal-only access");
    }

    try {
      const report = await generateReport();
      return Response.json(report);
    } catch (error) {
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: 'load' });
      return Response.json({ error: governed.operatorMessage }, { status: 400 });
    }
  },
  { requireCapabilities: ["SYSTEM_VIEW_AUDIT"], requireWorkspace: true }
);
