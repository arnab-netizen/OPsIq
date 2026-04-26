import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { executeWorkflow } from "@/services/execute";
import { parseRequestBody } from "@/lib/validation";
import { IntakeInputSchema } from "@/domain/intake-schema";

export const POST = withRequestContext(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_CREATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, IntakeInputSchema);

  const result = await executeWorkflow(
    {
      clientName: body.clientName,
      problem: body.problemSummary,
      findings: body.findings.map((f) => f.description),
      priority: body.findings.some((f) => f.severity === "critical")
        ? "critical"
        : body.findings.some((f) => f.severity === "high")
          ? "high"
          : "medium",
    },
    session.user.id
  );

  return Response.json(
    {
      ...result,
      intakeMetadata: {
        clientName: body.clientName,
        industry: body.industry,
        revenueImpact: body.revenueImpact,
        timeToFailure: body.timeToFailure,
        findingCategories: body.findings.map((f) => ({
          category: f.category,
          severity: f.severity,
          description: f.description,
        })),
      },
    },
    { status: 200 }
  );
});
