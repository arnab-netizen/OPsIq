import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";

import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createUser, listUsers } from "@/services/user";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { withIdempotency } from "@/infra/idempotency";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import type { NextRequest } from "next/server";

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
    const workspaceId = ctx.verifiedWorkspaceId;

    if (ctx.verifiedActorType !== "service") {
      throw new UnauthorizedError("Internal only");
    }

    const params = parseSearchParams(ctx.request?.url || "", listUsersSchema);
    const result = await listUsers(workspaceId, params);

    return Response.json(result);
  },
  { requireCapabilities: ["USER_VIEW"], requireWorkspace: true }
);

export const POST = withEnforcementFull(async (request: NextRequest) => {
  // Authenticate + authorize (fail-closed)
  const authContext = await withAuth({
    capability: CAPABILITIES.USER_CREATE,
    internalOnly: true,
  });

  // Validate workspace membership (fail-closed)
  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    throw new UnauthorizedError("Workspace ID required (x-workspace-id header)");
  }

  // Require Idempotency-Key (fail-closed)
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey) {
    throw new UnauthorizedError("Idempotency-Key header required");
  }

  const membership = await enforceWorkspaceScoping(request, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  const body = await parseRequestBody(request, createUserSchema);

  const { isNew, result } = await withIdempotency(
    idempotencyKey,
    "user.create",
    async () => {
      const canonicalContext = canonicalizeAuthContext(authContext, workspaceId);
      return createUser(body, canonicalContext, workspaceId);
    },
    body,
    authContext.session.user.id
  );

  return result;
});
