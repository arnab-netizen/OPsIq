# Vercel cron compatibility and scheduler cadence

## Why the schedule is daily

`vercel.json` schedules `/api/internal/cron/scheduler` at `0 3 * * *` (daily, 03:00 UTC).

Vercel's Hobby plan permits **once-per-day** cron jobs only; a more frequent
expression is rejected during deployment and fails the entire deployment — not
just the cron. The previous `* * * * *` therefore blocked every git-triggered
build. Per-minute cadence requires the Pro plan. Hobby scheduling precision is
±59 minutes, so treat `0 3 * * *` as "some time in the 03:00 UTC hour".

## Why daily is safe

Both jobs the endpoint runs are **catch-up**, not exact-time:

| Job | Selection | Missed-window behaviour |
| --- | --- | --- |
| Scheduled tasks | `status='pending' AND scheduled_for <= now`, plus `running` rows whose lease expired | Everything overdue is claimed on the next invocation |
| Alert email retry | Every alert with `emailDeliveryStatus='FAILED'` and `emailAttemptCount < 3`, oldest first | The whole backlog is eligible on the next invocation |

Each underlying pass is bounded (50 tasks, 20 emails) to keep individual
statements small. To stop those bounds from stranding a backlog at a low
cadence, the route drains **repeated bounded passes** under a wall-clock budget
(`DRAIN_BUDGET_MS`) and a pass cap (`MAX_DRAIN_PASSES`). Work still outstanding
when the budget is spent remains `pending` / `FAILED` and is picked up next
time. Per-pass semantics are unchanged: `FOR UPDATE SKIP LOCKED`, unique
idempotency keys, exponential backoff, and lease expiry keep concurrent
invocations safe and prevent double execution.

Current scheduled-task load is zero: no production code calls
`scheduler.schedule(...)`, and `processDue` is invoked with an empty handler
map. The live work is the alert email retry sweep, which is a **backstop** — the
first send attempt happens inline in `alert-service.ts` at alert creation, not
via cron.

## Trade-off you are accepting

At daily cadence, a **failed** alert email is retried up to ~24 hours later
instead of within a minute. First-attempt delivery is unaffected. If that
latency is unacceptable, use one of the options below.

## Running more often without upgrading Vercel

The endpoint is a plain authenticated `GET`. Any external scheduler can drive it
at any cadence with **no code change**:

- **Endpoint**: `GET https://<production-domain>/api/internal/cron/scheduler`
- **Header**: `Authorization: Bearer <CRON_SECRET>`
- **Success**: `200` (all clean) or `207` (partial, non-fatal errors in body)
- **Auth failure**: `401` — fail-closed, including when `CRON_SECRET` is unset
- **Suggested cadence**: every 5 minutes is ample; concurrent invocations are safe

Suitable drivers include GitHub Actions `schedule:`, cron-job.org, Upstash
QStash, or any always-on host running `curl`. Vercel's own cron may stay enabled
at daily as a guaranteed floor — duplicate invocations are safe by design.

## Owner checklist before relying on tighter cadence

1. Confirm the Vercel plan. Hobby → keep `0 3 * * *`; Pro → a per-minute
   expression may be restored in `vercel.json`.
2. Set `CRON_SECRET` in Vercel Production (`openssl rand -base64 32`). Without
   it every invocation returns 401 and **no scheduled work runs at all**.
3. Decide whether daily retry latency is acceptable.
4. If not, provision an external scheduler with the endpoint, header, and
   cadence above, storing `CRON_SECRET` in that scheduler's secret store — never
   in source control.
5. Monitor: alert on repeated non-2xx responses, and on alerts sitting at
   `emailDeliveryStatus='FAILED'` with `emailAttemptCount < 3` for longer than
   the chosen cadence.

Provisioning an external scheduler is a separate, owner-authorised action. This
repository is configured to be compatible with one; it does not create one.
