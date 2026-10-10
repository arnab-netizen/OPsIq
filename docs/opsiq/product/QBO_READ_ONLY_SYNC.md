# QuickBooks Online — READ-ONLY synchronization (V26)

`QBO_READ_ONLY` · `NO_QBO_WRITE_API` · `PRODUCTION_MIGRATION_REQUIRED=YES` (`20261010090000_qbo_read_only_sync_persistence`, additive) · `NO_EVIDENCE_ADOPTION` · `WEBHOOK_INTUIT_CONFIGURED=NO` · `LIVE_QBO_CALL_EXECUTED=NO`

Builds on the proven OAuth + persistence foundation (`QBO_CONNECTION_PERSISTENCE.md`). Adds the first read-only sync, a manual owner trigger, a token-free status API, a scheduled sync, and a signature-verified webhook that is only an event *hint*.

## 1. Source audit — answers to the Phase 1 questions

| Question | Answer (source of truth) |
| --- | --- |
| How is an ACTIVE connection resolved business-safely? | `resolveSyncableConnection({workspaceId, businessId, connectionId})` in `qbo-sync-store.service.ts` selects by the full triple; a connection of another workspace/business is indistinguishable from a missing one. Status must be `ACTIVE`, business active and non-fixture, and `connection.environment` must equal the configured environment. The scheduler/webhook entry recovers the business from the connection row by (claimed workspace, connection id) only. |
| How are encrypted tokens loaded? | `loadQboTokensForUse` (`qbo-connection.service.ts`) — server-side only, `decryptOAuthToken` with the workspace-bound key. `getUsableQboAccessToken` is the only caller on the sync path; the plaintext never leaves the process (not in outcomes, audit payloads, logs or errors). |
| How does refresh happen? | `getUsableQboAccessToken` refreshes only when the access token has < 2 minutes left (or once per sync after an API 401) via `refreshQboTokens`; never retried inside the service (a lost response may already have rotated the token). |
| How do CAS/revision prevent stale refresh writers? | Refreshers of one connection are first serialized by a short DB claim (`qbo_sync_states.refresh_claim_*`, no open transaction), so Intuit — which ROTATES the refresh token — is called once; a waiter re-reads the stored tokens instead of refreshing again. The grant is then persisted with `rotateQboTokens({expectedRevision})` — a conditional UPDATE on `revision` (retried on transient DB errors with the same grant); `STALE_REVISION` ⇒ the loser discards its grant and adopts the stored one. A forced refresh (after an API 401) names the revision that was rejected and is a no-op if a newer revision is stored. |
| How do scheduled jobs obtain workspace/business? | `ScheduledTask.workspaceId` is set at enqueue and handed to the handler as `context.workspaceId` (never from payload). The payload carries only `connectionId`; the business comes from the connection row. |
| How is external-source data stored with provenance? | The generic `External*` tables are not tenant-/realm-aware (same reason as `QBO_SPECIFIC` in the persistence doc), so sync data lives in QBO-specific mirror tables keyed by connection, with run ids, provider timestamps/SyncToken, content hashes and fetch times. |
| Which owner-facing records can safely receive QBO data? | **None in this slice.** `OwnerFinancialSnapshot`/`OwnerCashflowSnapshot` are owner-attested; QuickBooks values are held as provider observations and adopted only through `resolveFinancialFieldPrecedence` (§7) in a later reviewed slice. |

## 2. Supported sources (derived, not assumed)

`SUPPORTED_QBO_READ_ENTITIES = CompanyInfo, Customer, Invoice, Bill, ProfitAndLoss(report), BalanceSheet(report), AgedReceivables(report), AgedPayables(report)`

Derived from the fields OpsIQ's finance/cashflow snapshots consume (table in `qbo-sync-model.ts`): revenue/COGS ← ProfitAndLoss; cash ← BalanceSheet `BankAccounts`; receivables/payables ← BalanceSheet + aged reports (cross-checked); overdue ← aged reports (every non-"Current" bucket); customer/order counts ← Customer, Invoice; payables detail ← Bill. Deliberately **not** synced: Vendor, Account, Payment, Purchase, CashFlow, TrialBalance, payroll and everything else in the read catalog. Adding a source is a reviewed change to `qbo-sync-model.ts` **and** to `qbo-foundation-boundaries.test.ts`.

Every provider request goes through `createQboReadClient` (GET-only). The sync service calls exactly `companyInfo`, `paginate`, `report`.

## 3. Persistence (additive migration)

| Table | Purpose |
| --- | --- |
| `qbo_sync_states` | One row per connection: **the lease** (`lease_token`, `lease_run_id`, `lease_expires_at`, fencing `lease_epoch`), the token-refresh claim, last attempt/success/full-sync, outcome, sanitized `last_error_code`, `consecutive_failures`, `next_attempt_not_before`, per-entity `watermarks`, `last_change_at`, `webhook_hint_at`. |
| `qbo_sync_runs` | One attempt; `UNIQUE(connection_id, idempotency_key)` ⇒ replay. Status `RUNNING/SUCCEEDED/FAILED/ABANDONED`, counts, sanitized error code. |
| `qbo_synced_records` | Normalized, PII-minimal copy of Customer/Invoice/Bill/CompanyInfo: provider id, SyncToken, provider `LastUpdatedTime`, record state `ACTIVE/INACTIVE/MISSING`, content hash, revision, first/last-seen run, fetch time. `UNIQUE(connection, entity, provider id)`. |
| `qbo_report_observations` | Parsed report per (report, period, basis): currency, metrics as decimal strings (absent ≠ 0), inconsistency flags, hash, revision and ONE step of history (`previous_metrics`). |
| `qbo_webhook_events` | Dedup ledger of verified hints (no payload). Tenant columns are NULL for an unknown realm. |

Every sync table references `qbo_connections(id, workspace_id, business_id)` by composite FK (new unique index `qbo_connections_tenant_business_key`), so a row cannot name another tenant's connection. No token column exists outside `qbo_connection_tokens` (machine-checked). Nothing is deleted; `MISSING` is a soft flag.

## 4. Lease, idempotency, resumption

* **One lease per connection**: acquisition is one conditional `UPDATE … WHERE lease_token IS NULL OR lease_expires_at <= now` inside the same transaction that records the `RUNNING` run; the loser gets a typed `BUSY` (HTTP 409) and nothing runs. TTL 15 minutes (above the worst-case retry budget of one provider request) and extended **before every provider call** and by every persisted page.
* **Stale workers cannot write**: every persisted page/report re-verifies *and extends* the lease in its own transaction; finishing releases it with a CAS. The fence is the **(token, epoch)** pair — a takeover replaces the token, so a taken-over worker always fails with `QboLeaseLostError`; an expired-but-untaken lease can still be finished by its owner (work is not discarded when nobody competed). The abandoned run is marked `ABANDONED` and audited.
* **Idempotency keys** carry the lease epoch: MANUAL `manual:<requestId>`; SCHEDULED `scheduled:<UTC day>:<epoch>`; WEBHOOK `webhook:<15-min>:<epoch>`. Two triggers racing from the same state collide on the unique key and replay; a retry after a failed / abandoned / crashed attempt (epoch moved on) runs under a fresh key, so a failure never "swallows" the day. Same-day repeat of a *successful* scheduled sync is `NOT_DUE`; a webhook-triggered run happens only while an unserved hint exists. A non-successful replay is never reported as success (HTTP 409).
* **MANUAL cooldown**: 60 s per connection (each run costs ~11 provider calls).
* **Restartable**: each page is persisted before the next is requested; the watermark advances only after an entity is fully read (and only forward). A crash re-reads from the previous watermark (10-minute overlap); upserts are conditional on provider time never going backwards, so re-reads change nothing.
* **Keyset pagination** (not offset): every page asks for `LastUpdatedTime >= cursor AND <= cutoff` from position 1, so an edit made while paging can never shift later pages and hide a record. Boundary rows and provider duplicates collapse by id; a timestamp shared by more than a page of rows is stepped through by offset inside that single timestamp only; the page bound fails loudly.
* **Deletions/inactive**: Intuit's query does not return deleted/inactive objects. A FULL sync (first run and weekly) treats unseen records only as *candidates*: each is re-read by id (`GET`, ≤100 per entity per run). A record that still exists is refreshed (inactive ⇒ `INACTIVE`); only one Intuit confirms absent (HTTP 404, or 400 with fault code 610 — **unverified against the live Sandbox**) is flagged `MISSING`. INCREMENTAL never flags anything. A `MISSING → ACTIVE` return counts as a change.

## 5. Token refresh, failures, back-off

Closed failure vocabulary (`QBO_SYNC_FAILURE_CODES`). `invalid_grant`, a dead refresh token, or a 401 on a token that was *just* refreshed (one forced refresh per token expiry; the allowance re-arms after the new token is accepted) ⇒ connection `REAUTH_REQUIRED` (terminal, never retried, producer stops listing it). Transient provider failures back off 15m→6h; persistent non-auth failures (forbidden, malformed, rejected, company mismatch) 6h→24h; `Retry-After` honoured up to the ceiling. Manual runs ignore back-off (a deliberate human act, rate-limited by the cooldown); scheduled/webhook runs return `NOT_DUE` inside it. One malformed report does not discard the others: the rest are stored, then the run fails `PROVIDER_MALFORMED` (watermarks do not advance).

## 6. Surfaces

| Surface | Path | Gate |
| --- | --- | --- |
| Manual sync | `POST /api/owner/integrations/quickbooks/sync` body `{businessId, connectionId, requestId?}` (strict) | `OWNER_MANAGE`, workspace, human actor |
| Status | `GET /api/owner/integrations/quickbooks/status?businessId=` | `OWNER_VIEW`, workspace |
| Webhook | `POST /api/integrations/quickbooks/webhook` | HMAC signature (no session) |
| Scheduler | task `qbo-read-sync`, producer in `/api/internal/cron/scheduler` | `CRON_SECRET` (existing) |

Tokens, realm, environment, base URL, workspace and actor are never accepted from a caller; the status body contains no realm, token, ciphertext, OAuth state or provider payload. No UI was added (`OWNER_QBO_SURFACE` is exactly these routes).

**Scheduler cadence**: one task per eligible connection per UTC day (`qbo-read-sync:<connection>:<YYYY-MM-DD>`), matching the platform's single daily cron (`0 3 * * *`). Rationale: QuickBooks reports change daily and the platform cron is daily. Webhook-triggered tasks (when the webhook is later enabled) are executed by the same scheduler drain, i.e. at the next scheduler invocation — with the current single daily cron that is *not* intraday; intraday freshness would need an additional drain trigger, which is out of scope. Producer scans are bounded (200), skip non-ACTIVE/leased/backing-off connections and other environments, and registration is idempotent.

## 7. Owner-data safety / provenance rules (`qbo-provenance-policy.ts`)

1. Manual values are never overwritten; a material difference is a *conflict* with the QuickBooks figure offered as a suggestion.
2. QuickBooks fills gaps only, tagged with observation + connection + fetch time and capped at confidence 0.85.
3. Currency must equal the business currency — no conversion, no adoption otherwise (the seeded business default is INR; QuickBooks sandbox is USD).
4. Period/as-of must match the target snapshot (flow metrics: exactly the period; balance-sheet metrics: at period end; aged metrics: within 7 days), Accrual basis only, staleness measured on the as-of date.
5. Internally inconsistent reports (gross profit, aging sums, negative overdue from credits, unbalanced balance sheet), absent metrics (never zero) and archived businesses are never adopted.
Because this slice performs **no** adoption, the mandatory adaptive re-evaluation is *prepared*, not executed: a successful sync that changed data emits `qbo.sync_completed` with `reevaluationCandidate: true`; routing that into BusinessConditionProfile / InterventionMode / phase / priority / cadence / health belongs to the adoption slice.

## 8. Webhook — what is and is not verified

Intuit's developer pages could not be fetched from the build environment (no DNS). From search-result summaries of those pages: HMAC-SHA256 of the raw payload keyed with the app's verifier token, compared with the `intuit-signature` header (documented for the legacy format); delivery is at-least-once, unordered, expected to be acknowledged with HTTP 200 within ~3 seconds; the payload format is migrating to CloudEvents v1.0 (`type: qbo.<entity>.<operation>.v1`, `intuitaccountid` = realm, `intuitentityid` = entity id) and Intuit's stated migration deadline (15 May 2026, reported by one source as moved to 31 July 2026) has passed. **Unverified**: whether the CloudEvents format signs with the same header/algorithm, exact retry schedule, and the precise list of emitting entities. The receiver therefore fails closed (any other scheme ⇒ 401), parses both formats, never trusts content, and these items **must be re-confirmed against developer.intuit.com before the endpoint is registered** (registration is not part of this slice). Without `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN` the endpoint answers 503.

## 9. Known limitations

* No UI; no adoption of QuickBooks values into owner snapshots; no business-condition re-evaluation yet (§7).
* The per-realm rate limiter is process-local (existing limitation); the single sync lease serializes the realm in practice.
* The acceptance-time behaviour of `MetaData.LastUpdatedTime` filtering/ordering in Intuit's query language and the exact group names in live report payloads are implemented to Intuit's documented shapes and unit-tested against fixtures, but are **not yet proven against the live Sandbox** (Phase 14).
* Aged reports accumulate one observation per day per connection (no deletion by design); report observations keep one step of history only.
* `report_date` is the UTC date, not the company's local date. Balance-sheet AR/AP is not yet reconciled against the aged totals or open invoice balances (only the balance equation, gross profit and aging sums are checked).
* All mirror tables are internal-only: no route returns records or observations (only counts). Customer display names and document numbers are retained (e-mail, phone, address and notes are not).
* Realm exclusivity across tenants is enforced by the existing partial unique index `qbo_connections_live_realm_key`.
* A tail-risk of the FULL reconcile is that it reads every Customer/Invoice/Bill; accounts beyond 500k records of one type fail loudly (`PAGINATION_LIMIT_REACHED`) rather than truncate.

## 10. Live acceptance procedure (NOT executed — requires explicit Preview authorization)

Prerequisites: (a) migration `20261010090000_qbo_read_only_sync_persistence` applied to the Preview database by the owner-approved `migrate-production.yml` workflow (it is additive; this change does not apply it); (b) Preview deployment of this branch; (c) the existing Sandbox connection `5b251054-e7e9-4295-bbb1-26201afaf528` (business `c535e622-b7e3-4569-94db-7fc01dcea682`, realm `9341458068893772`, `sandbox`) still ACTIVE; (d) **no webhook configuration in Intuit**.

1. Baseline (read-only SQL on the Preview DB): `qbo_sync_states/runs/synced_records/report_observations` empty for the connection; token revision noted (2); connection `ACTIVE`.
2. `POST /api/owner/integrations/quickbooks/sync` as an `OWNER_MANAGE` user with `{businessId, connectionId, requestId:<uuid>}`. Expect 200 `SUCCEEDED`, `mode: FULL`.
3. Verify: all accounting traffic is `GET` against `…/v3/company/9341458068893772/…` only (Vercel runtime logs / Intuit `intuit_tid`s; no POST except `oauth2/v1/tokens/bearer` if a refresh occurred); `qbo_sync_runs` one `SUCCEEDED`; `qbo_synced_records` counts per entity equal the Sandbox's Customer/Invoice/Bill counts (+1 CompanyInfo); `qbo_report_observations` = 8 rows with `currency` as reported by Intuit; no token/PII columns populated.
4. Idempotency: repeat the same `requestId` ⇒ `ALREADY_COMPLETED`, no new run; POST with a new id ⇒ `INCREMENTAL`, `inserted=0`, `updated=0`, `reportsChanged=0`, record `revision`s unchanged.
5. Token safety: if the access token was < 2 min from expiry a refresh occurred — confirm `qbo_connection_tokens.revision` increased by exactly 1 and one `qbo.tokens_rotated` audit event; no token material in any audit payload.
6. Status: `GET …/status?businessId=…` shows connected, `sandbox`, `lastOutcome: SUCCEEDED`, record counts, `syncRunning:false`; response contains no realm/token fields.
7. Concurrency: two simultaneous POSTs ⇒ exactly one runs, the other 409 `BUSY`.
8. Production untouched: no production connection exists; production DB not migrated by this procedure.
9. Stop. Do not disconnect, reconnect, mutate Sandbox data, or register the webhook.
