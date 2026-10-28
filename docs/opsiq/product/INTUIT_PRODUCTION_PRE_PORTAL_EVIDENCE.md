# Intuit Production approval: pre-portal evidence pack

Status: DRAFT for owner review. Prepared 2026-10-25 from main 98f73d926f5fc2d3078b94df0947331e09d81f12; updated 2026-10-28 from main a47b7be8e521677cafd1b869da81479d7b63d101 during the `opsiq_app` 24-hour observation window (branch work only — nothing here touched Production).
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

## 2. Data retention and deletion truth (updated 2026-10-28 — supersedes the 2026-10-25 version below the line)

**This section was stale.** The 2026-10-25 version (reproduced at the end of this section for the record) said QBO-derived history "cannot be deleted through the product" and "would need a reviewed manual database operation that has not been written or exercised." That was true against base `98f73d9`. PR #637 (`feat(privacy): governed QuickBooks/Intuit data erasure`) merged into main on 2026-10-28 and changed this. Current truth, read from `docs/opsiq/product/QBO_ERASURE_DESIGN.md` and the erasure services on main:

QBO_DATA_RETENTION_BEHAVIOR (unchanged from 2026-10-25):
- Disconnect (qbo-lifecycle.service.ts): revokes the grant at Intuit first (bounded, best effort), then locally disconnects regardless of the revoke outcome. It deletes the stored token ciphertext, makes the connection ineligible for scheduler and webhooks, and KEEPS the connection row, sync state, observations and provenance. A failed revoke is audited as `qbo.revocation_failed` and the owner is told.
- Report snapshots (`qbo_report_snapshots`) and canonical provenance (`qbo_canonical_provenance`): DB triggers block UPDATE and DELETE under the ordinary application role (immutable, append-only evidence). This is unchanged and intentional — erasure is a separate, narrower escape hatch, not a weakening of these guards.

QBO_DATA_ERASURE_CAPABILITY (new since 2026-10-25 — `NO_SELF_SERVICE_DELETE` is not `NO_DELETE_CAPABILITY`):
- A governed, operator-run erasure tool exists: `request -> dry-run (manifest hash, counts, blockers) -> approve (a second, different operator) -> execute (one transaction: revoke, lock, re-verify manifest, delete, scrub, tombstone, commit) -> verify`. It is CLI-only (no HTTP endpoint), reads `ERASURE_DATABASE_URL` (never `DATABASE_URL`), and a DELETE on guarded evidence is permitted only when the session is a member of `opsiq_privacy_eraser` (NOLOGIN) against an `EXECUTING` request approved by someone other than the requester — enforced by a DB-level CHECK/SECURITY DEFINER function, not application code alone.
- It is **not self-service** (no in-product button; two named operators, outside the product) and **not instant** (request/dry-run/approve/execute/verify is a multi-step, humans-in-the-loop process).
- Evidence: 10 hostile DB tests on a disposable PostgreSQL (full erasure, idempotency, unauthorized-attempt rejection, manifest-drift detection, a static registry test that fails if a new QBO-linked model is added without being classified). **Not yet run against Production** — Production prerequisites (below) are unmet.
- `GLOBAL_SECURE_DELETE` boundary: a database-only erasure is explicitly never reported as "complete." `DATABASE_ERASURE=PASS` with `GLOBAL_SECURE_DELETE=INCOMPLETE` is the honest state until every external copy is also attested: `GITHUB_BACKUP_ARTIFACTS`, `NEON_HISTORY_WINDOW`, `NEON_BRANCHES`, `OPERATOR_EXPORTS`.
- Production prerequisites still open (QBO_ERASURE_DESIGN.md §"Production prerequisites" and §"Hostile review"): apply the erasure migration and create `opsiq_privacy_eraser` through the governed migration workflow; grant it only to dedicated operator logins, never the app login; keep `ERASURE_DATABASE_URL` out of Vercel; separate explicit owner authorization per erasure request. The least-privilege `opsiq_app` runtime-role cutover this prerequisite depended on (PRs #644-#646) is now merged and in its 24-hour Production observation window (started 2026-10-28T13:33:41.348Z; +1h checkpoint PASS as of this writing) — the erasure role split itself has not yet been created on Production.
- **Current backup state is a live, separate blocker, not a privacy-copy problem**: the scheduled whole-database GitHub backup workflow (`scheduled-backup.yml`) is currently `disabled_manually` at the GitHub Actions level (confirmed live), its 35 pre-existing backup artifacts were deleted (0 remain, confirmed live), the repository remains **public** (confirmed live — `gh repo view` reports `visibility: PUBLIC`), and no durable, access-controlled replacement backup architecture exists yet. PR #642 (the fail-closed QBO backup gate for this same whole-DB-dump path) is audited and owner-review-ready but still **draft/unmerged**. Net effect: Production currently has **no backup mechanism at all** running. That is good for the `GITHUB_BACKUP_ARTIFACTS` erasure-domain checklist (nothing to purge) but bad for ordinary disaster recovery, and it must be resolved (either durably, or by re-enabling the schedule only after #642 merges) before QBO Production enablement, independent of the erasure-tool work.
- `NEON_HISTORY_WINDOW`: QBO_ERASURE_DESIGN.md records the owner decision that Production history retention should go to 0 seconds before the first QuickBooks connection; the last recorded observation (per the separate #642 audit, 2026-10-26) was `history_retention_seconds=21600` (6h, the Neon default), not yet changed to 0. Not re-queried against Neon in this pass (no Neon read tool authenticated in this session; re-verify before enabling QBO Production, not assumed here).
- Intuit Data Stewardship Principles (`developer.intuit.com/.../intuit-data-stewardship-principles`) require the privacy policy to specify retention and deletion practices and are consistent with this section; the exact "Securely Delete" definition text could not be retrieved from the live page in this pass (see §9) — the repo's own earlier, more thorough research pass recorded it as "permanent sanitisation so that the data is unrecoverable from any and all media," which this section's wording is written to satisfy, but it was not independently re-confirmed against the live page today.
- **CLASSIFICATION (updated)**: customer deletion capability for QBO-derived data is **no longer an unbuilt GAP** — a tested, governed, operator-run path exists. It remains a **Production-enablement blocker** until (a) the erasure role/migration is actually applied to Production, (b) `NEON_HISTORY_WINDOW` is set to 0 and verified, and (c) a durable backup replacement (or re-enabling the gated #642 workflow) resolves the current no-backup state. None of (a)-(c) were done in this pass.

<details><summary>2026-10-25 version (superseded, kept for the record)</summary>

QBO_DATA_RETENTION_BEHAVIOR:
- Disconnect (qbo-lifecycle.service.ts): revokes the grant at Intuit first (bounded, best effort), then locally disconnects regardless of the revoke outcome. It deletes the stored token ciphertext, makes the connection ineligible for scheduler and webhooks, and KEEPS the connection row, sync state, observations and provenance. A failed revoke is audited as qbo.revocation_failed and the owner is told.
- Report snapshots (qbo_report_snapshots): DB trigger blocks UPDATE and DELETE (immutable evidence).
- Canonical provenance (qbo_canonical_provenance): DB trigger blocks UPDATE and DELETE (append-only).
- No explicit retention period or expiry job exists for QBO data.
- Account/data deletion: the PrivacyRequest API (ACCESS, DELETION, CORRECTION) only records a request. docs/PRIVACY_REQUEST_RUNBOOK.md says there is no safe automated cascade deletion; deletion is a manual, ops-run operation, and it does not mention QuickBooks.
- Consequence: QBO-derived history cannot be deleted through the product, and the guard triggers would also stop a plain DELETE. It would need a reviewed manual database operation that has not been written or exercised.
- Intuit Data Stewardship Principles (developer.intuit.com) say the privacy policy must specify retention and deletion practices. The amended /privacy states them as above and does not promise self-service deletion.
- CLASSIFICATION: customer deletion capability for QBO-derived data is a GAP and a potential Production-approval blocker until the owner decides: build an audited erasure path, or accept the documented manual limitation.

</details>

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
| Retention/deletion | section 2 | PARTIAL (tested erasure CAPABILITY exists via #637; not self-service, not yet run on Production; Production prerequisites and backup-domain blockers still open) |

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
2. ~~Decide the deletion gap~~ — superseded: a tested erasure capability exists (#637). Remaining decision is narrower: authorize applying its Production prerequisites (role/migration, `ERASURE_DATABASE_URL` custody) and the Neon history-window change to 0.
3. Authorize the cron change (*/15) separately.
4. Confirm the app name, upload the logo, sign in to Intuit and complete profile and attestations yourself.
5. Decide the Production backup replacement (durable private architecture, vs. re-enabling `scheduled-backup.yml` only once #642 merges) before QBO Production enablement.

## 9. Current Intuit requirements research (2026-10-28, web search + direct source pages; access date noted per item)

Researched live, not assumed from old repo notes. Full page text could not be rendered by the fetch tool used (JS-rendered docs site returned only a truncated shell); findings below are from search-result summaries of developer.intuit.com's own pages, corroborated against this repo's existing, more thorough citations where both exist. Treat items marked "not independently re-confirmed" as needing a direct portal check before relying on them for submission.

| Topic | Current finding | Source | Access date |
|---|---|---|---|
| Developer Terms of Service | Current version dated 2025-10-14; binding on acceptance; app-partner-program tiers (e.g. Silver) now carry platform service fees | developer.intuit.com/.../intuit-terms-of-service-for-intuit-developer-services | 2026-10-28 |
| Data Stewardship Principles | Confirmed to exist at the cited URL as "Exhibit A"; apps must use user data only for the app's stated purpose; explanations to customers must be clear and straightforward. Exact "Securely Delete" defined-terms text not independently re-confirmed today (JS-rendered page; not re-fetched successfully) — repo's existing citation (QBO_ERASURE_DESIGN.md: "permanent sanitisation... unrecoverable from any and all media") is prior art, not re-verified in this pass | developer.intuit.com/.../intuit-data-stewardship-principles | 2026-10-28 |
| Consent revocation / cessation of processing | General principle confirmed consistent with repo's framing: app must stop processing on revocation; past lawful processing isn't retroactively affected by withdrawal | search summary, developer.intuit.com + Intuit privacy statement secondary sources | 2026-10-28 |
| Secure deletion exceptions | Deletion requests are subject to legal/regulatory retention, fraud-prevention, and legal-defense exceptions (consistent with this repo's `RETAIN (legal / integrity)` classification for the tombstone/audit trail) | secondary summary of Intuit Privacy Statement | 2026-10-28 |
| Production assessment questionnaire | Required for production client ID/secret, app-specific, per-app resubmission required, covers legal/technical/security, ~30-40 min, partial-save supported; annual security reassessment required after go-live | developer.intuit.com go-live/publish-app docs (via search summary) | 2026-10-28 |
| Marketplace listing vs. production access | Distinct: the assessment/production-key path does not require App Store listing; listing adds its own marketing/logo/copy review on top | developer.intuit.com/list-on-the-app-store (via search summary) | 2026-10-28 |
| Required URLs/pages | Privacy policy and Terms must be public, not behind login; a working Support contact must be shown; app settings require host domain, Launch URL, and a dedicated Disconnect URL (where the user lands after disconnecting) | developer.intuit.com marketing-requirements / app-settings (via search summary) | 2026-10-28 |
| App logo/naming | Must follow Intuit's naming/logo guidelines; Intuit's own mark may only be used to show interoperability, not implied endorsement | developer.intuit.com marketing-requirements (via search summary) | 2026-10-28 |
| OAuth token handling | Not separately re-researched this pass beyond the general Stewardship Principles; this repo's existing code-level evidence (AES-256-GCM, workspace-bound HKDF key, server-only) was independently re-verified against current `qbo-oauth.service.ts`/`qbo-connection.service.ts` in Phase 1/3 of this pass, not re-derived from an Intuit source | code read, this pass | 2026-10-28 |

**New finding not previously in this doc**: Intuit app settings require a distinct, registered **Disconnect URL** (separate portal field from Launch/Connect URL) — "where users land after they disconnect." Section 1's table already lists one (`https://opsiq.solutions/owner/data`, same page as connect) with a note that it is not a dedicated post-disconnect landing page; confirm in the actual portal form whether that reuse is accepted or whether a dedicated page is required before submission.

## 10. Production-enablement requirement matrix (Phase 5)

Statuses: PASS / BLOCKED / OWNER_ACTION_REQUIRED / LEGAL_REVIEW_REQUIRED / NOT_APPLICABLE / UNKNOWN. No false-green statuses — a requirement is PASS only when its evidence is current-main code or a live, confirmed configuration check, not an aspiration.

| REQUIREMENT | CURRENT EVIDENCE | STATUS | BLOCKER | NEXT ACTION |
|---|---|---|---|---|
| Legal copy matches shipped behavior (privacy/terms/support) | Phase 1-3 of this pass: all QBO statements re-verified against current code (4 reports, AES-256-GCM, 3 refresh triggers, disconnect semantics, erasure reality); 1 stale overclaim found and fixed in this PR | PASS | none | owner legal review of the amended text |
| Legal copy not yet lawyer-reviewed | "has not been reviewed by a lawyer" disclaimer intentionally kept | LEGAL_REVIEW_REQUIRED | owner has not engaged counsel | owner decides whether/when to engage counsel; do not remove the disclaimer first |
| Governed QBO erasure capability exists and is tested | QBO_ERASURE_DESIGN.md + 10 hostile DB tests, disposable PG only (#637, merged) | PASS (capability) / BLOCKED (Production execution) | not yet applied to Production; `opsiq_privacy_eraser` role not created on Production; `ERASURE_DATABASE_URL` custody not yet set up | owner-authorized Production rollout of the erasure migration and role, separate from this PR |
| Least-privilege runtime role (`opsiq_app`) | Merged (#644-#646); live in Production as of this pass, in its 24h observation window, +1h checkpoint PASS | PASS (merged) / OWNER_ACTION_REQUIRED (window not yet closed) | observation window must close clean before treating the cutover as settled | wait for 24h window to close; do not start further Production-adjacent changes until it does |
| Fail-closed QBO backup gate (#642) | Audited, rebased, all local+CI gates green, still draft/unmerged | BLOCKED (by design — DO NOT MERGE during observation window) | owner authorization + observation window closure | owner merges #642 only after window closes and with explicit authorization at an exact SHA |
| Durable Production backup mechanism | Scheduled whole-DB backup workflow `disabled_manually`; 0 artifacts exist; no replacement architecture implemented | BLOCKED | no backup mechanism currently running at all | owner decides: durable private/encrypted replacement, or re-enable `scheduled-backup.yml` only after #642 merges |
| Repository visibility | `gh repo view` confirms PUBLIC | BLOCKED (for any future whole-DB GitHub-artifact backup) | public repo + whole-DB artifact = public-repo exposure risk (flagged separately in the #642 audit) | owner decides repo visibility or abandons GitHub-artifact backups entirely in favor of another target |
| Neon history retention = 0 before first QBO connection | Last recorded observation (2026-10-26, via #642 audit): 21600s (6h), not yet changed | BLOCKED | history window stays a `GLOBAL_SECURE_DELETE` deletion domain until set to 0 and verified | owner sets and verifies `history_retention_seconds=0` on Production, separately authorized (observation-window boundary explicitly forbids Neon changes right now) |
| Neon branches/snapshots policy | Documented (QBO_ERASURE_DESIGN.md "Branch policy") | NOT_APPLICABLE YET | no QBO data exists in Production yet, so no branch/snapshot currently holds any | re-check at the time QBO is actually enabled |
| Intuit production assessment questionnaire | Not started (owner-only action, outside this repo) | OWNER_ACTION_REQUIRED | requires an Intuit portal login and business attestations only the owner can make | owner completes it when ready; this PR does not touch the portal |
| Production OAuth credentials / redirect URI | Redirect URI documented (§1); no Production client ID/secret provisioned (by design — QBO Production disabled) | OWNER_ACTION_REQUIRED | credentials are issued only after the assessment questionnaire | owner requests production keys after questionnaire approval |
| Required portal URLs (privacy/terms/support/launch/connect/disconnect) | All five pages exist and are live-rendering (verified in Phase 9 of this pass); disconnect URL reuses the connect page (see §9 new finding) | PASS (pages exist) / UNKNOWN (portal's exact disconnect-URL acceptance) | none blocking today | confirm the disconnect-URL field's exact requirement directly in the portal before submission |
| App logo | Two sizes prepared, not uploaded (no portal session) | OWNER_ACTION_REQUIRED | requires Intuit portal access | owner uploads during the actual portal session |
| Security questionnaire / evidence | Evidence pack exists (§3); several rows UNVERIFIED/PARTIAL (TLS version policy, key-rotation procedure, alert routing, backup/recovery runbook exercised, dependency-scan contents, incident-response drill) | PARTIAL | several evidence rows are UNVERIFIED, not failing, just not independently proven in this pass | close each UNVERIFIED row with real evidence before submission; do not represent them as verified |
| Data-sale / third-party-sharing clause | Code-level verdict clean (QBO_ERASURE_DESIGN.md "Data-sale boundary"); exact Intuit clause text not retrievable programmatically | LEGAL_REVIEW_REQUIRED | owner/counsel must confirm the clause and vendor contracts before a public statement is made | owner confirms before any public "we do not sell data" representation tied to Intuit's specific clause |

## 11. Production-enablement blocker checklist (Phase 6 — none enabled or configured in this pass)

1. **#636 legal/support pages** — now accurate against current code (this pass); still needs owner legal review and sign-off.
2. **#637 governed erasure** — capability built and tested on disposable DB only; not yet applied to Production (role, migration, `ERASURE_DATABASE_URL` custody).
3. **#642 backup gate** — audited, owner-review-ready, draft/unmerged by design; cannot merge during the active observation window.
4. **Scheduled Production backup** — currently disabled with no replacement; a live operational gap independent of QBO.
5. **Durable backup architecture decision** — owner has not chosen a replacement for the GitHub-artifact approach (or decided to resume it only once #642 merges).
6. **Neon history retention** — still 6h (last observed), not 0; a `GLOBAL_SECURE_DELETE` deletion domain stays open until changed and verified.
7. **`opsiq_privacy_eraser` operator role** — not yet created on Production; the erasure tool cannot run there without it.
8. **Intuit production assessment questionnaire** — not started; owner-only, requires portal login.
9. **Production OAuth client ID/secret** — not provisioned; gated behind the questionnaire.
10. **Redirect URI / Disconnect URL exact portal acceptance** — documented proposal exists; not confirmed against the live portal form.
11. **App logo upload** — asset ready, not uploaded (requires portal session).
12. **Security questionnaire evidence gaps** — several §3 rows remain UNVERIFIED/PARTIAL, not closed.
13. **Data-sale clause confirmation** — owner/counsel must confirm the exact Intuit clause before any public "we do not sell data" statement tied to it.
14. **Lawyer review of /privacy, /terms, /support** — not done; the in-page disclaimer saying so must stay until it is.

None of these were enabled, configured, or submitted to Intuit in this pass.
