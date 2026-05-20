import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getRolesForUser } from "@/services/role-assignment";
import { getMembershipsForUser } from "@/services/engagement-membership";
import { highestRole } from "@/policies/capability-check";
import { hasInternalAccess } from "@/policies/capability-check";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const [roles, memberships] = await Promise.all([
      getRolesForUser(ctx.verifiedActorId, ctx.verifiedWorkspaceId),
      getMembershipsForUser(ctx.verifiedActorId, ctx.verifiedWorkspaceId),
    ]);

    return {
      user: ctx.verifiedActor,
      roles,
      memberships,
      highestRole: ctx.policy ? highestRole(ctx.policy) : null,
      isInternal: ctx.policy ? hasInternalAccess(ctx.policy) : false,
    };
  },
  { requireCapabilities: [CAPABILITIES.USER_VIEW], requireWorkspace: true }
);
