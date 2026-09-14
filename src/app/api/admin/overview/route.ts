/**
 * GET /api/admin/overview
 *
 * Administration overview: beta cohort usage, request-pipeline counts
 * (requested/invited/registered/awaiting-verification/active), and system
 * readiness — reusing existing, reliable data sources only (no new
 * observability platform). Gated on CUSTOMER_ACCESS_MANAGE.
 */
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { readEffectiveSettings, countExternalBetaWorkspaces } from "@/services/beta/platform-settings.service";
import { PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE } from "@/lib/beta";
import { ensureCriticalReadiness } from "@/infra/critical-readiness";

export const GET = withCanonicalEnforcement(
  async () => {
    const settings = await readEffectiveSettings();
    const admittedCount = await countExternalBetaWorkspaces();

    const [requestedCount, invitedCount, revokedCount, rejectedCount] = await Promise.all([
      db.betaRequest.count({ where: { status: "REQUESTED" } }),
      db.betaRequest.count({ where: { status: "INVITED" } }),
      db.betaRequest.count({ where: { status: "REVOKED" } }),
      db.betaRequest.count({ where: { status: "REJECTED" } }),
    ]);

    // "Registered" / "awaiting verification" / "active" are derived from the
    // real account/workspace rows admitted through either external signup
    // path — never denormalized onto BetaRequest.
    const [registeredCount, awaitingVerificationCount, activeCount] = await Promise.all([
      db.user.count({
        where: { workspaceMemberships: { some: { workspace: { signupSource: { in: [PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE] } } } } },
      }),
      db.user.count({
        where: {
          requiresEmailVerification: true,
          emailVerifiedAt: null,
          workspaceMemberships: { some: { workspace: { signupSource: { in: [PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE] } } } },
        },
      }),
      db.user.count({
        where: {
          isActive: true,
          emailVerifiedAt: { not: null },
          workspaceMemberships: { some: { workspace: { signupSource: { in: [PUBLIC_BETA_SIGNUP_SOURCE, CONTROLLED_BETA_SIGNUP_SOURCE] } } } },
        },
      }),
    ]);

    const readinessResult = await ensureCriticalReadiness();
    const readiness = { status: readinessResult.status, checks: readinessResult.checks };

    return {
      capacity: { admitted: admittedCount, limit: settings.capacityLimit, admissionMode: settings.admissionMode, source: settings.source },
      requests: { requested: requestedCount, invited: invitedCount, revoked: revokedCount, rejected: rejectedCount },
      customers: { registered: registeredCount, awaitingVerification: awaitingVerificationCount, active: activeCount },
      readiness,
    };
  },
  { requireCapabilities: [CAPABILITIES.CUSTOMER_ACCESS_MANAGE] }
);
