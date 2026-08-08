import { CAPABILITIES } from "@/domain/constants/capabilities";
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { createClient, listClients } from "@/services/client-account";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";
import { UnauthorizedError } from "@/infra/errors";

const createClientSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  website: z.string().url().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

const listClientsSchema = paginationSchema.extend({
  status: z.string().optional(),
  search: z.string().optional(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const params = parseSearchParams(ctx.request!.url, listClientsSchema);
    const result = await listClients(workspaceId, params);
    return result;
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.CLIENT_VIEW] }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new UnauthorizedError("idempotency-key header required");
    }

    const body = await parseRequestBody(ctx.request!, createClientSchema);

    // Check idempotency
    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "createClient",
      actorId: ctx.verifiedActorId,
      payload: body,
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }

    try {
      const result = await createClient(body, ctx, workspaceId);
      await recordIdempotencyResponse(idempotencyKey, 201, result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      throw error;
    }
  },
  { requireCapabilities: [CAPABILITIES.CLIENT_CREATE], requireWorkspace: true }
);
