import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { diagnoseBusiness, validateBusinessProblem } from "@/services/diagnosis";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
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
  const authContext = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_CREATE,
    internalOnly: true,
  });

  const workspaceId = request.headers.get("x-workspace-id") || "";
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const body = await parseRequestBody(request, diagnosisSchema);

  // Check idempotency
  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "diagnoseBusiness",
    authContext,
    payload: body,
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    validateBusinessProblem(body);
    const result = await diagnoseBusiness(body, authContext, workspaceId);
    await recordIdempotencyResponse(idempotencyKey, 201, result as unknown as Record<string, unknown>);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    const message = err.message || "Diagnosis failed";
    if (message.includes("required")) {
      return Response.json({ error: { message } }, { status: 400 });
    }
    throw error;
  }
});
