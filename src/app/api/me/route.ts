import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { getRolesForUser } from "@/services/role-assignment";
import { getMembershipsForUser } from "@/services/engagement-membership";
import { highestRole } from "@/policies/capability-check";
import { hasInternalAccess } from "@/policies/capability-check";
import type { NextRequest } from "next/server";

export const GET = withRequestContext(async (request) => {
  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id") || "system";

  const { session, policy } = await withAuth(undefined, workspaceId);

  const [roles, memberships] = await Promise.all([
    getRolesForUser(session.user.id),
    getMembershipsForUser(session.user.id, workspaceId),
  ]);

  return Response.json({
    user: session.user,
    roles,
    memberships,
    highestRole: highestRole(policy),
    isInternal: hasInternalAccess(policy),
  });
});
