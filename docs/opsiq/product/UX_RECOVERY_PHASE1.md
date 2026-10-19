# UX recovery — Phase 1: repository truth, product spine, first consolidation

Status: IMPLEMENTED_PENDING_REVIEW · base `e5749ffbf` · no schema change · no migration · not merged · not deployed.

## 1. QuickBooks repository truth — classification **C. PARTIALLY IMPLEMENTED**

| Capability | Exists? | Location | Prod-exposed? | Tested? | Safe to expose? |
|---|---|---|---|---|---|
| OAuth start | Yes (API only) | `POST /api/owner/integrations/quickbooks/connect`, `qbo-connect-callback.service.ts` | Route yes, no UI | unit + DB (`TEST_WITH_DB`) | No |
| OAuth callback | Yes (JSON completion doc, no redirect to a page) | `GET …/quickbooks/callback` | Route yes, no UI | unit + DB | No |
| Token storage | Yes, AES-256-GCM, workspace-bound key | `qbo-connection.service.ts`, `qbo_connection_tokens` | n/a | yes | n/a |
| Refresh-token handling | Function exists, **never invoked** | `refreshQboTokens` (`qbo-oauth.service.ts`), `rotateQboTokens` | No | unit | No |
| Connection persistence | Yes, per business + environment + realm | `qbo_connections`, migration `20261008090000` | Table only | yes | n/a |
| Disconnect | Service only, **no route** | `disconnectQboConnection` | No | DB | No |
| Company identity | Client can query `CompanyInfo`; **nothing stores or shows it** | `qbo-client.ts` | No | unit | No |
| Initial / scheduled / manual sync | **No** | — | No | — | No |
| Sync status / error state | `status` + `lastErrorCode` columns only; no API/UI | `QboConnection` | No | — | No |
| Revenue, expense, receivables, payables, customers, vendors, P&L, balance sheet, cash | Read **catalog** only (entities/reports are allow-listed); **no importer** maps any of it into OpsIQ data | `qbo-read-catalog.ts` | No | catalog tests | No |
| Provenance | **No** (no source field on `OwnerFinancialSnapshot`) | — | No | — | No |
| Webhooks | **No** | — | No | — | No |
| Config gate | env `QUICKBOOKS_*`; `.env.example` documents callback `/api/integrations/quickbooks/callback`, the route is `/api/owner/integrations/quickbooks/callback` (mismatch) | `qbo-config.ts` | — | yes | — |

`QBO_CONNECTION_PERSISTENCE.md` still says "no routes"; the connect/callback routes were added afterwards (`b8299fb34`).

**Decision:** nothing in OpsIQ consumes QuickBooks data, so no Connect button, no "connected" state and no sync status is shown anywhere. The sidebar "Integrations" row stays "coming soon". Showing a button would promise a working integration that imports nothing.

### Minimum work before QuickBooks may be exposed
1. Fix the redirect-URI mismatch (`.env.example` vs route) and make the callback land on an owner page.
2. Company-identity read stored on the connection; disconnect route; status read model (connected / re-auth required / error + last successful sync).
3. A scheduled token refresh and an importer that maps accounts into the existing `OwnerFinancialSnapshot` period model, with a source marker (`MANUAL` | `QUICKBOOKS`) — this is the only schema change justified, and it is not needed until the importer exists.
4. Sandbox browser acceptance (Persona B). Unverified: no sandbox credentials here.

## 2. Product spine (owner journey contract)

BUSINESS → DATA SOURCE → MISSING INFORMATION → READY → INSIGHT → ACTION → RESULT

| Step | Page | Canonical source |
|---|---|---|
| Business | header, `/owner/onboarding` | `ActiveBusinessContext` (single owner of "which business") |
| Data source / missing information | `/owner/onboarding`, `/owner/data`, `/owner/start-here` | `/api/owner/onboarding` → `evaluateFirstReadSufficiency` + `evidenceFreshness` |
| Ready | same three pages | `firstRead.sufficient` + `evidenceFreshness` |
| Insight / priority | Home `/owner/cockpit` | owner decision arbiter; staleness uses the same 45-day window |
| Action / Result | Tasks, Execution, Results | unchanged |

Manual entry is today the only data-source path; the data-source step is where QuickBooks attaches when section 1 is done. No new module was added.

## 3. Root causes found

1. **Business mismatch.** `/owner/onboarding` kept its own `selected` state seeded from `businesses[0]` (the newest business, because `listBusinesses` orders `createdAt desc`) and never read `ActiveBusinessContext`; its selector did not write back. The header showed the stored active business while the form wrote to another one, and the currency came from the form's local selection, with a silent `?? "USD"` fallback. Seeded QA data is only the precondition. **Fixed.** Related, **not fixed**: `/owner/first-run` resolves the *oldest* business server-side (`firstRealBusiness`, `createdAt asc`), the opposite ordering, and never reconciles with the active business.
2. **Four "ready" answers.** Different questions, no shared contract: (a) the "NN/100" is a ten-dimension *pilot-readiness* score (`readiness-score.ts`, capped at 55 by any blocker, e.g. a missing benchmark file); (b)/(c) are first-read sufficiency and starter-category presence with **no age limit**; (d) Home's "out of date" is per diagnosis cycle, `periodEnd` older than 45 days. A snapshot entered once therefore read "enough" / "complete" forever while Home called it stale.
3. **Revenue wording.** Quick entry said "in the period"; the Money form said "typical month" for the same field on a dated period.

## 4. What changed

- `ActiveBusinessContext` is now the only business selector state on `/owner/onboarding`; an explicit switch is a global switch; no silent USD fallback.
- `evidenceFreshnessOf` + `FIRST_READ_STALE_AFTER_DAYS` added to the first-read contract; Home's `OWNER_DECISION_STALE_EVIDENCE_DAYS` now re-exports it (one window). `/api/owner/onboarding` carries `evidenceFreshness`.
- Onboarding, My Business and Start Here show a freshness-aware status (`starterStatusPhrase`, `staleEvidenceNotice`) instead of claiming completeness for stale figures.
- The unrelated pilot-readiness "Setup progress NN/100" badge is removed from onboarding (it remains on the Command Center).
- Revenue hint unified to "in the period these numbers cover".

## 5. Navigation classification (proposal only — no nav change in this PR)

- CORE: Start Here, Home, My Business, Money, Tasks, Results.
- SECONDARY: Sales, Operations, Customer records, Goals, Vendors, Execution & SOP, Evidence & Trust, Settings, Help, Feedback.
- ADVANCED: Diagnosis, Decision Inbox, Check a decision, What if…, Reports, Procurement.
- PREVIEW (already collapsed under "More from OpsIQ"): Recovery, Strategy, Marketing, Campaigns, Starting up, Compliance.
- ADMIN (capability-gated, separate section): Administration, Consulting.
Proposed: collapse SECONDARY/ADVANCED behind "More" for a new owner; add "Data sources" to Settings once QuickBooks is shippable.

## 6. Owner-language triage (proposal)

KEEP on technical/audit surfaces; RENAME or EXPLAIN on the owner journey: "diagnosis cycle", "snapshot", "governed action", "execution lifecycle", "finding strength", "technical reference". HIDE FROM OWNER: "anti-gaming", "proof-review", "Process Intelligence" (internal vocabulary). Not applied in this PR.

## 7. Known limitations / deferred

QuickBooks exposure, Settings → Data sources, navigation reduction, owner-language cleanup, canonical shared financial-entry component (onboarding `EssentialNumbersForm` is still a separate component from `QuickFinancialPicture`), provenance/`source` field, empty-state standard, `/owner/first-run` business-ordering mismatch, Home's cycle-based staleness vs snapshot-based first-read staleness (same window, different object), browser/mobile acceptance and screenshots.
