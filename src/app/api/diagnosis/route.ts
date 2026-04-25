import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { diagnoseBusiness, validateBusinessProblem } from "@/services/diagnosis";
import { parseRequestBody } from "@/lib/validation";
import { z } from "zod/v4";

const diagnosisSchema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  businessType: z.string().min(1, "Business type is required"),
  problemStatement: z.string().min(1, "Problem statement is required"),
  mainIssue: z.enum([
    "low_sales",
    "high_costs",
    "cash_flow",
    "customer_retention",
    "operations",
    "unclear",
  ]),
  monthlyRevenue: z.number().min(0).optional(),
  monthlyCosts: z.number().min(0).optional(),
  customerCount: z.number().min(0).optional(),
});

export const POST = withRequestContext(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_CREATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, diagnosisSchema);

  try {
    validateBusinessProblem(body);
    const result = await diagnoseBusiness(body, session.user.id);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Diagnosis failed";
    if (message.includes("required")) {
      return Response.json({ error: { message } }, { status: 400 });
    }
    throw error;
  }
});
