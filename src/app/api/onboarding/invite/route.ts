import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { FeatureDisabledError } from "@/infra/errors";

/**
 * Team invitation has no token/email/redemption lifecycle (see
 * src/services/auth/workspace-invite-policy.ts): it previously granted an
 * immediately-active WorkspaceMembership to a brand-new, passwordless User
 * with no way to ever log in, and sent no invitation email. Disabled
 * fail-closed until a real invite lifecycle (token issuance, email delivery,
 * redemption, password setup) exists — public-beta onboarding must not
 * promise or perform team invitations it cannot complete.
 */
export const POST = withCanonicalEnforcement(
  async () => {
    throw new FeatureDisabledError(
      "Team invitations",
      "the invite lifecycle (token issuance, email delivery, redemption) is not implemented yet"
    );
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_ONBOARD] }
);
