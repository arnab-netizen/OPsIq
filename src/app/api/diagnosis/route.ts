import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { withEnforcementFull } from "@/lib/enforced-route";
import type { NextRequest } from "next/server";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
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

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const diagnosticKey = ctx.request?.headers.get("x-opsiq-diagnostic-key");
    const expectedDiagnosticKey = process.env.OPSIQ_DIAGNOSTIC_KEY;
    const hasDiagnosticAccess = diagnosticKey && expectedDiagnosticKey && diagnosticKey === expectedDiagnosticKey;

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new UnauthorizedError("idempotency-key header required");
    }

    const body = await parseRequestBody(ctx.request!, diagnosisSchema);

    // Check idempotency with verified workspace and actor context
    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "diagnoseBusiness",
      actorId: ctx.verifiedActorId,
      workspaceId: ctx.verifiedWorkspaceId,
      payload: body,
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }

    try {
      validateBusinessProblem(body);
      const result = await diagnoseBusiness(body, ctx, workspaceId);
      await recordIdempotencyResponse(idempotencyKey, 201, result as unknown as Record<string, unknown>, workspaceId);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err, workspaceId);

      // Build error response
      const errorResponse: any = {
        error: "Diagnosis request failed",
        stage: "handler_invocation",
        classification: "diagnosis_handler_failed",
        errorName: err.name,
        safeMessage: err.message,
      };

      // If diagnostic key is valid, include detailed diagnostic fields
      if (hasDiagnosticAccess) {
        errorResponse.diagnostics = {
          routeWrapper: "withCanonicalEnforcement",
          requireWorkspaceConfigured: false,
          ctxKeys: {
            verifiedActorIdPresent: !!ctx.verifiedActorId,
            verifiedActorType: ctx.verifiedActorType,
            verifiedWorkspaceIdPresent: !!ctx.verifiedWorkspaceId,
            verifiedCapabilitiesPresent: !!(ctx.verifiedCapabilities && ctx.verifiedCapabilities.size > 0),
            requestPresent: !!ctx.request,
            sessionPresent: !!ctx.session,
            policyPresent: !!ctx.policy,
          },
          workspaceIdSource: {
            verifiedWorkspaceIdValue: workspaceId ? `${workspaceId.substring(0, 4)}...${workspaceId.substring(workspaceId.length - 4)}` : null,
            verifiedWorkspaceIdPresent: !!workspaceId,
            verifiedWorkspaceIdType: workspaceId ? typeof workspaceId : "missing",
          },
          actorIdSource: {
            verifiedActorIdValue: ctx.verifiedActorId ? `${ctx.verifiedActorId.substring(0, 4)}...${ctx.verifiedActorId.substring(ctx.verifiedActorId.length - 4)}` : null,
            verifiedActorIdPresent: !!ctx.verifiedActorId,
            verifiedActorIdType: ctx.verifiedActorId ? typeof ctx.verifiedActorId : "missing",
          },
          bodyContext: {
            bodyPresent: !!body,
            bodyHasWorkspaceId: !!(body && "workspaceId" in body),
          },
          diagnosisServiceInputContext: {
            willReceiveBody: !!body,
            willReceiveCtx: !!ctx,
            willReceiveWorkspaceId: !!workspaceId,
            workspaceIdValueWillBePassed: workspaceId ? `${workspaceId.substring(0, 4)}...` : null,
          },
          errorDetails: {
            errorName: err.name,
            errorMessage: err.message,
          },
        };
      }

      // Return error response with 500 status
      return {
        status: 500,
        body: errorResponse,
      };
    }
  },
  {
    requireCapabilities: [CAPABILITIES.ENGAGEMENT_CREATE],
  }
);
