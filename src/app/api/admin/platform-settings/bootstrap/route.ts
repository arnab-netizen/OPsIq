/**
 * GET/POST /api/admin/platform-settings/bootstrap
 *
 * The governed, one-time initialization of the PlatformSetting singleton —
 * see platform-settings-bootstrap.service.ts for the full contract. GET
 * previews the exact values a confirm would capture (read-only, no write).
 * POST performs the actual write, idempotently, and requires an explicit
 * confirmation flag in the body so a client can never trigger it by
 * accident from a GET-shaped action.
 *
 * Gated on BETA_PROGRAM_MANAGE — a new, narrow capability, deliberately NOT
 * added to BETA_REQUEST_OPERATOR's existing bundle (see capability-check.ts).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  previewPlatformSettingsBootstrap,
  confirmPlatformSettingsBootstrap,
} from "@/services/beta/platform-settings-bootstrap.service";
import { parseRequestBody } from "@/lib/validation";
import { z } from "zod/v4";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";

export const GET = withCanonicalEnforcement(
  async () => {
    const preview = await previewPlatformSettingsBootstrap();
    return preview;
  },
  { requireCapabilities: [CAPABILITIES.BETA_PROGRAM_MANAGE] }
);

const confirmSchema = z.object({
  confirm: z.literal(true, "You must explicitly confirm initialization"),
  acknowledgeQaContamination: z.boolean().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const { acknowledgeQaContamination } = await parseRequestBody(ctx.request!, confirmSchema);

    const idempotencyKey = ctx.request!.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return canonicalJson({ error: "idempotency-key header required" }, { status: 400 });
    }
    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "confirmPlatformSettingsBootstrap",
      actorId: ctx.verifiedActorId,
      payload: {},
    });
    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return canonicalJson(idempotencyCheck.cachedResponse.body, { status: idempotencyCheck.cachedResponse.status });
    }

    try {
      const result = await confirmPlatformSettingsBootstrap(ctx.verifiedActorId, { acknowledgeQaContamination });
      await recordIdempotencyResponse(idempotencyKey, 200, result as unknown as Record<string, unknown>);
      return canonicalJson(result, { status: 200 });
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      throw error;
    }
  },
  { requireCapabilities: [CAPABILITIES.BETA_PROGRAM_MANAGE] }
);
