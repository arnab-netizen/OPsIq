import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { getRolesForUser } from "@/services/role-assignment";
import { getMembershipsForUser } from "@/services/engagement-membership";
import { highestRole, hasInternalAccess, isSelfServeOwnerContext } from "@/policies/capability-check";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

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
      // The single authoritative "is this a self-serve business owner" check (see
      // isSelfServeOwnerContext's doc comment) — used by /settings to decide whether to show the
      // internal role/capability taxonomy (admin_or_portfolio_manager, "Internal" access type) as
      // this account's PRIMARY identity, which a real human usability test found made an ordinary
      // owner believe they were using an internal/test build. Purely presentational: it changes no
      // authorization and exposes no new data -- roles/memberships are still returned in full below.
      isSelfServeOwner: ctx.policy ? isSelfServeOwnerContext(ctx.policy) : false,
    };
  },
  { requireWorkspace: true }
);
