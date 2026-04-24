import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { performDiagnosis } from "@/services/diagnosis";
import { parseRequestBody } from "@/lib/validation";
import { z } from "zod/v4";

const diagnosisSchema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  businessType: z.string().min(1, "Business type is required"),
  problemStatement: z.string().default(""),
  mainIssue: z.string().min(1, "Main issue is required"),
  monthlyRevenue: z.number().optional().refine(
    (val) => !val || val >= 0,
    "Monthly revenue must be non-negative"
  ),
  monthlyCosts: z.number().optional().refine(
    (val) => !val || val >= 0,
    "Monthly costs must be non-negative"
  ),
  customerCount: z.number().int().optional().refine(
    (val) => !val || val >= 0,
    "Customer count must be non-negative"
  ),
});

export type DiagnosisRequest = z.infer<typeof diagnosisSchema>;

export const POST = withRequestContext(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.DIAGNOSIS_RUN,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, diagnosisSchema);
  const result = await performDiagnosis(body, session.user.id);

  return Response.json(result, { status: 200 });
});
