# CONTROLLED_OPEN_BETA_AUTHORIZATION — Draft Language (NOT YET AUTHORIZED)

**Status: DRAFT.** This document is prepared language for a future owner
authorization decision. It is not itself an authorization, does not close
Stage 7, does not issue S7-I16, and does not modify
`docs/opsiq/bundles/factory-stage-7-closure.yaml`. No part of this document
takes effect until the owner reviews it, at an exact reviewed commit SHA, and
issues the authorization verbatim — following the same exact-SHA discipline
already established for Stage 7 evidence-subject decisions (D-16, D-17, …).

Until that authorization is issued, `PUBLIC_BETA_ENABLED` remains unset/false
in every environment, and registration stays closed.

---

## Draft authorization text (for the owner to review, edit, and issue verbatim)

```
CONTROLLED_OPEN_BETA_AUTHORIZATION

1. Stage 7 remains OPEN. This authorization is not a Stage 7 closure event,
   does not prove any Stage 7 invariant, and does not issue S7-I16
   (unrestricted private-owner acceptance). factory-stage-7-closure.yaml is
   NOT modified by this authorization.

2. Public self-registration is PERMITTED for the open beta described in
   docs/beta (src/app/beta/page.tsx), scoped exactly as that page and
   src/app/terms/page.tsx and src/app/privacy/page.tsx describe.

3. Billing is DISABLED. No payment method may be required or collected at
   signup. No automatic paid entitlement may be granted. See
   docs/opsiq/status/OPEN_BETA_NO_BILLING_CONFIRMATION.md.

4. No external paying customers are authorized under this decision. Beta
   access is free and remains free until a separate, later, explicit owner
   decision on paid plans.

5. Registration is controlled by a server-side, authoritative kill switch
   (PUBLIC_BETA_ENABLED, see src/lib/beta.ts). The owner retains sole
   authority to set this value in the production environment (Vercel), and
   may disable it at any time without a code change or redeploy.

6. Initial capacity is bounded at PUBLIC_BETA_WORKSPACE_CAP (default 50; see
   src/lib/beta.ts and src/services/auth/beta-cap.ts) beta-tagged workspaces,
   enforced race-safely at signup time. Raising or lowering this cap is a
   configuration change (PUBLIC_BETA_WORKSPACE_CAP env var), not a code
   change, and remains under owner control.

7. Consequential actions inside the product remain owner-approved. Nothing
   in this authorization changes the existing approval/execution boundary
   (S7-I8) — an open-beta user is subject to the exact same governed
   approval flow as any other owner-mode user; open beta widens WHO may
   register, not WHAT a registered user may do unsupervised.

8. A confirmed P0 or P1 security or tenant-isolation issue SUSPENDS new
   signups immediately. The owner (or, on the owner's standing instruction,
   an on-call engineer) sets PUBLIC_BETA_ENABLED=false in production as the
   first response action, before root-causing or fixing the issue. This is a
   kill switch, not a fix — restoring PUBLIC_BETA_ENABLED=true requires the
   owner's separate, subsequent decision that the issue is resolved.

9. This authorization covers registration and account creation only. It
   does not authorize deploying the specific commit that implements it —
   that remains a separate exact-SHA deployment decision, made the same way
   every other production deployment in this repository is authorized.

Owner authorization received verbatim: <PASTE EXACT OWNER TEXT HERE>
Authorized by: <owner>
Authorized date: <date>
Authorized at exact SHA: <git SHA reviewed>
```

---

## What this draft is NOT

- Not a decision. Nothing above takes effect merely by existing in this file.
- Not a Stage 7 amendment. The Stage 7 closure manifest is untouched.
- Not a statement that the open-beta hardening PR is complete, tested, or
  merged. This draft exists independently of that PR's review status.
- Not permission to set `PUBLIC_BETA_ENABLED=true` in production. That
  requires the owner's actual, later, exact-SHA authorization using (or
  amending) the text above.

## Preconditions this draft assumes will be true before it is issued

- The open-beta hardening PR (kill switch, race-safe cap, email
  verification, legal pages + consent capture, internal-route hardening,
  tenant-isolation regression suite, abuse-resistance tests) is merged and
  green in CI at the exact SHA the owner reviews.
- `PUBLIC_BETA_WORKSPACE_CAP`, `RESEND_API_KEY` (or equivalent email
  provider config), and `SENTRY_DSN` are provisioned in the production
  environment the owner intends to open.
- No open P0/P1 finding exists against the reviewed SHA at authorization time.
