# OpsIQ Wave 9 — Decision Memo: scheduled-reassessment external trigger (infrastructure)

> Required by the follow-up-wave rule: "if a wave requires an infrastructure decision, do not guess — create a
> decision memo (options, recommendation, risks, tests). **Do not build a fake scheduler.**" This memo resolves the
> one remaining open item for time-based reassessment: **what invokes the scan on a cadence.**

## Settled already (do NOT re-litigate)
The M8 due-scanner and its seam are **done and proven** (merged in PR #87), and Wave 3 already recorded this as an
infrastructure decision:
- `scanDueReassessments(now)` (`src/services/owner-budget/due-reassessment.service.ts`) — finds every business with
  an **overdue, still-open** `OwnerBudgetAction` and re-runs the governed `reassessBudget` path with a
  `scheduled_review_due` trigger. Idempotent per business per UTC day. **DB-proven** (4 cases in
  `due-reassessment.service.db.test.ts`).
- `POST /api/internal/reassessment-scan` (`src/app/api/internal/reassessment-scan/route.ts`) — the cron **seam**.
  Fail-closed bearer auth on `SCHEDULER_INTERNAL_TOKEN` (≥16 chars, constant-time, **disabled/401 when unset — no
  hardcoded credential**). Runs the scanner and returns `{ ok, scanned, reassessed, skipped, businesses }`.
- **Event-driven reassessment is fully wired** (`re-evaluation.ts::triggerReEvaluation` on every significant
  mutation). Only the **time/cadence** trigger is external.
- **No fake scheduler exists**: `src/infra/scheduler.ts`'s `processDue` has zero production callers; the default
  `SCHEDULER_PROVIDER=in-memory` is serverless-ephemeral (never fires); there is no `vercel.json`/CI cron hitting the
  route. This is honest state (a ready seam that nothing calls yet), not a stub pretending to run.

## The decision: how to invoke the seam on a cadence
### Options
- (a) **Vercel Cron** (`vercel.json` `crons` → `POST /api/internal/reassessment-scan`). *Recommended if the app is
  hosted on Vercel* (the repo has a live Vercel project, `o-ps-iq`). Native, reliable, versioned. The cron request is
  authorized with the `SCHEDULER_INTERNAL_TOKEN` (set as a Vercel env var; the cron route reads the bearer).
- (b) **GitHub Actions scheduled workflow** (`on: schedule`) that `curl -X POST` the deployed endpoint with the token
  from a repo secret. Portable (repo already uses GH Actions), free, versioned. Best-effort timing; couples repo CI to
  the deployed URL.
- (c) **External hosted pinger / scheduler** (cron-job.org, uptime monitor, hosted scheduler) POSTing the endpoint
  with the bearer. Fully decoupled; third-party dependency.
- (d) **Durable queue/worker** (pg-boss, BullMQ). Overkill for a once-daily scan; adds infra. Rejected for now.

### Recommendation
**(a) Vercel Cron** while the pilot runs on the existing Vercel deployment; **(b) GitHub Actions** as the portable
fallback. Both hit the same token-gated seam — no app code changes, no new engine. This is a **deployment/ops
decision the owner controls** (which host, the `SCHEDULER_INTERNAL_TOKEN` value, the cadence, the deployed URL), so
Wave 9 documents the recipe rather than committing a workflow that pings a production URL (that would be an
out-of-scope external-integration/deployment action requiring the owner's URL + secret).

Reference recipes (for the owner to enable — not committed):
- Vercel: `vercel.json` → `{ "crons": [{ "path": "/api/internal/reassessment-scan", "schedule": "0 2 * * *" }] }`
  (Vercel cron requests are authorized; set `SCHEDULER_INTERNAL_TOKEN` and have the cron send it as the bearer, or
  gate via Vercel's cron secret — confirm the auth wiring for the chosen host before enabling).
- GitHub Actions: a `schedule: - cron: "0 2 * * *"` job running
  `curl -fsS -X POST "$DEPLOY_URL/api/internal/reassessment-scan" -H "Authorization: Bearer $SCHEDULER_INTERNAL_TOKEN"`
  with `DEPLOY_URL`/`SCHEDULER_INTERNAL_TOKEN` as repo secrets.

### Risks if left un-wired
Time-based reassessments do not auto-run at their due date. This **degrades silently, not falsely**: the owner
surface shows the real due date and never claims an automatic scheduled reassessment ran (Wave 3-verified wording).
Event-driven reassessment (the primary governed adaptive loop) is unaffected. For a **shadow pilot** — owner-
supervised, not autonomous — this is **non-blocking**: the owner can trigger the seam (or reassess on any material
event), and the operator enables the cron when they deploy.

### Tests (this wave closes the seam-verification gap)
The seam is now fully verified at both ends: fail-closed 401 (no/short/wrong token) **and** the authorized 200 path
(right token → scanner invoked once → honest result; scanner error → governed 500, no raw leak). The scan behaviour
over real overdue data remains DB-proven at the service layer.

## Not masked / non-blocking rationale
No fake scheduler is created. The un-wired external trigger is documented, not buried, and is non-blocking for the
owner shadow-pilot runtime path (event-driven reassessment wired; owner surface honest; seam ready + fully tested).
The final Tier-3 audit should confirm this classification.
