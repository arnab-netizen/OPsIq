# Microsoft Clarity on public pages — privacy boundary

Status: implemented on the branch, **not deployed**. Project `Opsiq Solutions` (`ymoglnln74`, domain `opsiq.solutions`);
dashboard masking is **Strict** (configured in the Clarity dashboard; deliberately not duplicated or weakened in code).
Vercel Web Analytics is unchanged and independent of this choice.

## Three gates, all fail closed

| Gate | Rule | Where |
|------|------|-------|
| Configuration | `NEXT_PUBLIC_CLARITY_PROJECT_ID` matches `^[a-z0-9]{6,16}$` **and** `VERCEL_ENV=production`. Missing / empty / malformed / preview / local ⇒ nothing is mounted and the CSP is unchanged. | `resolveClarityProjectId`, `next.config.ts` |
| Route | Allowlist only: `/`, `/about`, `/resources`, `/resources/*`, `/tools/*`, `/privacy`, `/terms`, `/beta`. Unknown route ⇒ deny. An independent explicit forbidden list (`/login`, `/signup`, `/owner`, `/admin`, `/dashboard`, `/api`, `/auth`, …) wins over the allowlist. Dot segments, encoded `.`/`/`/`\`, empty segments, control characters and protocol-relative forms are denied. | `isClarityEligiblePath` |
| Consent | Explicit opt-in. `localStorage["opsiq_analytics_consent_v1"]` must be exactly `granted`; no value, `denied` or anything malformed ⇒ no load. Only that string is stored — no identity, no business data. | `parseAnalyticsConsent`, `ClarityConsent` |

On consent the loader (Microsoft's published stub; `https://www.clarity.ms/tag/<id>`) is added and the **first queued command** is
`clarity("consentv2", { analytics_Storage: "granted", ad_Storage: "denied" })`. No Identify API, no custom tags or events, no
`data-clarity-*` attributes anywhere (enforced by `clarity-privacy-governance.test.ts`).

## Why the boundary is the document

Clarity has no supported stop API, and App Router soft navigation keeps one document alive: a Clarity runtime loaded on a public
page would survive a client-side transition into `/login` or the signed-in app. So the runtime is destroyed by ending the document:

1. **Links.** `PublicLink` renders a plain anchor (full-document load) for every in-app target that is not Clarity-eligible, and a
   client-side `Link` otherwise. It is used by every in-app link on the public surface, including markdown links in resources.
2. **`/` is also a full-document target.** The homepage server-redirects a *signed-in* visitor into the private app; a soft link to
   it could carry the router through that redirect inside the Clarity document. (`SERVER_REDIRECTING_PUBLIC_PATHS`.) Any new public
   page that redirects must be declared there (a governance test fails otherwise).
3. **Click guard.** While Clarity is loaded, a capture-phase click handler turns any remaining in-app link to a non-eligible target
   into a full-document navigation before the router sees it.
4. **Backstop.** If a document that loaded Clarity ever lands on a non-eligible pathname, it replaces itself (reload).
5. **Withdrawal.** Choosing *Decline* persists `denied`, clears the `_clck`/`_clsk` first-party cookies best-effort, and reloads the
   document if Clarity was running (also when the change comes from another tab).

## CSP

Base policy unchanged for every route. When (and only when) Clarity is configured, a later `headers()` rule replaces **only**
`Content-Security-Policy` on the public paths, adding exactly `https://www.clarity.ms` and `https://scripts.clarity.ms` to
`script-src` (no wildcard). Next applies the last matching rule for a header key; this was verified on a real production server
(public pages carry the two origins, `/login`, `/signup`, `/owner/*`, `/admin`, `/dashboard`, `/api/*` do not).
`connect-src 'self' https:` already permits Clarity's collection endpoint, so it is not changed.

## Preferences

A banner (equal-weight *Allow analytics* / *Decline*, no pre-selection) appears on eligible public pages until a choice exists.
Afterwards every eligible page shows a small persistent **Analytics preferences** control; `/privacy#analytics` has an inline one.

## Post-deploy verification (could NOT be verified from the build sandbox)

The sandbox cannot reach `clarity.ms`, so these are confirmed on the first real consented visit, then closed out:

1. Browser console on a consented public page: **no CSP violation**. If Clarity loads a further script/host (the tag is known to
   load a runtime from `scripts.clarity.ms`; the exact current hosts could not be fetched here), the CSP *fails closed* — nothing is
   recorded — and the missing origin must be added deliberately, never as a wildcard.
2. First recording in the Clarity dashboard: confirm **Strict masking** actually masks text and form input, including the beta-request
   form and the calculator fields (business figures typed by visitors). This is the single control for that; the code adds none.
3. `clarity.ms` requests = 0 on `/login` and every signed-in page (the browser spec asserts this against a build; repeat once in production).
4. Counsel review of `/privacy` (the page states it has not been legally reviewed). The Strict-masking and cookie statements describe
   Microsoft's behaviour and should be checked against Microsoft's current documentation.

## Known residuals

- A signed-in owner who visits a *public* page (e.g. `/about`) is on a public page; if they have consented, Clarity runs there until
  they leave. It never runs on any signed-in product page.
- The production deployment can also be reached on Vercel alias hostnames; there is no hostname check in code (Clarity's project is
  bound to `opsiq.solutions`).
- The consent component is bundled with the root layout, so its (inert) code is downloaded on every page; it loads nothing and renders
  nothing on non-eligible routes.

## Tests

`src/__tests__/analytics/*` (policy, consent/loader, links, privacy copy, repo-wide governance scans),
`src/__tests__/security/clarity-csp.test.ts`, and the opt-in real-browser spec `tests/browser/clarity-privacy-boundary.spec.ts`
(run with `CLARITY_E2E=1` against a production build started with `VERCEL_ENV=production` and the project id).
