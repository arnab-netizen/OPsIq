import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { FeatureDisabledError } from "@/infra/errors";

/**
 * Disabled fail-closed. Public signup now owns initial-workspace creation
 * exclusively (one atomic transaction: User, Workspace, WorkspaceMembership,
 * UserRoleAssignment, Session).
 *
 * This route cannot legitimately serve either audience it previously tried
 * to serve:
 *  - An already-onboarded actor (≥1 active WorkspaceMembership) must never
 *    create a second initial workspace here — that was the "Workspace B"
 *    defect this whole workstream exists to close.
 *  - A genuinely zero-workspace actor can never even reach this handler:
 *    `withCanonicalEnforcement`'s workspace-resolution step (STEP 1.5 in
 *    canonical-route-enforcement.ts) unconditionally looks up an active
 *    WorkspaceMembership for the session's user and throws a 403 before the
 *    handler runs at all if none exists — regardless of `requireWorkspace`.
 *    There is no code path through this wrapper for a zero-membership user,
 *    so a self-service "recovery" flow through this endpoint was dead on
 *    arrival. A real recovery mechanism for a legacy zero-workspace account
 *    (if production evidence ever shows one is needed) is a separate,
 *    explicitly-authorized future workstream — not a bypass of canonical
 *    workspace enforcement.
 *
 * Additional-workspace creation as a legitimate authenticated feature would
 * need its own separate, explicitly-authorized surface; this route is not
 * repurposed into one.
 */
export const POST = withCanonicalEnforcement(
  async () => {
    throw new FeatureDisabledError(
      "Workspace creation via onboarding",
      "initial workspace creation now belongs exclusively to signup; additional workspace creation requires a future separately-authorized feature"
    );
  },
  { requireWorkspace: false, requireCapabilities: [CAPABILITIES.OWNER_ONBOARD] }
);
