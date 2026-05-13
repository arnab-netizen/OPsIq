import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { getRolesForUser } from "@/services/role-assignment";
import { getMembershipsForUser } from "@/services/engagement-membership";
import { highestRole } from "@/policies/capability-check";
import { hasInternalAccess } from "@/policies/capability-check";
import type { NextRequest } from "next/server";

export const GET = withEnforcementFull(async (request: NextRequest) => {
  const workspaceId = request.headers.get("x-workspace-id") || "system";

  const { session, policy } = await withAuth(undefined, workspaceId);

  const [roles, memberships] = await Promise.all([
    getRolesForUser(session.user.id, workspaceId),
    getMembershipsForUser(session.user.id, workspaceId),
  ]);

  return {
    user: session.user,
    roles,
    memberships,
    highestRole: highestRole(policy),
    isInternal: hasInternalAccess(policy),
  };
});
