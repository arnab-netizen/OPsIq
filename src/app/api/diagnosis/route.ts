/**
 * POST /api/diagnosis — consultant quick-intake diagnosis (ENGAGEMENT_CREATE).
 *
 * Creates a governed consulting engagement and returns the evidence-grounded answer
 * (src/domain/generic-diagnosis/answer.ts). This is a consultant tool: self-serve owners do not
 * hold ENGAGEMENT_CREATE and use their Owner diagnosis instead; the /diagnosis page applies the
 * same capability check so page visibility and API permission always agree.
 *
 * Errors propagate to withCanonicalEnforcement, which returns the real status (400/403/404/409/
 * 5xx) with an owner-safe message; nothing raw (stack, SQL, Prisma metadata) is returned.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { diagnoseBusiness, validateBusinessProblem, MAX_DIAGNOSIS_FIGURE } from "@/services/diagnosis";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { canonicalJson } from "@/lib/canonical-json-response";
import { BadRequestError, ConflictError } from "@/infra/errors";
import { GENERIC_DIAGNOSIS_MAIN_ISSUES } from "@/domain/generic-diagnosis/answer";
import { z } from "zod/v4";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Optional figures: omitted = not known (never coerced to 0); 0 = reported as zero.
const diagnosisSchema = z.object({
  businessName: z.string().trim().min(1, "Business name is required").max(200),
  businessType: z.string().trim().min(1, "Business type is required").max(200),
  problemStatement: z.string().trim().min(1, "Problem statement is required").max(5000),
  mainIssue: z.enum(GENERIC_DIAGNOSIS_MAIN_ISSUES),
  monthlyRevenue: z.number().finite().min(0).max(MAX_DIAGNOSIS_FIGURE, "Monthly revenue is too large").optional(),
  monthlyCosts: z.number().finite().min(0).max(MAX_DIAGNOSIS_FIGURE, "Monthly costs are too large").optional(),
  customerCount: z.number().int("Customer count must be a whole number").min(0).max(MAX_DIAGNOSIS_FIGURE, "Customer count is too large").optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const rawIdempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!rawIdempotencyKey) {
      throw new BadRequestError("idempotency-key header required");
    }
    const body = await parseRequestBody(ctx.request!, diagnosisSchema);
    // Idempotency records are looked up by key alone, so the key is namespaced to this workspace
    // and actor: another tenant's (or user's) key can never replay or probe this record.
    const idempotencyKey = `diagnosis:${ctx.verifiedWorkspaceId}:${ctx.verifiedActorId}:${rawIdempotencyKey}`;

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "diagnoseBusiness",
      actorId: ctx.verifiedActorId,
      workspaceId: ctx.verifiedWorkspaceId,
      payload: body,
    });
    if (!idempotencyCheck.isNew) {
      if (idempotencyCheck.cachedResponse) {
        return canonicalJson(idempotencyCheck.cachedResponse.body, { status: idempotencyCheck.cachedResponse.status });
      }
      // A previously failed attempt with this key: never silently re-run it.
      throw new ConflictError("This diagnosis request already failed. Submit the form again to retry.");
    }

    try {
      validateBusinessProblem(body);
      const result = await diagnoseBusiness(body, ctx, ctx.verifiedWorkspaceId);
      await recordIdempotencyResponse(idempotencyKey, 201, result as unknown as Record<string, unknown>, ctx.verifiedWorkspaceId);
      return canonicalJson(result, { status: 201 });
    } catch (error) {
      await recordIdempotencyError(
        idempotencyKey,
        error instanceof Error ? error : new Error(String(error)),
        ctx.verifiedWorkspaceId
      ).catch(() => undefined); // never mask the primary error
      throw error;
    }
  },
  {
    requireCapabilities: [CAPABILITIES.ENGAGEMENT_CREATE],
    requireWorkspace: true,
    operationName: "diagnoseBusiness",
  }
);
