/**
 * GET/POST /api/admin/platform-settings
 *
 * GET returns the current effective settings (DB-authoritative once
 * bootstrap has run, legacy fallback otherwise). POST updates admission
 * mode and/or capacity — race-safe (shared advisory lock with signup),
 * audited, bounded by the absolute ceiling, refuses a capacity below
 * current usage. Gated on BETA_PROGRAM_MANAGE.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { readEffectiveSettings, updatePlatformSettings, ADMISSION_MODES } from "@/services/beta/platform-settings.service";
import { ValidationError } from "@/infra/errors";
import { parseRequestBody } from "@/lib/validation";
import { z } from "zod/v4";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";

export const GET = withCanonicalEnforcement(
  async () => {
    return readEffectiveSettings();
  },
  { requireCapabilities: [CAPABILITIES.BETA_PROGRAM_MANAGE] }
);

const updateSchema = z.object({
  admissionMode: z.enum(ADMISSION_MODES).optional(),
  capacityLimit: z.number().int().positive().optional(),
  reason: z.string().trim().max(500).optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, updateSchema);

    const idempotencyKey = ctx.request!.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return canonicalJson({ error: "idempotency-key header required" }, { status: 400 });
    }
    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "updatePlatformSettings",
      actorId: ctx.verifiedActorId,
      payload: body,
    });
    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return canonicalJson(idempotencyCheck.cachedResponse.body, { status: idempotencyCheck.cachedResponse.status });
    }

    try {
      const result = await updatePlatformSettings({ ...body, actorId: ctx.verifiedActorId });
      await recordIdempotencyResponse(idempotencyKey, 200, result as unknown as Record<string, unknown>);
      return canonicalJson(result, { status: 200 });
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      if (error instanceof ValidationError) {
        // error.message on a ValidationError is hand-written at each throw
        // site in platform-settings.service.ts specifically to be
        // owner-safe (e.g. capacity-below-current-usage, ceiling-exceeded)
        // -- never raw Prisma/stack text.
        const ownerSafeDetail = error.message;
        return canonicalJson({ error: ownerSafeDetail }, { status: 400 });
      }
      throw error;
    }
  },
  { requireCapabilities: [CAPABILITIES.BETA_PROGRAM_MANAGE] }
);
