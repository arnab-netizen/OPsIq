# OpsIQ Runtime-Readiness — P3-B Scheduled-Reassessment Due-Scanner Report

> Closes major **M8** (scheduled reassessment was dead code): time-based reassessment never fired — only event
> mutations triggered `reassessBudget`, so an overdue action's `dueAt`/`reviewInDays` was ignored. This adds a
> DB-backed **due-scanner** that re-runs the EXISTING, proven `reassessBudget` path for every business with an overdue,
> still-open budget action, invoked by an **authenticated internal route** (fail-closed token). No new scheduler
> engine, no external cron infra.

## Branch & base
- Branch: `claude/runtime-readiness-p3b-due-scanner`
- Base HEAD: `433f28c` (main; after P3-A3 #86 merged).

## The gap (M8)
`src/scheduler.ts` is 0 bytes; `src/infra/scheduler.ts`'s generic `getScheduler()`/`processDue()` are uncalled. No
time-based path re-ran the plan, so a business whose recommended review came due (`OwnerBudgetAction.dueAt` /
`reviewInDays`) was never reassessed until some unrelated event mutation happened to fire. Event-triggered reassessment
already works; the cadence half was dead.

## What was implemented (reuse `reassessBudget`, no new engine)
- **`domain/owner-budget/reassessment-triggers.ts`**: added a `scheduled_review_due` `MaterialChangeKind` mapped to
  the `EXTERNAL_PLANNING` trigger class (governed, requires reassessment, **not** immediate) — the honest classification
  of a cadence review.
- **`services/owner-budget/due-reassessment.service.ts`** (NEW) — `scanDueReassessments(now, opts)`: finds overdue,
  still-open budget actions (`dueAt <= now` and status ∈ `OPEN_BUDGET_ACTION_STATUSES` = proposed/assigned/in_progress/
  blocked), reduces to distinct `(workspaceId, businessId)`, and re-runs `reassessBudget` for each with a
  `scheduled_review_due` trigger. **Idempotent per business per UTC day** — the trigger id embeds the date, and
  `reassessBudget` is idempotent per `(workspace, business, triggerEventId)`, so re-invoking the scan the same day
  creates no duplicate snapshot. Failures are isolated (one bad business does not abort the sweep); system-actor
  attributed.
- **`app/api/internal/reassessment-scan/route.ts`** (NEW) — `POST` that runs the scan. **Fail-closed auth**: disabled
  (401) unless a strong `SCHEDULER_INTERNAL_TOKEN` (≥16 chars) is configured; bearer token compared constant-time
  (`timingSafeEqual`). **No hardcoded credential, no permissive default.** This is the system/cron seam — the caller's
  own scheduler hits it; OpsIQ builds no external cron.

## Files changed
- CHANGED `src/domain/owner-budget/reassessment-triggers.ts` (`scheduled_review_due` kind + mapping)
- NEW `src/services/owner-budget/due-reassessment.service.ts`
- NEW `src/app/api/internal/reassessment-scan/route.ts`
- NEW `src/__tests__/services/owner-budget/due-reassessment.service.db.test.ts`
- NEW `src/__tests__/api/internal/reassessment-scan.test.ts`
- CHANGED `src/__tests__/owner-budget/engine.test.ts` (M8 trigger-classifier assertion)
- NEW `OPSIQ_RUNTIME_READINESS_P3B_DUE_SCANNER_REPORT.md`

## DB / migration changes
**None** (`OwnerBudgetAction.dueAt`/`status` and the snapshot/reassessment tables already exist). **API:** one new
internal route (token-gated). **UI:** none.

## Tests / checks run (local, Postgres)
- **NEW DB test** `due-reassessment.service.db.test.ts` — **4/4**: an overdue business is reassessed (a new snapshot is
  created); a not-yet-due business is skipped (no snapshot); a second same-day scan is idempotent (no duplicate
  snapshot); a business whose overdue action is already closed is skipped.
- **NEW route-auth test** `reassessment-scan.test.ts` — **3/3**: 401 when no token configured; 401 for a too-short
  token; 401 for missing/wrong bearer.
- **Trigger classifier** (`engine.test.ts`): `scheduled_review_due` → material, `EXTERNAL_PLANNING`, not immediate.
- No-regression: `src/__tests__/owner-budget` + `src/__tests__/services/owner-budget` → **262/262**.
- `tsc --noEmit` ✓ · eslint (changed files) 0/0 ✓ · `lint:ratchet` PASS (2112 = 2112; no new errors).

## Honest scope (not overclaimed)
- Closes **M8**: an overdue review now triggers a governed, idempotent reassessment through the existing engine, driven
  by an authenticated internal endpoint — not a new scheduler and not external cron.
- The endpoint is a **seam** for the operator's own scheduler; wiring an actual timer/cron is deployment/infra, out of
  scope here (and explicitly excluded). The route is safe-by-default (disabled without a configured token).
- Reuses `reassessBudget` and the existing `OwnerBudgetAction.dueAt`/`reviewInDays` — no new store, no new engine.

## Classification
**`P3_SCHEDULED_REASSESSMENT_LIVE`** (DB-backed + auth-proven): time-based reassessment fires through a governed,
idempotent, workspace-scoped path behind a fail-closed internal endpoint. With B6/M7/M9/M8 done, **P3 (learning &
reassessment loop closure) is complete.**

## Merge recommendation
Open PR; drive CI green before merge. No new browser spec. After merge, **P3 is fully closed**; next is **P4**
(governance hardening: B4 strict-auth/scanner-blocking, M1 verified-session state, M2 TOCTOU, M4 alert honesty, M6
workspace determinism, minors). Public SaaS / billing / launch / integrations remain out of scope and blocked.
