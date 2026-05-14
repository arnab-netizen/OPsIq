import { withEnforcementFull } from "@/lib/enforced-route";
import type { NextRequest } from "next/server";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { updateActionStatus } from "@/services/action";
import { parseRequestBody } from "@/lib/validation";
import { assertEngagementAccess } from "@/lib/visibility";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { z } from "zod/v4";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const updateActionSchema = z.object({
  status: z.enum(["open", "in_progress", "completed", "blocked", "deferred"]).optional(),
  blockageReason: z.string().optional(),
  version: z.number().int(),
});

export const PATCH = withEnforcementFull(async (request, context, params) => {
  const workspaceId = request.headers.get("x-workspace-id") || "";
  const { actionId } = params;
  const { session, policy } = await withAuth();
  const body = await parseRequestBody(request, updateActionSchema);

  // Fetch action to verify engagement access
  const action = await db.action.findUnique({
    where: { id: actionId, workspaceId },
    select: { engagementId: true },
  });
  if (!action) throw new NotFoundError("Action", actionId);

  await assertEngagementAccess(session.user.id, action.engagementId, workspaceId);

  const canonicalContext = canonicalizeAuthContext({ session, policy }, workspaceId);
  const updated = await updateActionStatus(actionId, body, canonicalContext, workspaceId);
  return Response.json(updated);
});
