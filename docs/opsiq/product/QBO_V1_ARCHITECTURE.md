# QuickBooks Online V1 — authoritative architecture (read-only connected evidence)

`QBO_READ_ONLY` · one runtime architecture: `src/{domain,services}/quickbooks` · supersedes every earlier QuickBooks design
(workspace-scoped `OwnerConnector`, the historical `claude/nice-cori-gaq4di` branch, and the persistence-only foundation notes in
`QBO_CONNECTION_PERSISTENCE.md`, which remains the reference for the three connection tables).

## 1. The contract (frozen)

**V1 is READ-ONLY.** The only provider calls are GETs of company info and four reports, plus the OAuth token / revoke calls.
There is no create/edit/void/delete/batch/write-back of any accounting object. Enforced by
`src/__tests__/services/quickbooks/qbo-foundation-boundaries.test.ts` (source scan of every QuickBooks module).

**V1 dataset** — exactly four reports per closed calendar month:
Profit and Loss · Balance Sheet · Aged Receivables · Aged Payables. No Customer/Invoice/Bill mirror: no current OpsIQ consumer needs
entity-level rows (the Finance model consumes totals), and entity mirrors would store customer PII for no benefit.

**Chain:** Owner connects → business/realm bound → tokens refreshed on demand → four reports acquired → parsed (semantic, not
positional) → versioned observations → provenance → source-precedence → canonical `OwnerFinancialSnapshot` / `OwnerCashflowSnapshot`
→ the owner re-runs analysis (existing `runFinanceDiagnosis` → cycle → Business Condition). QuickBooks supplies *evidence*; it never
runs or replaces a diagnosis.

## 2. Components

| Concern | Module |
|---|---|
| Report vocabulary, period policy, defaults | `domain/quickbooks/qbo-report-model.ts` |
| Pure parsers (P&L, BS, AR/AP aging) | `domain/quickbooks/qbo-report-parser.ts` |
| Derivation to OpsIQ figures + refusal codes | `domain/quickbooks/qbo-derivation.ts` |
| What one sync run reads (baseline / reconcile / refresh) | `domain/quickbooks/qbo-sync-plan.ts` |
| Owner state derivation + wording | `domain/quickbooks/qbo-owner-status.ts` |
| Webhook contract (signature, realm extraction) | `domain/quickbooks/qbo-webhook.ts` |
| Versioned observations | `services/quickbooks/qbo-observation.service.ts` |
| Token lifecycle (refresh-on-demand, CAS rotation) | `services/quickbooks/qbo-token-manager.ts` |
| Provider-resource locks (sync / refresh) | `services/quickbooks/qbo-connection-lock.ts` |
| Sync orchestrator | `services/quickbooks/qbo-sync.service.ts` |
| Canonical materialization + source precedence | `services/quickbooks/qbo-materialization.service.ts` |
| Scheduler producer / handler | `services/quickbooks/qbo-sync-scheduling.ts` (registered in `infra/scheduler-handlers.ts`, produced by the existing cron route) |
| Owner status / disconnect / refresh-now | `qbo-status.service.ts`, `qbo-lifecycle.service.ts`, `qbo-sync-background.ts` |
| Webhook reaction | `qbo-webhook.service.ts` + `app/api/webhooks/quickbooks/route.ts` |
| Owner UI | `components/owner/QuickBooksConnectionCard.tsx` inside `/owner/data` ("Connected accounts") |

## 3. Reports API compatibility (2026)

Intuit is migrating report responses onto its modernized report service (row order, grouping and column layout of some reports may
change). **Evidence available to this build:** only secondary summaries (the developer-portal and Intuit Medium pages could not be
fetched — `developer.intuit.com` / `medium.com` are blocked by the build environment's network policy — and no Sandbox credentials
exist). So compatibility rests on structural invariants, not on a captured 2026 response:

- the amount column is resolved from `Columns` (ColKey `total` / title `Total` / the only Money column) — never by index;
- sections are located by `group` id, falling back to an exact normalised label; two candidates is an error, never a guess;
- absent figure = `null` (never 0); a stated `0.00` is 0; a non-numeric or out-of-range amount fails the whole report;
- the report name, and (P&L, Balance Sheet) the stated period, must match the request;
- basis and currency are read from the header and preserved; nothing is converted.

Fixtures: `src/__tests__/fixtures/qbo/qbo-report-fixtures.ts` — a historical shape and deliberately re-ordered/regrouped "modern" shapes.
**They are structural stress fixtures, not captured Sandbox responses.** `UNVERIFIED — exact 2026 response schema; replace/extend the
fixtures with sanitized Sandbox captures during Sandbox acceptance (see §12).** Aged reports: the header period is not asserted
(its exact semantics could not be verified); the requested `report_date` is recorded instead.

## 4. Accounting policy (locked defaults)

- **Basis:** OpsIQ has no business-level accounting basis; V1 requests **ACCRUAL** for P&L and Balance Sheet, records the basis the
  report states (`basis_source = REPORT_HEADER`) or, if silent, the requested one (`REQUESTED`), and exposes it in the owner status.
  Observations of different bases are never combined (`BASIS_MISMATCH` refuses the month).
- **Currency:** no conversion. Missing currency → `CURRENCY_UNKNOWN`; different from the business currency → `CURRENCY_MISMATCH`.
  Observations are still kept; only canonical materialization is refused.
- **Periods:** closed calendar months only (period convention identical to manual entry: first day … last day, 00:00Z). A month counts as closed one UTC day after it ends, so it has ended in every company time zone before its figures are read.
- **Owner-entered ranges:** a current manual snapshot whose period *overlaps* a month (a quarter, year-to-date, custom range) keeps that month owner-controlled; QuickBooks never creates a competing monthly row beside it.
- **Missing is not zero, and nothing is carried forward:** a stated `0.00` is the number 0; an absent section / unreadable cell / unusable (negative) value is *unknown* (null). When the newest read no longer supplies a figure that a QuickBooks-authored version recorded, the next version returns it to unknown (Finance amend, Cashflow in-place update) — the old number never survives under the newest observation's provenance. Owner-authored versions are never touched. History keeps what was true at the time.
- **Refusals are visible:** every refused month records a bounded reason (currency mismatch/unknown, basis mismatch, sandbox isolation, realm mismatch, contradictory figures); the owner card shows the plain-language sentence for each. The
  in-progress month never produces a snapshot (no daily version churn).
- **Evidence quality:** ledger-derived figures are `ACTUAL` ("These numbers come from your bank, accounts or sales records.").
- **Derived figures** (everything else stays unknown): revenue (P&L Income total, Other Income excluded), costOfGoods (P&L COGS total),
  receivables / overdueReceivables / payables / overduePayables (aging grand total; overdue = total − Current bucket),
  bankBalance (Balance Sheet "Bank Accounts", on the **Cashflow** snapshot — Finance `cashOnHand` is *physical* cash by OpsIQ's
  liquidity contract, which QuickBooks cannot distinguish). Not derived: fixed/variable costs, payroll, rent, utilities, marketing,
  debt payments/outstanding, inventory cash lock, cashOnHand. Negative values (credits, overdraft) are omitted with a bounded reason.
- **Baseline:** the last **12 closed months** (48 report reads), newest first, 3 months per run, resumable cursor. Steady state: daily
  refresh of the 3 most recent closed months (picks up backdated edits); a full 12-month reconcile every 7 days.
- **Freshness:** daily cron is the guaranteed cadence (Vercel cron `0 3 * * *`); the owner UI says "last updated" truthfully and marks
  data **stale after 36 hours**. Webhooks and "Refresh now" shorten the delay but are never required.

## 5. Source precedence (derived from data, not a mutable flag)

| Situation | Result |
|---|---|
| Owner-authored period (current version has no provenance) | owner wins; QuickBooks never writes it (counted `ownerControlled`) |
| Empty period | QuickBooks creates the canonical snapshot (+ provenance, one transaction) |
| QuickBooks-controlled (current version has provenance) and QuickBooks changed | amended through the normal versioning path; v(N) kept and superseded |
| Owner amends a QuickBooks-derived Finance period | the amendment is a new version without provenance ⇒ owner-controlled for good |
| Cashflow row (updated in place) | provenance stores the row's `updated_at` stamp; any later write is the owner's ⇒ compare-and-set fails ⇒ owner-controlled |
| Period produced by a *different* QuickBooks company | never overwritten (`REALM_MISMATCH`) |
| Sandbox ⇄ real business | a Sandbox company attaches only to a test (fixture) business and production only to a real one — refused at Connect (begin AND finalize) and explained on the owner card; materialization (`SANDBOX_ISOLATION`) and a DB trigger are the backstops |

## 6. Persistence (migration `20261024090000_qbo_v1_sync_evidence_provenance`, additive)

- `qbo_sync_state` — one per connection: lifecycle, baseline cursor, last attempt/success/failure, bounded error, consecutive
  failures, webhook marker, company display name, last-run summary. **No scheduler lease.**
- `qbo_report_snapshots` — immutable, versioned, minimized observations (allowlisted totals only). Unchanged re-reads only bump
  `confirm_count`/`last_confirmed_at`; a DB trigger forbids changing anything else or deleting a row. Answers "why did January change
  from X to Y?" by comparing versions, each linked from the provenance of the canonical version it fed.
- `qbo_canonical_provenance` — append-only link canonical snapshot version ⇄ the ≤4 observations it came from, with derived values,
  basis, currency and (cashflow) update stamp. Written in the same transaction as the canonical write.
- `qbo_resource_locks` — per-connection `sync` / `refresh` lock rows (see §7).
- Tenancy by composite FK: (connection, workspace, business[, environment, realm]) for observations/provenance; provenance →
  snapshots by (id, workspace, business); provenance → observations by (id, workspace, connection). Additive unique indexes added to
  `qbo_connections`, `owner_financial_snapshots`, `owner_cashflow_snapshots` to carry those FKs. New tables are in
  `WORKSPACE_OWNED_MODELS`.

## 7. Concurrency

The application pool has **one** connection and runs behind a pooler (`src/lib/db.ts`). A Postgres advisory lock held by an open
transaction/session would starve every other query (deadlock) or silently drop. Therefore:

- *task* protection = the existing scheduler's fenced lease; *provider-resource* protection = a lock **row** per (connection, scope)
  acquired by one atomic `INSERT … ON CONFLICT … WHERE expired` on the database clock, renewed before every report read and before the progress cursor moves (a lost lease stops the run), released in `finally`,
  expiring on crash. Tested independently (`qbo-token-manager.db.test.ts`, `qbo-sync-scheduling.db.test.ts`).
- Short critical sections that fit one transaction (observation identity, canonical period write) use `pg_advisory_xact_lock`.
- Refresh is serialized per connection; a waiter re-reads and reuses the newer revision; rotation is a CAS on `revision`. Intuit treats the previous refresh token as dead once a new one is issued, so the local write of a rotated grant is retried (4 attempts, backoff, post-commit recognised) before a bounded, retryable `TOKEN_PERSIST_FAILED` surfaces; if the database never recovers the next run's `invalid_grant` becomes `REAUTH_REQUIRED` and the owner reconnects (no credential is ever logged).

## 8. Token lifecycle

Refresh-on-demand inside each sync (120 s skew) and after a 401 (at most one refresh per request). `invalid_grant` or an expired
refresh token ⇒ `REAUTH_REQUIRED` (terminal, audited once). 429/5xx/timeouts ⇒ the error propagates and the scheduler retries (3
attempts, exponential backoff, dead-letter). No dedicated refresh scheduler.

## 9. Webhooks and reconciliation

- `POST /api/webhooks/quickbooks`: `intuit-signature` = base64 HMAC-SHA256 of the raw body keyed by `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN`
  (constant-time; unset ⇒ 401). Accepts the legacy `eventNotifications` shape and CloudEvents (company id from `intuitaccountid`).
  Extracts **realm ids only**; marks the sync state and enqueues one idempotent task per *arming of the pending marker* (key = the marker's instant: a burst shares one task; an event after a run claimed the marker gets its own; a run that finishes and finds the marker re-armed enqueues a follow-up `whc` task; the daily producer repairs an armed marker whose task was never created); unknown/inactive companies
  are acknowledged identically. Events are triggers, never financial values.
  `UNVERIFIED — Intuit's exact CloudEvents field names and acknowledgement deadline (could not reach the documentation); the route
  does DB-only work so it answers in milliseconds.`
- **CDC is deliberately not implemented.** CDC reports *which entities* changed; V1 reads *report totals* directly. The reconciliation
  path that makes a missed webhook unable to leave OpsIQ stale is the scheduled re-read: daily (3 recent closed months) and a full
  12-month re-read every 7 days. That is a strict superset of what CDC could tell us for this dataset, with no entity mirror, no
  lookback/1000-row/truncated-cursor handling and no deleted/voided-entity logic to get wrong.

## 10. Provider resilience

Existing client: per-realm limiter (documented 500/min, 10/s, 10 concurrent — `QBO_PROVIDER_LIMITS`), 429 penalty + `Retry-After`,
bounded retries with jitter, 30 s timeout, `intuit_tid` correlation, abort on lease loss. One connection failing never blocks another
(separate tasks, separate locks).

## 11. Observability

DB: `qbo_sync_state` (health, last attempt/success, consecutive failures, bounded code, progress) — surfaced to owners by
`GET /api/owner/integrations/quickbooks/status`. Logs: structured, ids + counts + bounded codes, no token/body/values. Audit
(lifecycle only): connected, reauthorization required, disconnected, revocation failed, baseline completed, sync failed (once per
streak), sync recovered, canonical materialized (per canonical write).

## 12. Sandbox acceptance — status

`BLOCKED_EXTERNAL`: this build environment cannot reach any Intuit host (`oauth.platform.intuit.com`, `*.api.intuit.com`,
`developer.intuit.com` — network policy 403) and holds no QuickBooks app credentials. Everything that does not need Intuit is
implemented and proven against a fake Intuit on real Postgres. The owner-run acceptance procedure is in
`docs/opsiq/product/QBO_V1_SANDBOX_ACCEPTANCE_RUNBOOK.md`.
