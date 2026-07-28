/**
 * POST /api/owner/finance/businesses/[businessId]/diagnoses — run a finance
 *      diagnosis from a snapshot (OWNER_MANAGE). body: { snapshotId }
 *      Rate limited: 10 diagnoses per business per hour (in-memory sliding window).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { runFinanceDiagnosisSchema } from "@/domain/owner-finance/validation";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { checkDiagnosisRateLimit } from "@/middleware/rate-limit";
import { checkPgRateLimit } from "@/infra/rate-limiter-pg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);

    const rateCheck = checkDiagnosisRateLimit(params.businessId);
    if (!rateCheck.allowed) {
      const retryAfterSec = rateCheck.retryAfterMs ? Math.ceil(rateCheck.retryAfterMs / 1000) : 3600;
      return canonicalJson(
        { error: "Diagnosis rate limit exceeded. Maximum 10 diagnoses per business per hour." },
        { status: 429, headers: { "retry-after": String(retryAfterSec) } }
      );
    }

    // Distributed PG-backed check (shared across serverless instances — prevents split-brain).
    const pgRateCheck = await checkPgRateLimit(`diag:${params.businessId}`, {
      capacity: 10,
      refillPerSecond: 10 / 3600,
    });
    if (!pgRateCheck.allowed) {
      const retryAfterSec = pgRateCheck.retryAfterSeconds ?? 3600;
      return canonicalJson(
        { error: "Diagnosis rate limit exceeded. Maximum 10 diagnoses per business per hour." },
        { status: 429, headers: { "retry-after": String(retryAfterSec) } }
      );
    }

    const body = await parseRequestBody(ctx.request!, runFinanceDiagnosisSchema);
    const cycle = await runFinanceDiagnosis(
      params.businessId,
      body.snapshotId,
      ctx.verifiedActorId,
      ctx.verifiedWorkspaceId
    );
    return canonicalJson(cycle, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
