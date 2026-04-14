import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { getRolesForUser } from "@/services/role-assignment";
import { getMembershipsForUser } from "@/services/engagement-membership";
import { highestRole } from "@/policies/capability-check";
import { hasInternalAccess } from "@/policies/capability-check";

export const GET = withRequestContext(async () => {
  const { session, policy } = await withAuth();

  const [roles, memberships] = await Promise.all([
    getRolesForUser(session.user.id),
    getMembershipsForUser(session.user.id),
  ]);

  return Response.json({
    user: session.user,
    roles,
    memberships,
    highestRole: highestRole(policy),
    isInternal: hasInternalAccess(policy),
  });
});
