# Open Beta — No-Billing Confirmation

**BETA_PRICE=FREE** (see `src/lib/beta.ts`, `BETA_PRICE` constant — a single, greppable source of truth).

## What was verified

Direct code inspection of the public self-registration path (`src/app/api/auth/signup/route.ts` and `src/app/signup/page.tsx`) confirms:

- No Stripe, Lemon Squeezy, or any other payment-provider import, call, or reference anywhere on the signup path.
- No payment method, card, or billing field is collected at signup (the request schema is `email`, `password`, `workspaceName`, `acceptTerms`, `acceptPrivacy`, `acceptBetaNotice` — nothing else).
- The `Workspace` model (`prisma/schema.prisma`) carries no subscription tier, plan, or entitlement field that signup (or any code reachable from signup) sets. A newly created open-beta workspace has no billing state of any kind — there is nothing to default to a paid tier, because there is no tier field to default.
- No automatic paid entitlement is granted to a signup-created account or workspace. The only grants signup makes are the `owner` `WorkspaceMembership` role and the `admin_or_portfolio_manager` `UserRoleAssignment` scoped to that one workspace (access-control roles, not billing entitlements).

## Where billing logic DOES exist in this repo (and is untouched by open beta)

Stripe/billing code exists elsewhere in the codebase (webhook handlers, existing subscription models referenced by other flows) for a future paid-plan feature, but none of it is reachable from, or invoked by, the public open-beta signup path added/hardened in this effort. Open beta does not touch, disable, or depend on that code — it simply never calls it.

## Conclusion

Open-beta registration requires no payment method, charges nothing, and grants no automatic paid entitlement. If OpsIQ introduces paid plans in the future, that is a separate, explicit, later decision — beta access does not roll into a paid subscription automatically, and this document should be revisited if that changes.

_Verified as part of the open-beta hardening effort. See also `/beta` and `/terms` (`src/app/beta/page.tsx`, `src/app/terms/page.tsx`), which state the same commitment to the user._
