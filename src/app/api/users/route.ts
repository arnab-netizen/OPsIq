import { CAPABILITIES } from "@/domain/constants/capabilities";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { createUser, listUsers } from "@/services/user";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { withIdempotency } from "@/infra/idempotency";
import { z } from "zod/v4";
import { paginationSchema, identityEmailSchema } from "@/lib/validation";
import { UnauthorizedError } from "@/infra/errors";

const createUserSchema = z.object({
  email: identityEmailSchema,
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
    const workspaceId = ctx.verifiedWorkspaceId;

    // Access is gated by the USER_VIEW capability declared below (enforced by the
    // canonical wrapper before this handler runs), the same pattern used by the
    // sibling routes GET /api/users/[userId], /roles, and /memberships. There is
    // no actor-type carve-out here: withCanonicalEnforcement never produces a
    // "service" verifiedActorType for an HTTP request (it is always "user" — see
    // canonical-route-enforcement.ts), so a `verifiedActorType !== "service"` guard
    // would reject every real caller, human or otherwise.
    const params = parseSearchParams(ctx.request?.url || "", listUsersSchema);
    const result = await listUsers(workspaceId, params);

    return result;
  },
  { requireCapabilities: [CAPABILITIES.USER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    // Require Idempotency-Key (fail-closed)
    const idempotencyKey = ctx.request?.headers.get("Idempotency-Key");
    if (!idempotencyKey) {
      throw new UnauthorizedError("Idempotency-Key header required");
    }

    const body = await parseRequestBody(ctx.request!, createUserSchema);

    const { isNew: _isNew, result } = await withIdempotency(
      idempotencyKey,
      "user.create",
      async () => createUser(body, ctx, workspaceId),
      body,
      ctx.verifiedActorId
    );

    return result;
  },
  { requireCapabilities: [CAPABILITIES.USER_CREATE], requireWorkspace: true }
);
