# OpsIQ Runtime-Readiness — P4-A1 Auth-Scanner-Blocking Report

> First P4 slice, toward blocker **B4** (ratcheted / quarantined safety gates). Promotes the previously non-blocking
> auth route-governance scanner to a **blocking CI lane** and resolves the 4 CRITICAL route-auth violations it reports
> (including the one this session's own M8 route introduced). This strengthens a gate — it weakens none, lowers no
> threshold, and deletes no test.

## Branch & base
- Branch: `claude/runtime-readiness-p4a-strict-auth`
- Base HEAD: `75a1294` (main; after P3-B #87 merged — P3 complete).

## The gap (part of B4)
`scripts/auth-governance-scanner.ts` exists and exits non-zero on critical auth violations, but it was **not run in
CI** — so unwrapped / incorrectly-typed auth routes could merge. It reported 4 CRITICAL findings on `main`:
- `business-impact/decision/[id]/route.ts:15`, `business-impact/summary/route.ts:15`, `control/today/route.ts:15` —
  each threw a generic `new Error("Unauthorized…")` for the auth failure instead of the typed `UnauthorizedError`.
- `internal/reassessment-scan/route.ts:31` — the M8 endpoint returned `Response.json({…}, { status: 401 })` instead
  of throwing a typed auth error (a violation this session introduced in #87, now fixed).

## What was implemented
- **The 3 pre-existing routes**: replaced `throw new Error("Unauthorized or invalid workspace")` with
  `throw new UnauthorizedError(...)` (imported from `@/infra/errors`). They are already `withCanonicalEnforcement`-
  wrapped, and the wrapper renders `AppError.statusCode` (401) — so the client response is now a correct, typed 401.
- **The M8 internal route**: now `throw new UnauthorizedError(...)` on a bad/missing token and catches `AppError` to
  render `Response.json(error.toJSON(), { status: error.statusCode })` (no literal `401`, governance-clean). Behaviour
  is unchanged — an unauthorized request still gets 401; a strong `SCHEDULER_INTERNAL_TOKEN` is still required.
- **Promoted the scanner to blocking**: added `governance:scan:auth` (`npm` script) and a **`continue-on-error: false`**
  CI step ("Auth route governance scan (blocking)") right after the existing governance scan in `.github/workflows/ci.yml`.

## Files changed
- CHANGED `src/app/api/business-impact/summary/route.ts` (typed `UnauthorizedError`)
- CHANGED `src/app/api/business-impact/decision/[id]/route.ts` (typed `UnauthorizedError`)
- CHANGED `src/app/api/control/today/route.ts` (typed `UnauthorizedError`)
- CHANGED `src/app/api/internal/reassessment-scan/route.ts` (throw + `AppError` render)
- CHANGED `package.json` (`governance:scan:auth` script)
- CHANGED `.github/workflows/ci.yml` (blocking auth-scan step)
- NEW `OPSIQ_RUNTIME_READINESS_P4A1_AUTH_SCANNER_BLOCKING_REPORT.md`

## DB / migration changes
**None.** **API:** no contract change (same status codes). **UI:** none.

## Tests / checks run (local)
- **Auth scanner**: `npm run governance:scan:auth` → **"All routes comply"** (0 violations; was 4 critical).
- **Governance scan** (`npm run governance:scan`): **0 new** (32 pre-existing frozen findings unchanged — my route's
  new render is governance-clean).
- No-regression: route-auth + due-scanner + business-impact/control route tests → **186/186** (the M8 endpoint still
  returns 401 without/short/wrong token).
- `tsc --noEmit` ✓ · eslint (changed routes) 0/0 ✓ · `lint:ratchet` PASS (2112 = 2112; no new errors).

## Honest scope (not overclaimed)
- Closes the **"security route-scanner is non-blocking + has incorrect-auth routes"** half of B4: the scanner is now a
  blocking CI gate and reports zero criticals.
- **Does NOT** yet drive the 30 eslint `auth-enforcement/strict-auth` violations to zero, nor un-quarantine the
  security/isolation tests — those are the **next** P4-A slices (larger, done in batches per the plan, no threshold
  lowered, no test deleted). B4 stays open until they land.

## Classification
**`P4_AUTH_SCANNER_BLOCKING`** (scanner-proven + route no-regression): the auth route-governance scanner is a blocking
CI gate with zero critical violations; four route-auth findings fixed with typed errors; no gate weakened.

## Merge recommendation
Open PR; drive CI green — the new blocking auth-scan step must pass (it does locally). After merge, next P4-A slices:
drive the 30 `strict-auth` eslint violations to 0, then un-quarantine security/isolation tests in batches. Public SaaS
/ billing / launch / integrations remain out of scope and blocked.
