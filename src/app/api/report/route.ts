import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { generateReport } from "@/services/report/engine";
import { UnauthorizedError } from "@/infra/errors";

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
      const classified = classifyOperatorError(error, { context: "load" });
      return Response.json({ error: classified.operatorMessage }, { status: 400 });
    }
  },
  { requireCapabilities: ["SYSTEM_VIEW_AUDIT"], requireWorkspace: true }
);
