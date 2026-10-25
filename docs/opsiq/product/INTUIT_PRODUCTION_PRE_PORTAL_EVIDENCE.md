# Intuit Production approval: pre-portal evidence pack

Status: DRAFT for owner review. Prepared 2026-10-25 from main 98f73d926f5fc2d3078b94df0947331e09d81f12.
Nothing here enables QuickBooks in Production. LEGAL_TEXT_CHANGE_REQUIRES_OWNER_REVIEW=YES.

## 1. Customer-facing QBO route and Intuit URLs

QBO_OWNER_UI_ROUTE=/owner/data (QuickBooksConnectionCard: status, Connect/Reconnect, Refresh now, Disconnect with confirm, importing and error states).
Registered OAuth redirect URI (the PAGE that forwards to the session-authenticated callback API, not the API route):
PRODUCTION_REDIRECT_URI=https://opsiq.solutions/owner/integrations/quickbooks/callback

| Intuit field | Proposed value | Note |
|---|---|---|
| Host domain | opsiq.solutions | |
| Launch URL | https://opsiq.solutions/owner/data | Signed-out visitors are sent to sign-in first. |
| Connect/Reconnect URL | https://opsiq.solutions/owner/data | Connect button lives there. API routes are POST-only and are not customer URLs. |
| Disconnect URL | https://opsiq.solutions/owner/data | Disconnect and reconnect on the same page. For App Store listing Intuit expects a page telling the user the connection ended and how to reconnect. That listing is not needed for the current goal. |
| EULA | https://opsiq.solutions/terms | |
| Privacy | https://opsiq.solutions/privacy | |
| Support | https://opsiq.solutions/support (new, in this change) | |

## 2. Data retention and deletion truth

QBO_DATA_RETENTION_BEHAVIOR:
- Disconnect (qbo-lifecycle.service.ts): revokes the grant at Intuit first (bounded, best effort), then locally disconnects regardless of the revoke outcome. It deletes the stored token ciphertext, makes the connection ineligible for scheduler and webhooks, and KEEPS the connection row, sync state, observations and provenance. A failed revoke is audited as qbo.revocation_failed and the owner is told.
- Report snapshots (qbo_report_snapshots): DB trigger blocks UPDATE and DELETE (immutable evidence).
- Canonical provenance (qbo_canonical_provenance): DB trigger blocks UPDATE and DELETE (append-only).
- No explicit retention period or expiry job exists for QBO data.
- Account/data deletion: the PrivacyRequest API (ACCESS, DELETION, CORRECTION) only records a request. docs/PRIVACY_REQUEST_RUNBOOK.md says there is no safe automated cascade deletion; deletion is a manual, ops-run operation, and it does not mention QuickBooks.
- Consequence: QBO-derived history cannot be deleted through the product, and the guard triggers would also stop a plain DELETE. It would need a reviewed manual database operation that has not been written or exercised.
- Intuit Data Stewardship Principles (developer.intuit.com) say the privacy policy must specify retention and deletion practices. The amended /privacy states them as above and does not promise self-service deletion.
- CLASSIFICATION: customer deletion capability for QBO-derived data is a GAP and a potential Production-approval blocker until the owner decides: build an audited erasure path, or accept the documented manual limitation.

## 3. Evidence pack (CLAIM / EVIDENCE / STATUS)

| Claim | Evidence | Status |
|---|---|---|
| HTTPS only | Production serves https://opsiq.solutions; redirect validator accepts only https (http only for sandbox localhost) in qbo-config.ts | VERIFIED. TLS version policy UNVERIFIED |
| OAuth 2.0 authorization code | qbo-oauth.service.ts; one-time state; realm binding; sandbox acceptance runbook records connect/callback and refresh rotation PASS | VERIFIED (Sandbox) |
| Minimal scope | Only com.intuit.quickbooks.accounting (no payments, payroll, OpenID) in qbo-config.ts | VERIFIED |
| Token encryption at rest | AES-256-GCM in oauth-token.service.ts | VERIFIED |
| Encryption key handling | OAUTH_TOKEN_ENCRYPTION_KEY from env; present only on Preview branches; absent in Production | VERIFIED (absent by design). Rotation procedure UNVERIFIED |
| Tenant isolation | workspace_id composite foreign keys on all qbo_* tables; environment-isolation trigger keeps Sandbox evidence out of real businesses | VERIFIED in schema. Independent test UNVERIFIED |
| Authorization/RBAC | QBO routes require OWNER_MANAGE capability, a workspace, and a user actor | VERIFIED |
| Webhook HMAC | verifyIntuitSignature with verifier token; Production POST unsigned = 401, bad signature = 401 (tested 2026-10-25) | VERIFIED. Signed Production path UNVERIFIED (token intentionally not set) |
| Async webhook processing | Handler checks size, signature, parses, marks webhookPendingAt and enqueues an idempotent task; no Intuit API call, no report sync | VERIFIED by code |
| Durable retry/reconciliation | ScheduledTask lease, 3 retries with 60/300/900 s backoff, resumable cursor, per-connection DB lock; unattended drain currently runs daily only | VERIFIED in code. Cadence GAP (section 4) |
| Audit events | emitAuditEvent used; qbo.revocation_failed confirmed; complete event list not enumerated in this pass | PARTIAL |
| Secret redaction | redactSecrets in infra/telemetry-sanitizer.ts; privacy page states Sentry scrubs cookies, auth headers, bodies | VERIFIED (code) |
| No write-back | Only report reads; Intuit offers one accounting scope that is read/write-capable, so read-only is enforced by OpsIQ code, not by the scope | VERIFIED by code |
| Database hosting | Neon Postgres, us-east-2 | VERIFIED |
| App hosting | Vercel Pro team, project o-ps-iq, region iad1 | VERIFIED |
| No third-party AI sees QBO data | No OPENAI or ANTHROPIC key in the Production project env, so the AI provider resolves to the deterministic fallback | VERIFIED (env listing). Re-check if a key is ever added |
| Monitoring | SENTRY_DSN present in Production env | VERIFIED present. Alert routing UNVERIFIED |
| Backup/recovery | Runbooks exist in docs (backup/restore, database backup recovery); Neon retention window and a restore test | UNVERIFIED |
| Dependency/vulnerability mgmt | .github/dependabot.yml exists; mvp-readiness workflow references scanning | PARTIAL (scan contents UNVERIFIED) |
| Incident response | docs/INCIDENT_RESPONSE_GUIDE.md exists | PARTIAL (never exercised, UNVERIFIED) |
| Retention/deletion | section 2 | GAP |

## 4. Cron cadence

VERCEL_PLAN=PRO (Billing page, active 21 Oct to 21 Nov 2026).
Current: daily 0 3 * * * to /api/internal/cron/scheduler (maxDuration 300, up to 25 drain passes per run).
- Webhook freshness: webhook tasks are keyed per arming instant and wait for the next drain. With a daily cron a real webhook could wait up to about 24 hours.
- Baseline continuation: the after() accelerator (50 s budget) usually finishes the work; if it stops, continuation tasks wait for the next drain (up to 24 hours per pass).
- Retry/backoff: 60/300/900 s are meaningless on a daily drain; three retries could take three days.
- Missed webhook reconciliation: the daily key gives one refresh per UTC day only if the cron fires.
RECOMMENDED_PRODUCTION_CRON_CADENCE=every 15 minutes (*/15 * * * *). Reason: the longest backoff is 900 s, so 15 minutes is the largest interval that does not stretch retries; hourly is the weakest acceptable floor for reconciliation only.
CURRENT_VERCEL_PLAN_SUPPORTS_CADENCE=YES (Pro). No plan upgrade needed.
Before changing: the scheduler is shared. Confirm the other task types are safe to drain every 15 minutes. NOT changed without owner authorization.

## 5. CDC

CDC_REQUIRED_FOR_OPSIQ_V1=NO. Intuit best practices (webhooks/best-practices) recommend a CDC call to compensate for missed events; this is a recommendation, not a stated certification requirement. OpsIQ does not mirror entities. It re-reads whole reports on webhook, owner refresh and daily schedule, so a missed event is healed by the next report refresh. This depends on the cron cadence fix in section 4.

## 6. Webhook precheck

PRODUCTION_WEBHOOK_CODE_READY=YES for intake design. Public (no auth barrier), POST only, 413 over size cap, unsigned and invalid signature 401, bad JSON and unrecognised payloads acknowledged 200 and ignored, only OpsIQ DB writes. The 3 s acknowledgement is met by design (a few indexed queries per realm); real latency of a signed request is UNVERIFIED until the verifier token exists. Intuit retries (10 s up to 6 h) and holds later events until an ack.

## 7. App name, logo, description

App name: OpsIQ.
INTUIT_LOGO_ASSET_READY=YES: docs/opsiq/product/intuit-assets/opsiq-intuit-app-logo-100x100.png (5.9 KB) and ...-512x512.png, derived from public/opsiq-mark.png (cropped, padded square on white). Portal size rule seen earlier (100x100 PNG/JPG up to 1 MB) to be re-confirmed in the portal. Not uploaded.
Short: OpsIQ helps small and mid-size service-business owners understand business performance and make operational decisions. With QuickBooks Online connected it reads selected financial reports (read-only) to power finance and cash-flow views.
Long: OpsIQ helps small and mid-size service-business owners understand business performance and make operational decisions. OpsIQ securely connects to QuickBooks Online and reads selected financial reports including Profit and Loss, Balance Sheet, Aged Receivables and Aged Payables. The data is used to populate OpsIQ financial and cash-flow views and provide decision-support context. The QuickBooks integration is read-only in this version: OpsIQ does not create, edit or delete accounting transactions in QuickBooks.

## 8. Owner decisions

1. Approve or edit the /privacy, /terms and /support text. The line "has not been reviewed by a lawyer" was left in place; remove it only after a lawyer reviews.
2. Decide the deletion gap (build erasure path vs accept documented limitation).
3. Authorize the cron change (*/15) separately.
4. Confirm the app name, upload the logo, sign in to Intuit and complete profile and attestations yourself.
