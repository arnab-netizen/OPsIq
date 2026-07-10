# Phase 6E — `withAuth` legacy migration plan (do NOT broad-migrate in this PR)

**Date:** 2026-07-10 · Status: PLAN ONLY (no broad migration performed in Phase 6E)

## The concern
`withAuth(options, workspaceId: string = "system")` (`src/lib/auth-guard.ts`) defaults the workspace to
the literal `"system"` when no second argument is passed. Every `withAuth(...)` call site inspected passes
**no** workspace argument:
- ~**68** `withAuth(` call sites across `src` (non-test).
- **0** pass an explicit workspace argument (all default to `"system"`).

So the inner `withAuth` session/capability check binds to the `"system"` policy context, **not** to the
request's real workspace. `getPolicyContext("system")` looks up the caller's membership in a workspace whose
id is `"system"`; for a normal tenant user that returns `null` → 401 unless the real tenant scoping is
supplied by the **outer** wrapper (`withCanonicalEnforcement` / `withEnforcementFull`) which reads
`x-workspace-id` and enforces membership separately.

## Call-site categories (representative, by `app/api` area)
| Area | withAuth sites | Notes |
|---|---|---|
| engagements | 9 | governed engagement lifecycle; owner-facing |
| decisions | 8 | operator decisions; owner-facing |
| growth | 3 | owner-facing growth surfaces |
| diagnosis | 3 | pure-compute engines (Target 3 FALSE_POSITIVE) |
| onboarding | 2 | includes the invite route (Target 1, fixed) |
| metrics / webhooks / verify / users / leads / governance / execute / clients / calibration / run / opsiq | 1–2 each | mixed |

## Risk classes
1. **Single-guard sites (HIGHEST priority):** routes where `withAuth("system")` is the ONLY auth (no
   canonical wrapper binding the real workspace). If any exist, the capability is checked against `"system"`
   and the real workspace is trusted from body/params without membership enforcement. Must be enumerated and
   migrated to `withCanonicalEnforcement` (which binds a verified workspace) first.
2. **Double-wrapped sites (LOWER priority):** routes wrapped by `withEnforcementFull` /
   `withCanonicalEnforcement` (real workspace enforced there) with a redundant inner `withAuth("system")`.
   The inner call is legacy/belt-and-suspenders; migrate opportunistically to remove the `"system"` default
   ambiguity, but they are not an active isolation breach as long as the outer wrapper enforces membership.
3. **Inert-passthrough sites:** e.g. the diagnosis routes — `withAuth("system")` + pure-compute engine that
   neither reads nor writes by the body workspace (proven FALSE_POSITIVE this phase).

## Safe migration pattern
- Replace `withAuth({ capability })` (default `"system"`) with `withCanonicalEnforcement`, which resolves and
  verifies the workspace from `x-workspace-id` + membership and passes a `CanonicalAuthContext` bound to the
  verified workspace to the handler (the pattern services already require via `requireServiceContext`).
- Where a route legitimately needs the resolved workspace for the capability check, pass it explicitly:
  `withAuth({ capability }, verifiedWorkspaceId)`.

## Phased plan
1. **Phase A (classify):** script/grep to bucket all ~68 sites into the three risk classes above (by whether
   an outer canonical/enforcement wrapper is present). Output a per-route table.
2. **Phase B (single-guard first):** migrate any Class-1 sites to `withCanonicalEnforcement`; add real
   cross-workspace-denial tests per route before/after.
3. **Phase C (owner-facing double-wrapped):** engagements + decisions areas (17 sites) — migrate to remove the
   `"system"` inner default; regression-test governed flows.
4. **Phase D (remainder):** metrics/growth/misc.
5. **Phase E (lock):** once no site relies on the `"system"` default, consider making the `withAuth` workspace
   argument required (remove the default) so the footgun cannot reappear.

## Risks
- Broad migration touching 68 sites in one PR is high-blast-radius and would obscure review → explicitly
  out of scope here.
- Some routes may depend on the `"system"` policy for genuinely system-level operations; those must be
  identified (not migrated to tenant scope) during Phase A.

## Tests required before migrating any site
- Per route: authorized-workspace-A caller with `x-workspace-id=B` (or `body.workspaceId=B`) is **denied**
  (403/404), and the same caller with their own workspace is allowed. Real DB, no fakes.

## This PR
No `withAuth` call site was migrated in Phase 6E (only the invite route's inline authorization + the
enforcement-middleware selects were fixed). The migration is deferred to a dedicated phase per the plan above.
