import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { diagnoseBusiness, validateBusinessProblem } from "@/services/diagnosis";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { canonicalJson } from "@/lib/canonical-json-response";
import { z } from "zod/v4";
import { UnauthorizedError } from "@/infra/errors";
import { verifyDiagnosticKeyFromRequest } from "@/lib/security/diagnostic-key";

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
    const hasDiagnosticAccess = ctx.request ? verifyDiagnosticKeyFromRequest(ctx.request) : false;

    let currentOperation = "parse_request";
    let body: any = {};

    try {
      const idempotencyKey = ctx.request?.headers.get("idempotency-key");
      if (!idempotencyKey) {
        throw new UnauthorizedError("idempotency-key header required");
      }

      body = await parseRequestBody(ctx.request!, diagnosisSchema);

      // Check idempotency with verified workspace and actor context
      currentOperation = "idempotency_check";
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

      currentOperation = "validateBusinessProblem";
      validateBusinessProblem(body);

      currentOperation = "diagnoseBusiness";
      const result = await diagnoseBusiness(body, ctx, workspaceId);

      currentOperation = "idempotency_record_success";
      await recordIdempotencyResponse(idempotencyKey, 201, result as unknown as Record<string, unknown>, workspaceId);

      currentOperation = "response_return";
      return canonicalJson(result, { status: 201 });
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");

      // Always include full error message (sanitize secrets if needed)
      const fullMessage = err.message;
      const sanitizedMessage = fullMessage
        .replace(/postgres:\/\/[^\s]+/g, "postgres://***")
        .replace(/password[=:]\S+/gi, "password=***")
        .replace(/token[=:]\S+/gi, "token=***")
        .replace(/key[=:]\S+/gi, "key=***");

      // Build error response with guaranteed safeMessage
      const errorResponse: any = {
        error: "Diagnosis request failed",
        stage: "handler_invocation",
        classification: "diagnosis_handler_failed",
        errorName: err.name,
        failingOperation: currentOperation,
        safeMessage: sanitizedMessage || "(empty error message)",
      };

      // Extract Prisma-specific details if available
      const errorObj = err as any;
      if (errorObj.code) {
        errorResponse.prismaCode = errorObj.code;
      }
      if (errorObj.meta) {
        errorResponse.prismaMeta = errorObj.meta;
      }
      if (errorObj.clientVersion) {
        errorResponse.prismaClientVersion = errorObj.clientVersion;
      }

      // Try to record idempotency error, but don't let it block error response
      const idempotencyKey = ctx.request?.headers.get("idempotency-key");
      if (idempotencyKey) {
        try {
          currentOperation = "idempotency_record_error";
          await recordIdempotencyError(idempotencyKey, err, workspaceId);
        } catch (idempotencyError) {
          // Log but don't throw - user should see the primary error, not idempotency infrastructure failure
          const idempotencyErr = idempotencyError instanceof Error ? idempotencyError : new Error(String(idempotencyError));
          errorResponse.idempotencyRecordingFailed = {
            errorName: idempotencyErr.name,
            errorMessage: idempotencyErr.message.substring(0, 200),
          };
        }
      }

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
            errorMessage: fullMessage,
            sanitizedMessage: sanitizedMessage,
            prismaCode: errorObj.code || null,
            prismaClientVersion: errorObj.clientVersion || null,
            prismaMeta: errorObj.meta || null,
            failingOperation: currentOperation,
          },
        };
      }

      // Return error response with proper HTTP 500 status (not HTTP 200 with body.status=500)
      return canonicalJson(errorResponse, { status: 500 });
    }
  },
  {
    requireCapabilities: [CAPABILITIES.ENGAGEMENT_CREATE],
  }
);
