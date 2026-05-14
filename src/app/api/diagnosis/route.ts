import { withEnforcementFull } from "@/lib/enforced-route";
import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { diagnoseBusiness, validateBusinessProblem } from "@/services/diagnosis";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";

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

export const POST = withEnforcementFull(async (request: NextRequest) => {
  const authContext = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_CREATE,
    internalOnly: true,
  });

  const workspaceId = request.headers.get("x-workspace-id") || "";
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    throw new UnauthorizedError("idempotency-key header required");
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
    return idempotencyCheck.cachedResponse.body;
  }

  try {
    validateBusinessProblem(body);
    const result = await diagnoseBusiness(body, authContext, workspaceId);
    await recordIdempotencyResponse(idempotencyKey, 201, result as unknown as Record<string, unknown>);
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    throw error;
  }
});
