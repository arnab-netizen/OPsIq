# QuickBooks Online V1 — Intuit Sandbox acceptance runbook

Status of the automated proof: everything below the Intuit boundary is proven on real Postgres with a fake Intuit
(`src/__tests__/services/quickbooks/*.db.test.ts`) and in a real browser (`tests/browser/59-quickbooks-connection.spec.ts`).
What no automated run in this repository can prove is **Intuit's real behaviour**. That needs two things the build environment does
not have: network access to Intuit hosts and Sandbox credentials/authorization. This runbook is the minimum owner action.

`BLOCKED_ONLY_ON_INTUIT_SANDBOX_AUTHORIZATION`

## 0. Prerequisites (names only — never paste values anywhere)
Server config on a **preview/staging** deployment (NOT production), pointing at a disposable database:
`QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_REDIRECT_URI` (= `https://<preview-host>/owner/integrations/quickbooks/callback` — the callback PAGE, not the
`/api/...` route that earlier branches' Preview configuration registered; this exact URI must be registered in the Intuit developer portal), `QUICKBOOKS_ENVIRONMENT=sandbox`, `OAUTH_TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`,
`QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN` (only for step 9). Apply the migration `20261024090000_qbo_v1_sync_evidence_provenance` to that database.
Use an Intuit **Sandbox company** (not a real company). A Sandbox company holds invented data and the server only lets it attach to a
**test business** (`isFixtureBusiness = true`): Connect is refused for a real business (and the card explains why), and a production
deployment refuses a test business. Owners cannot see test businesses in the UI, so on the **disposable acceptance database** an
operator marks one business (`UPDATE owner_businesses SET is_fixture_business = true WHERE id = '<acceptance business>'`) before connecting.
The branch-scoped Preview configuration must be created for THIS PR's branch (earlier branches' configuration does not apply).

Preview-specific facts (verified against the project configuration and code):
- The project enforces **Vercel Authentication on all Preview deployments**. The owner's browser (signed in to Vercel) can use the Preview, so the OAuth round trip works; a server-to-server call such as Intuit's **webhook cannot** reach a Preview unless a Vercel protection-bypass secret is added to the URL — which is why webhooks (step 8) are optional and deferred.
- **Vercel cron does not run on Preview deployments.** There is no daily tick: syncs run from the post-connect hand-off and from `POST /api/owner/integrations/quickbooks/sync` (the "Refresh now" action). Steps below that say "cron tick" mean this call.
- The Preview needs its **own isolated database holding the complete schema** (`prisma migrate deploy` from empty: all migrations through `20261024090000_qbo_v1_sync_evidence_provenance`) and must never point at production.
- `OAUTH_TOKEN_ENCRYPTION_KEY` is a fresh Preview-only key: `openssl rand -base64 32` (must decode to at least 32 bytes). Enter it only in the Vercel dashboard as a Sensitive variable; never paste it into chat or a commit.

## 1. Connect / callback / encryption / realm binding
**A test business is hidden from the owner UI by design** (`listBusinesses` never returns `isFixtureBusiness = true` rows), so there is no
"Connect QuickBooks" button for it. The acceptance path therefore drives the same governed API the button calls, in the signed-in browser
session on the Preview:
1. As the owner, open the Preview and sign in. Create the acceptance business (any ordinary flow), note its id, and mark it a test business on the
   disposable database only: `UPDATE owner_businesses SET is_fixture_business = true WHERE id = '<id>';`
2. In the browser console on the Preview origin: `fetch('/api/owner/integrations/quickbooks/connect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({businessId:'<id>',environment:'sandbox'})}).then(r=>r.json())` → open the returned `authorizationUrl` and authorize the Sandbox company.
3. Intuit redirects to the registered callback PAGE, which completes the connection and lands on My Business. (My Business shows the owner's *visible*
   businesses, so confirm the result with `GET /api/owner/integrations/quickbooks/status?businessId=<id>` and the DB.)
Expect status `CONNECTING` then `IMPORTING`. Verify in the DB: `qbo_connections` has one ACTIVE row with the Sandbox realm; `qbo_connection_tokens` ciphertext starts `v1gcm.`.

## 2. Four reports — the REAL 2026 shape (captured and verified: see "Acceptance result")
Run the first sync (it starts after the connection is made; to repeat, `POST /api/owner/integrations/quickbooks/sync` with `{businessId}` — Preview has no cron tick). Expect `qbo_report_snapshots` rows for PROFIT_AND_LOSS, BALANCE_SHEET,
AGED_RECEIVABLES, AGED_PAYABLES with `currency`, `accounting_basis` (`basis_source = REPORT_HEADER`), non-null `values.v` totals.
If any month shows `last_error_code = REPORT_*`, the real response differs from the parser's structural assumptions:
capture that report's JSON (GET `…/reports/<Name>?…` with a Sandbox token), **sanitize** (no names/ids), add it to
`src/__tests__/fixtures/qbo/` and make the parser test pass before enabling production.
Try the same company with `testing_migration=true` appended to a report request to compare old/new service output (per Intuit's 2026 notice).

## 3. Idempotency / versioning
Trigger **Refresh now** twice: second run only increments `confirm_count`; no new `owner_financial_snapshots` version.
Edit a closed month's data in the Sandbox company, refresh: `qbo_report_snapshots` gets version 2 and the Finance snapshot is amended
(v1 superseded), with a provenance row `AMENDED`.

## 4. Token refresh
Force `access_token_expires_at` in the past (disposable DB only) and refresh: one refresh call, `revision` +1, still ACTIVE.
Revoke the app's access from Intuit's side (My Apps) and refresh: connection becomes `REAUTH_REQUIRED`; UI shows "Reconnect needed".

## 5. Disconnect / reconnect
Disconnect (confirm) → Intuit should show the grant revoked; local tokens deleted; history kept. Reconnect the same company → same connection row.

## 6. Isolation
Try to connect the Sandbox company to a **real** (non-fixture) business: Connect is not offered (the card says a Sandbox company can only be connected to a test business) and a direct `POST /api/owner/integrations/quickbooks/connect` is refused with a `ValidationError`; nothing is created. Defence in depth: if a connection ever sat on a business that stopped being a test business, materialization still refuses every month (`SANDBOX_ISOLATION`) and a database trigger rejects the provenance row.

## 7. Stale analysis
After a QuickBooks refresh changes a figure, the Money page shows newer figures and **no diagnosis is run automatically**; re-run analysis manually.

## 8. Webhook (optional; needs a protection bypass on Preview)
The Preview is behind Vercel Authentication, so Intuit's server cannot reach it unless the project's "Protection Bypass for Automation" secret is appended to the URL as `?x-vercel-protection-bypass=<secret>` (a project-level setting change — owner decision). Without that, skip this step. Register `https://<preview-host>/api/webhooks/quickbooks` for the Sandbox app and set the verifier token. Change a Sandbox invoice:
expect `qbo_sync_state.webhook_pending_at` set and one `qbo-sync` task with key `qbo-sync:<id>:wh:<marker arming instant, epoch ms>`. Record the payload format
Intuit actually sends (legacy `eventNotifications` vs CloudEvents) and its signature header; adjust `qbo-webhook.ts` if the field names differ.

## 9. Production enablement (separate, owner-authorized step)
Apply the migration to production through the owner-approved workflow, set the production values of the names in §0 (with
`QUICKBOOKS_ENVIRONMENT=production`), register the production redirect URI/webhook, deploy. Nothing in this PR does any of that.

## Addendum: findings from the first real Sandbox run (Oct 2026)

These corrections come from a real Intuit Sandbox acceptance run on an isolated Preview + database.

### Preview scheduling: what actually runs
- Vercel Cron does not run on Preview deployments, so the daily producer never ticks there on its own.
- "Refresh now" (`POST /api/owner/integrations/quickbooks/sync`) enqueues an owner task. On the verified build it was also picked up and run within seconds of the request, so a Refresh now alone proved a sync on Preview. Do not rely on that alone as proof of the scheduler.
- Owner Refresh now is de-duplicated per 5-minute window (`...:owner:<bucket>`); a second click inside the window returns `alreadyRequested: true` and does no work.
- A signed webhook only records a pending task (`...:wh:<ts>`, trigger WEBHOOK). It is drained only when the canonical scheduler route runs.
- To prove the scheduler on Preview, call the canonical route `GET /api/internal/cron/scheduler` with `Authorization: Bearer <CRON_SECRET>`. Use a Preview-only, branch-scoped, Sensitive `CRON_SECRET` generated fresh for the run; never reuse the Production value. Never put it in a URL, screenshot, log or chat. Redeploy after adding it (env is snapshotted per deployment).
- The route fails closed: no header or a wrong secret returns 401.
- After the run, delete the variable AND redeploy; deleting alone does not stop the already-running deployment from honouring it. Then confirm the old secret returns 401.

### Fresh-database bootstrap (invite-only signup)
- A fresh database has no `beta_requests` rows, so signup is refused ("Beta registration isn't available"). Do not open the whole Preview to public beta.
- Seed exactly one `beta_requests` row for the acceptance email: `status='INVITED'`, `invited_at=now()`, `invited_by` an operator-bootstrap label. The table has no DB defaults for `id` or `updated_at`; supply them.
- Verification email needs `RESEND_API_KEY` (branch-scoped), optionally `ALERT_FROM_EMAIL` (default `alerts@opsiq.app`; the sending domain must be verified in Resend) and `NEXT_PUBLIC_APP_URL` set to the public Preview alias, otherwise the link is not usable (`BASE_URL_NOT_PUBLIC`).
- Adding a branch-scoped variable through the dashboard dialog can also create an all-Preview duplicate; check for and remove strays.

### Sandbox facts to expect
- The test business is hidden from the owner UI by design, so connected/stale/error states for it must be observed through `GET .../quickbooks/status?businessId=` and the database, not the owner screens.
- The consent link expires after about 10 minutes; an expired link is refused with a clear message and the flow can simply be restarted.
- Intuit reuses an existing grant, so a reconnect may complete without showing the consent screen.
- If the portal toggle "Enable cloud event payload format" is on, webhooks arrive in CloudEvents format.
- Reports for months with no Sandbox activity can legitimately return no data; unavailable canonical fields are stored as NULL and listed as missing, never as zero.


## Acceptance result — real Intuit Sandbox run COMPLETED (25 Oct 2026): PASS

Accepted PR head for the Sandbox run: `bb4e52f52f7193d8660007c22dc782c10d7946db`. This replaces every earlier "Not proven" /
"unverified" statement about real Sandbox behaviour. **No Production authorization is implied** (see the last subsection).

Evidence (real Intuit Sandbox company, Preview deployment of this branch, throwaway Sandbox database; no Production resource touched):

- Real OAuth connect/callback, encrypted token storage, realm binding and refresh-token rotation: PASS.
- Four real reports (P&L, Balance Sheet, A/R aging, A/P aging) x 12 closed months, parsed and materialized with provenance: PASS.
- Idempotent re-sync (observations confirmed, not duplicated) and backdated-change versioning (new version, old one kept): PASS.
- Missing is not zero; owner-controlled (manual) figures win over QuickBooks observations (manual-first), owner-edit precedence: PASS.
- Stale analysis: refreshed figures mark the existing analysis out of date and never re-run it automatically: PASS.
- Real signed webhook, and missed-webhook reconciliation by the scheduler drain: PASS.
- Disconnect (refresh token revoked at Intuit, history kept) and reconnect of the same company: PASS. A second binding of the same
  company is refused (`REALM_ALREADY_BOUND`) — intended isolation.
- Read-only: no accounting write-back path exists (GET reports only; the only POSTs are OAuth token calls): PASS.
- Connected-state phone layout, canonical real-browser spec `tests/browser/59-quickbooks-connection.spec.ts` at 390x800
  (no horizontal overflow, Refresh/Disconnect >= 40 px tall, no serious/critical axe violations): non-Sandbox config
  6 passed / 1 expected skip; Sandbox config 1 passed / 6 expected skips. The Sandbox fixture business is hidden from the owner UI
  by design, so the connected card is exercised through the spec's own connection-state setup, not the hidden fixture.

### Initial/refresh "60 s timeout" investigation

Observed: Vercel runtime logs showed `Task timed out after 60 seconds` on the OAuth callback and Refresh-now routes. Finding:
the entries are not caused by the import. The callback/Refresh routes persist a `qbo-sync` ScheduledTask and answer in well under a
second (logged 0.24-0.84 s); the work runs after the response through the same scheduler. Every qbo-sync task in the Sandbox
database completed in 5-8 s on attempt 1 (no retries, no dead letters). The same timeout entry was also logged for a callback that
failed in 841 ms with no import at all, and for Production `GET /` (300 s) — it is a cold-start invocation-lifetime effect that is
not specific to QuickBooks and is tracked separately. Hardening made here: the after-response accelerator
(`processQboSyncChain`) no longer starts a continuation pass it could not finish inside its 50 s budget (the durable continuation
task already exists, so nothing is lost); unit-tested. Residual operational note: the Vercel cron drain is daily (03:00 UTC), so a
very large first import relies on the accelerator plus the owner's Refresh to progress faster than one drain a day.

### Findings recorded as non-blocking
- Refresh API on a disconnected connection answers 404 (API only). The card hides Refresh when disconnected and maps any failure
  to an owner-safe message; no raw text reaches the UI. Follow-up P3: return a clean typed error.
- The 20 px-tall transient "Dismiss" text button is not covered by the repository's launch-path 44 px rule or by this spec. P3.
- `scripts/seed-e2e-owner.ts` hardcoded INR for a USD business; fixed to derive the currency from the seeded business.

### What Sandbox acceptance does NOT authorize
Merge, the Production database migration (`20261024090000_qbo_v1_sync_evidence_provenance`, run only through the owner-approved
`migrate-production` workflow, before the merge because the Production build gate fails on an unapplied migration), Production
Intuit credentials / redirect / webhook configuration, or enabling QuickBooks in Production. Intuit's Production credentials are
unlocked only after the app-details and compliance steps in the Intuit developer portal are complete.
