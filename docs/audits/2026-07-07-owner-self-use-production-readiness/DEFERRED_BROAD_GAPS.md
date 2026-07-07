# Deferred / Broad Gaps (PASS 44)

## Delivered
A hostile owner-self-use production-readiness audit: a 25-area readiness matrix, a blocker matrix (0 blockers /
6 restrictions), a risk register (10 risks), an owner runbook, a data-entry guide, stop conditions, a test plan,
and a browser readiness spec (`50-owner-self-use-readiness.spec.ts`, 5/5 local) proving the owner journey.
No product source changed.

## Result
`OWNER_SELF_USE_READY_WITH_RESTRICTIONS` — **no blocker**. An owner can sign up → log in → create a business →
enter data via intake → open the cockpit → act with approval/evidence/reassessment gates → and no unsafe/
fabricated output appears. 6 documented restrictions apply.

## Restrictions (work within these; not blockers)
1. **Manual data entry** — structured field-by-field issue entry (`/api/owner/manual-entry`) has no dedicated UI;
   use the Data Intake page (manual form / CSV / paste) + domain snapshot forms.
2. **Production deploy** — no Dockerfile/vercel.json and no runtime env-schema; developer-assisted deploy with
   `NODE_ENV` + `DATABASE_URL` + `NEXT_PUBLIC_APP_URL` + `AUTH_SECRET`.
3. **Workspace selection** — one workspace per signup; no in-app switcher.
4. **Mobile cockpit** — the cockpit page is desktop-tuned (onboarding/intake are responsive).
5. **Support/rollback** — no in-app support surface and no one-click undo; reassessment re-opens decisions and
   governed records aren't destructively deleted.
6. **Post-login navigation** — `/dashboard` doesn't surface the owner section; the owner opens `/owner` (the hub),
   whose sidebar exposes the cockpit link.

## Deferred beyond PASS 44 (candidate future passes, in safe order)
1. A dedicated manual-entry UI form wired to `/api/owner/manual-entry` (removes restriction 1).
2. Deploy manifests (Dockerfile/vercel.json) + a runtime env-schema module (removes restriction 2).
3. A `/dashboard` → owner-section link and/or default owner landing (removes restriction 6).
4. A responsively-tuned cockpit layout (removes restriction 4).
5. Only after the owner has actually used it: a controlled live pilot with real data (its own safety pass).

## Explicitly out of scope (frozen — not started)
Public SaaS, billing, Product Hunt, launch readiness, paid promotion, integrations, Local Mode,
enterprise/compliance, live connectors, LLM/NLP, autonomous browsing/action. This is **owner self-use** readiness,
not public-SaaS readiness — "fully production ready" is NOT claimed.

## Honest limitation
The audit proves the owner CAN self-use OpsIQ safely today **within the 6 restrictions**. It does not claim the
owner can deploy it alone, nor that any real business outcome will result — those are separate, later steps.
