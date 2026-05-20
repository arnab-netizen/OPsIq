import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createUser, listUsers } from "@/services/user";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { withIdempotency } from "@/infra/idempotency";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";
import { UnauthorizedError } from "@/infra/errors";

const createUserSchema = z.object({
  email: z.email(),
  name: z.string().min(1).optional(),
});

const listUsersSchema = paginationSchema.extend({
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  search: z.string().optional(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = nextRequest.headers.get("x-workspace-id");

    if (ctx.verifiedActorType !== "service") {
      throw new UnauthorizedError("Internal only");
    }

    const params = parseSearchParams(ctx.request?.url || "", listUsersSchema);
    const result = await listUsers(workspaceId, params);

    return Response.json(result);
  },
  { requireCapabilities: ["USER_VIEW"], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = nextRequest.headers.get("x-workspace-id");

    // Require Idempotency-Key (fail-closed)
    const idempotencyKey = ctx.request?.headers.get("Idempotency-Key");
    if (!idempotencyKey) {
      throw new UnauthorizedError("Idempotency-Key header required");
    }

    const body = await parseRequestBody(ctx.request!, createUserSchema);

    const { isNew, result } = await withIdempotency(
      idempotencyKey,
      "user.create",
      async () => createUser(body, ctx, workspaceId),
      body,
      ctx.verifiedActorId
    );

    return result;
  },
  { requireCapabilities: ["USER_CREATE"], requireWorkspace: true }
);
