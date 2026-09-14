/**
 * PUBLIC ADMISSION REFUSAL — the one sanctioned way to return a 401/403 from
 * a route listed in PUBLIC_ROUTE_EXEMPTIONS.
 *
 * GOVERNANCE CLASSIFICATION (see scripts/auth-governance-scanner.ts and
 * src/__tests__/security/auth-governance-scanner.test.ts):
 *
 * A PUBLIC_ROUTE_EXEMPTIONS-listed route (e.g. /api/auth/signup,
 * /api/beta-requests — both pre-account, anonymous, no session possible by
 * definition, per their own registered exemption reasons) can refuse a
 * request for a reason that is NOT an identity or workspace/capability
 * decision: registration is closed, this email isn't invited, capacity is
 * full. That is PUBLIC PRODUCT-AVAILABILITY / ADMISSION-STATE state, not
 * AUTHENTICATION/AUTHORIZATION state — and the two must stay distinguishable
 * in audit/telemetry, not collapsed into one bucket:
 *
 * - UnauthorizedError (Layer 1, infra/errors.ts) means "we could not verify
 *   who you are" — every telemetry branch's auditClass is AUTH_FAILED or
 *   worse. A visitor who was never expected to have identity at all does not
 *   belong in that class.
 * - ForbiddenError (Layer 2) means "we know who you are, but not for this
 *   workspace/capability" — auditClass WORKSPACE_ACCESS_DENIED/
 *   CAPABILITY_DENIED. There is no workspace yet for a signup attempt.
 * - withCanonicalEnforcement (canonical-route-enforcement.ts) cannot wrap
 *   either of these routes at all: its CanonicalAuthContext/
 *   ServiceAuthEnvelope mandates a verified actor + workspace as REQUIRED
 *   fields — structurally impossible before an account exists.
 *
 * This function is that route category's equivalent of throwing a governed
 * AppError: one named, reusable, registry-validated primitive instead of an
 * ad-hoc literal. It is NOT a general-purpose response helper and NOT an
 * escape hatch for an authenticated route — misuse is caught at both
 * layers:
 *
 * 1. Runtime (this function): throws if `route` is not registered in
 *    PUBLIC_ROUTE_EXEMPTIONS, in every environment, not just dev/test.
 * 2. Static (auth-governance-scanner.ts): a route.ts file that calls this
 *    function is only clean if the file's OWN derived API path (a) is
 *    registered in PUBLIC_ROUTE_EXEMPTIONS and (b) matches the literal
 *    `route` string argument passed at that call site. A raw
 *    `Response.json(..., { status: 401 | 403 })` literal is still flagged
 *    everywhere, exactly as before — this primitive does not weaken that
 *    rule, it is the one sanctioned, checked way around it.
 *
 * Always pass `route` as an inline string literal at the call site (e.g.
 * `publicAdmissionRefusal("/api/auth/signup", ...)`), never through a
 * variable or expression — the scanner can only statically verify a literal;
 * a variable argument is treated as a violation, not silently ignored.
 */
import { isPublicRouteExempted } from "@/domain/constants/public-route-exemptions";

export function publicAdmissionRefusal(
  route: string,
  body: Record<string, unknown>,
  status: 401 | 403
): Response {
  if (!isPublicRouteExempted(route)) {
    throw new Error(
      `publicAdmissionRefusal() called with route="${route}", which is not listed in ` +
        `PUBLIC_ROUTE_EXEMPTIONS (src/domain/constants/public-route-exemptions.ts). ` +
        `Register the route there with a documented reason first, or — if this really is ` +
        `an identity/workspace/capability decision, not a public product-admission one — ` +
        `use UnauthorizedError/ForbiddenError via withCanonicalEnforcement instead.`
    );
  }
  return Response.json(body, { status });
}
