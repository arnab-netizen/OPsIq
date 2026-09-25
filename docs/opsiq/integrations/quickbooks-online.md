# QuickBooks Online integration

QuickBooks Online (QBO) stays the **accounting system of record**. OpsIQ reads accounting
evidence from it and — only through governed, owner-triggered actions — records a small set of
accounting operations that real OpsIQ workflows produce. OpsIQ is not a QuickBooks client: there
is no ledger browser, no invoice manager and no raw QBO API console.

## Readiness (truthful)

| Level | Status |
| --- | --- |
| Code complete | Yes |
| DB verified (local Postgres 16, real queries) | Yes |
| QuickBooks Sandbox verified | **No** — no Intuit sandbox credentials were available to engineering |
| Preview verified | No |
| Production externally approved (Intuit app assessment) | **No** |
| Production live verified | No |

`src/domain/external-systems/provider-registry.ts` labels QuickBooks `WRITE_CAPABLE_GATED`
(never `PRODUCTION_READY`). The nav entry carries a **Preview** pill.

## Setup (operator)

1. Intuit Developer portal → create an app with the **Accounting** scope
   (`com.intuit.quickbooks.accounting`).
2. Redirect URI (must match exactly): `<APP_URL>/api/owner/integrations/quickbooks/callback`
   (https in production).
3. Webhooks: endpoint `<APP_URL>/api/webhooks/quickbooks`, **CloudEvents** payload format,
   subscribe to the entities in the capability matrix below; copy the *verifier token*.
4. Environment (fail-closed — the card shows "not configured" if any is missing/invalid):

   | Variable | Notes |
   | --- | --- |
   | `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET` | from the Intuit app keys |
   | `QUICKBOOKS_REDIRECT_URI` | exactly the registered redirect URI |
   | `QUICKBOOKS_ENVIRONMENT` | `sandbox` or `production` |
   | `OAUTH_TOKEN_ENCRYPTION_KEY` | ≥ 32 bytes (hex/base64); tokens are AES-256-GCM encrypted per workspace |
   | `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN` | optional; unset → webhook rejects (503), CDC catch-up still runs |
   | `CRON_SECRET` | the existing daily scheduler cron also runs the QuickBooks catch-up sync |

5. Intuit go-live (external, not engineering): App Assessment questionnaire, security review,
   Launch URL and Disconnect URL. Suggested Launch URL: `<APP_URL>/owner/integrations`;
   Disconnect URL: `<APP_URL>/owner/integrations` (the page shows the disconnected state; a
   revoke at Intuit surfaces as "Reconnect QuickBooks" on the next token refresh).

## Architecture

Reuses the existing owner connector framework — no new connector framework:

| Concern | Where |
| --- | --- |
| Connector record | `OwnerConnector` (provider `QUICKBOOKS`, one per workspace, bound to one OwnerBusiness) |
| Tokens | `OwnerConnectorToken` (encrypted via `oauth-token.service`), CAS `version` + refresh lease |
| OAuth | `qbo-oauth.service` (provider calls), `qbo-connection.service` (connect / callback / disconnect / status DTO) |
| Provider adapter | `qbo-client` (native fetch; retries; Retry-After; requestid-stable write retries) + `src/domain/quickbooks/*` |
| Jobs | existing durable `ScheduledTask` scheduler, task `quickbooks-sync`; `processTaskById` drains a just-enqueued task after the response |
| Mirror / identity / provenance | `OwnerConnectorRecord` (remote id, SyncToken, remote update time, ingest time, sync run, OpsIQ link) |
| Write idempotency | `OwnerConnectorWrite` ledger (unique per workspace + key; deterministic QBO `requestid`) |
| Re-evaluation | `ingestIntegrationEvent` → BusinessConditionProfile / intervention re-evaluation |
| Audit | `quickbooks.*` audit events for every mutation |

Routes: `GET/POST /api/owner/integrations/quickbooks` (status, connect, sync, disconnect),
`GET /api/owner/integrations/quickbooks/callback`, `GET/POST /api/owner/integrations/quickbooks/actions`,
`POST /api/webhooks/quickbooks` (signed). Owner routes use `OWNER_VIEW` / `OWNER_MANAGE` with
server-verified workspace; the webhook is authorized only by Intuit's signature.

## Security properties

- OAuth `state`: 32 random bytes, stored only as SHA-256, bound to actor + workspace + business
  + expiry (10 min), consumed once by compare-and-set; replayed / foreign / expired / other-actor
  callbacks are rejected. `realmId` is recorded only after state and code exchange both succeed.
- Tokens never appear in responses, logs, audit payloads or error text. Refresh tokens rotate and
  are persisted atomically with a version bump; concurrent refreshes are serialized by a DB lease.
  `invalid_grant` or an expired refresh token → `REFRESH_FAILED` → owner sees Reconnect.
- Disconnect revokes at Intuit (best effort) and always deletes the token row.
- Webhook: `base64(HMAC-SHA256(verifierToken, rawBody))` compared in constant time; payload is a
  trigger only; each notified realm routes only to connectors already bound to it; deliveries are
  de-duplicated by event id through the scheduler's idempotency key.

## Sync

- Initial: paginated `SELECT … ORDERBY Id STARTPOSITION n MAXRESULTS 1000` per entity, reference
  data first; the cursor advances in the same transaction as the page upsert; bounded by a time
  budget with continuation tasks.
- Incremental: CDC since the last cursor (−5 min skew); > 29 days old → full re-sync; truncated
  CDC entities fall back to paginated `LastUpdatedTime` queries; deletions mark `DELETED` (rows are
  never removed); older remote versions never overwrite newer ones.
- Triggers: after connect (initial), Sync Now, signed webhook, daily cron catch-up.
- Reports (last complete calendar month): P&L (accrual), Balance Sheet, Cash Flow, Trial Balance,
  A/R and A/P aging. Materialized through the canonical finance/cashflow snapshot services only
  when the business currency equals the QBO home currency; an owner-entered snapshot is never
  touched. `fixedCosts`/`variableCosts` are **not** derived (QBO does not classify operating
  expenses as fixed vs variable; OpsIQ does not guess).

## Entity capability matrix

| Entity | Read/sync | Create | Update | Delete | Void | Inactivate | Product trigger |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CompanyInfo, Preferences | read each sync | – | – | – | – | – | – |
| Account | ✓ | adapter¹ | adapter¹ | – | – | adapter¹ | expense-account picker |
| Customer | ✓ | ✓ | ✓ (sparse) | – | – | ✓ | Customer push / inactivate |
| Vendor | ✓ | ✓ | ✓ (sparse) | – | – | ✓ | Vendor push / inactivate |
| Item, Class, Department, Term, PaymentMethod | ✓ | adapter | adapter | – | – | adapter¹ | – |
| Estimate, Invoice, SalesReceipt, CreditMemo, RefundReceipt¹ | ✓ | adapter | adapter | adapter¹ | Invoice (`operation=void`), SalesReceipt (`include=void`)¹ | – | – |
| Payment¹ | ✓ | adapter¹ | adapter¹ | adapter¹ | `include=void`¹ | – | – |
| PurchaseOrder | ✓ | ✓ | adapter | adapter¹ | – | – | approved PO push |
| Bill | ✓ | ✓ | adapter | adapter¹ | – (not voidable) | – | bill for delivered PO |
| BillPayment¹ | ✓ | adapter¹ | adapter¹ | adapter¹ | `include=void`¹ | – | – |
| Purchase¹, VendorCredit, Deposit¹, Transfer¹, JournalEntry¹ | ✓ | adapter | adapter | adapter¹ | – | – | – |

"adapter" = supported by the governed write engine (`executeGovernedQboWrite`) with validation,
idempotency, SyncToken and audit, but not exposed as an owner UI action (no OpsIQ workflow needs
it). ¹ = high-risk: requires explicit confirmation on every call.
Excluded (documented in `qbo-entities.ts`): TaxCode/TaxRate/TaxAgency, Budget, Employee,
TimeActivity, Attachable, Batch API.

## Governed writes

Browsers never send QuickBooks JSON. An owner action names an OpsIQ record; the server builds
the QBO body from the governed record and runs it through `executeGovernedQboWrite`:
entity semantics → confirmation → accounting validation (balanced journal entries in integer
cents, active references, home currency / exchange rate, line totals) → durable ledger with a
deterministic `requestid` (a retry after a lost response returns the original record, never a
duplicate) → fresh read and SyncToken conflict detection (never overwrites a field changed in
QuickBooks since the last sync; destructive operations refuse any unseen remote change) →
audit → mirror/provenance update. Intent-derived keys (e.g. one bill per purchase order) make
duplicates impossible by construction; a request that QuickBooks definitively rejected can be
retried after correction under a new `requestid`.

## Known limitations

- One QuickBooks company per workspace (existing `OwnerConnector` uniqueness); a workspace with
  several OpsIQ businesses binds QuickBooks to one of them.
- QBO data is materialized into OpsIQ snapshots for the last complete month only; customer and
  vendor master data stay in the mirror (they are not bulk-imported into CustomerRecord /
  VendorRecord — pushes and exact-name links connect them).
- Cashflow snapshots have no amendment path in OpsIQ, so a period already materialized is not
  updated by later syncs (reported as a sync issue).
- The platform cron is daily; Sync Now, post-connect and webhook-triggered syncs run immediately.
- A governed write whose outcome was ever ambiguous (timeout or lost response) keeps its
  provider requestid for every later retry, so QuickBooks' requestid de-duplication returns a
  record it already committed instead of creating a second one. There is no content-based
  reconciliation beyond that: a retry sent after Intuit's de-duplication window has elapsed
  relies on the pre-write checks (links, exact-name matching) rather than a remote natural-key
  lookup. A retry with a corrected payload under a pinned requestid may return the original
  committed record unchanged; correct it with a follow-up update.
- A sync task that ends in a non-retryable failure is finalized as scheduler status `failed`
  (with the owner-facing reason on the connector); such tasks are not listed in the generic
  automation status view.
- Sandbox E2E not executed (no credentials). Intuit production approval not started.
