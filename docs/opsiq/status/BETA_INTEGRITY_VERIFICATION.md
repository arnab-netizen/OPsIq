# Beta Integrity Verification Gate — Defect Matrix

- Baseline: `origin/main` @ `d9d74effa3d2e973221aeca22883d3640699f0c1` (fetched at mission start; HEAD == origin/main, clean tree)
- Branch: `claude/epic-ptolemy-a4473k` (session-designated feature branch; used instead of `audit/beta-integrity-verification`)
- Toolchain: Node v22.22.2, npm 10.9.7
- Runtime environment: isolated local PostgreSQL 16 (`localhost:5433/opsiq_audit`, all 181 migrations applied), `next build` + `next start` production server, three seeded local identities (owner A, owner B — separate workspaces, self-serve owner role; SYSTEM_ADMIN). No remote database, real user, email, billing or external integration was used for reproduction.
- Source allegations: tester report "OpsIQ beta review: complete report" (sandbox business inside the platform owner's workspace).

Allowed classifications only: `CONFIRMED SECURITY DEFECT`, `CONFIRMED BUG`, `DESIGN/SEMANTIC DEFECT`, `EXPECTED BEHAVIOR`, `NOT REPRODUCIBLE`, `INSUFFICIENT EVIDENCE`.

Status column records remediation state on this branch (see section "Remediation").

---

## Matrix

### BIV-01 — QA/test businesses and tasks visible (4.1)
- Allegation: "QA — PR524 Sales Verification (QA use only)", two "ZZ-TEST" businesses and "QA Acceptance Task" appear in every business dropdown and on Tasks.
- Reproduction: runtime cross-tenant probe (owner B vs owner A objects, 16 read/write requests) + code trace of list queries + repo-wide grep for the names.
- Observed: business list is `listBusinesses(ctx.verifiedWorkspaceId)` → `where { workspaceId, isActive, isFixtureBusiness:false }` (`src/services/founder-recovery/business.service.ts:55-67`); workspace comes from the session's membership, never the request (`src/lib/canonical-route-enforcement.ts:343-400`). Owner B's list never contains owner A's business; every owner-A object id requested by B returned 404 or an empty scoped result. None of the QA names is produced by any code, seed, script or workflow; commit 05dedde8 and `owner/cockpit/page.tsx:50-52` document manual live QA run inside the owner's own production workspace (alongside "Trinity Services") through the ordinary create path, which never sets `isFixtureBusiness`. Delegated tasks (`DelegatedTask`) have neither `businessId` nor a fixture flag, so a workspace task shows under every business of that workspace.
- Expected: tenant-scoped lists (met); QA records isolated from real workspaces (process not met).
- Classification: **EXPECTED BEHAVIOR** (tenant isolation) + **DESIGN/SEMANTIC DEFECT** (QA data hygiene: manual production QA written into the owner's own workspace; tasks lack business attribution).
- Severity: P2. Confidence: high. Security impact: none proven. Data-integrity impact: owner-visible test records in own workspace.
- Root cause: operational process (manual QA in production owner workspace) + no business attribution on `DelegatedTask`.
- Tests present: `fixture-isolation.db.test.ts`, `fixture-flag-rbac.db.test.ts`, `owner-business-isolation.db.test.ts`, `cockpit-business-scoping.db.test.ts` — run locally against the sandbox DB: pass.
- Remediation: owner decision to archive (not delete) the QA rows via existing `isActive=false` / fixture reclassification with audit; add business attribution to delegated tasks in a later slice. Not a code P0/P1. Dependency: owner authority over production data.

### BIV-02 — `/admin/beta-requests` authorization (4.2)
- Allegation: page shows other applicants' emails; normal-user access untested.
- Reproduction (runtime, local server): unauthenticated / owner A / owner B / SYSTEM_ADMIN against page and API, plus invite/revoke/reopen/reject mutations and all other `/api/admin/*` list routes.
- Observed: `GET /api/admin/beta-requests` → anon **401**, owner A **403**, owner B **403**, SYSTEM_ADMIN **200**. `POST …/{id}/{invite,revoke,reopen,reject}` → anon 401, owner 403. `/api/admin/{administration-audit,audit-log,fixture-businesses,overview,platform-settings,workspaces}` → anon 401, owner 403. Page route: anon 307 → /login; authenticated non-admin receives the client shell (200) whose data fetch returns 403 and renders a forbidden state. Gate: `requireCapabilities:[BETA_REQUEST_REVIEW]` (`src/app/api/admin/beta-requests/route.ts:39-41`); self-serve owners are narrowed to `OWNER_SCOPED_CAPABILITIES` which excludes it (`src/policies/capability-check.ts:259-267,342-352`).
- Classification: **EXPECTED BEHAVIOR** (platform admin sees platform-wide applicant list by design; API enforced server-side). Minor: page shell has no server-side capability redirect → **DESIGN/SEMANTIC DEFECT**, P3 (no data exposure).
- Confidence: high. Tests: `beta-requests-rbac.test.ts` [db] cases (incl. "ordinary self-serve business owner is denied (403)") run locally against sandbox DB: pass.

### BIV-03 — Home contradicts application state (4.3)
- Status: FIXED (dd221d6f; refined 4a0cc8f3): new `cockpit-domain-priority.service` reuses the existing `getOwnerHome` aggregator (unchanged from main) — the top open non-Finance action is shown on Home (primary when there is no Finance priority, secondary otherwise; never overrides a governed topRoute); engaged actions are re-attached to the latest cycle by the diagnosis (BIV-12), so every latest-cycle reader agrees; the add-business prompt renders only when the owner has no business. Runtime: Home shows "Open action from your Strategy/Sales diagnosis" instead of "No urgent action".
- Allegation: after Sales snapshots, 2 diagnoses, action lifecycle and a Strategy evaluation, Home said "No urgent action needs your attention" and "Haven't added your business yet?".
- Observed: Home = `/owner/cockpit` → `/api/owner/now-view` (`force-dynamic`, fetched on every mount/business change; no client cache). Urgent action is sourced only from the process-execution bridge (proof-scan/cash families, narrowed to CASH_PROFIT/STARTUP_MODE in multi-business workspaces, `owner-now-view.service.ts:2097-2108`) and the Finance cycle (`cockpit-finance-priority.service.ts:72-93`). No `ownerSalesCycle/Action` or `ownerStrategyCycle/Action` read exists in the now-view path. "Haven't added your business yet?" (`src/components/owner/MinimumOwnerCockpit.tsx:1160-1165`) is rendered unconditionally inside the `!bridge.topRoute && !financeTopPriority` branch — also for owners with businesses.
- Not the cause: stale cache, wrong active business (same `ActiveBusinessProvider` id used by Home, Sales and Strategy), SSR hydration.
- Classification: (a) Home not integrated with Sales/Strategy outputs → **DESIGN/SEMANTIC DEFECT**, P1 (owner receives "no urgent action" while a high-severity Sales finding / RISKY strategy verdict exists — materially false operational guidance). (b) unconditional "Haven't added your business yet?" copy → **CONFIRMED BUG**, P2.
- Remediation: (b) render the prompt only when the workspace has no business (server-derived flag already present on the page: `businesses.length`). (a) add a domain-priority source for the latest fresh Sales/Strategy cycle per business next to the finance priority and route it into the existing priority slot.

### BIV-04 — Goal with past target date (4.4)
- Status: FIXED (dd3be6aa): new goals must target a future date (route + service, client pre-check); an existing ACTIVE goal past its date is shown "Overdue" (read-time `isOverdue`, stored status untouched).
- Runtime: `POST /api/owner/goals {targetDate:"2020-01-01"}` → 201, stored `status:"ACTIVE"`.
- Domain: statuses are ACTIVE/ACHIEVED/REVISED only (free String, `prisma/schema.prisma:2608`); no overdue/missed state; status never auto-derived; `createGoal` always ACTIVE. No spec defines historical goal entry.
- Classification: **DESIGN/SEMANTIC DEFECT**, P2. Confidence: high.
- Remediation: reject a new goal whose target date is not in the future at the API/service boundary (a new goal is a forward commitment; history is preserved by REVISED records); present an existing ACTIVE goal whose date has passed as "Overdue" (read-time derivation, no silent mutation).

### BIV-05 — `NaN` / Infinity / undefined in financial output (4.5)
- Status: FIXED (dd3be6aa). Also fixed in the sweep: verification lines printed `String(null)` → "null" on 8 pages (2e802d14).
- Runtime: `GET /api/owner/goals/trajectory` returns `{projectedMonthsToGoal, currentTrajectoryDate, confidence, confidenceRationale, requiredMonthlyImprovement, gapToClose, trajectoryMiss, assumptions}`; the page (`owner/goals/page.tsx:38-47,228,233,262`) reads non-existent `percentComplete`, `gapToTarget`, `onTrack`, `projectedAchievementDate` → `Math.round(undefined)` = NaN → "Progress NaN%", `Intl.NumberFormat(...).format(undefined)` → "US$NaN", width `NaN%`, "On track: No". Independent of inputs: every active goal renders NaN.
- Secondary (same flow): LOW-confidence path treats missing data as 0 (`goal-trajectory.service.ts:127`, gap = full target); `requiredMonthlyImprovement = Infinity` for past dates (serialised to `null`); `computeActiveGoalTrajectory` reads the **oldest** 12 `OwnerMetricSnapshot` rows (`orderBy periodStart asc, take 12`) and mixes businesses/currencies (`goal.service.ts:143-148`); `baselineAmount` stored but never returned or used.
- Page test `owner-goals-page.test.tsx` mocks the invented field names, masking the defect.
- Classification: **CONFIRMED BUG**, P1 (NaN on a financial screen; wrong snapshot window). Systemic sweep: other owner pages guard their divisions; no other reproducible NaN found (home score `Math.round` sites: INSUFFICIENT EVIDENCE — DTOs non-null in reproduced runs).
- Remediation: single typed trajectory DTO shared by service and page; server-computed `percentComplete` (null when baseline/current unavailable or target == baseline); missing data rendered as "Not enough data", never 0/NaN; newest-12 window; baseline honoured; finite-number serialisation.

### BIV-06 — Currency context (4.6)
- Runtime: goal created without currency in an INR business → stored `targetCurrency:"USD"`.
- Canonical source already exists: `OwnerBusiness.currency` (`schema.prisma:2680`), exposed client-side via `ActiveBusinessLite.currency`; Sales/Money/Cashflow/Strategy/Marketing pages use `currentBusiness?.currency`.
- Deviations: Goals defaults to USD in form (`goals/page.tsx:104,156,326`), service (`goal.service.ts:59`) and Prisma default; Customers "Lifetime value ($)" label (`customers/page.tsx:541`) while values are formatted with business currency; Marketing campaigns render `$` literal (`marketing/campaigns/page.tsx:218,220`); growth-pricing hard-codes `fmtMoney(…,"USD")` (`growth-pricing/page.tsx:224`); onboarding falls back to `"USD"` (`onboarding/page.tsx:579`).
- Classification: **CONFIRMED BUG**, P2 for Goals (hostile review: visible, editable pre-filled default, not silent corruption; goals are workspace-level by contract — `business-context-selector-migration.test.ts:117`); **CONFIRMED BUG**, P2 for the `$` labels (presentation only; stored values unaffected).
- Status: FIXED (Goals: dd3be6aa; Customers LTV label + Marketing campaigns: 5d6669a2). Not changed: Growth pricing catalog (`growth-pricing/page.tsx:224`, `pricing-engine.ts` USD creation default and cross-currency gap comparison) — separate module, not exercised by the review; remains P2 known limitation.
- Remediation: goal currency = explicit record currency → active business currency (server-resolved) ; UI label from business currency; no feature-level `$`/`USD` literals.

### BIV-07 — Strategy "silent" save failure (4.7)
- Runtime: POST scenario without dates → 400 `{"error":"Validation failed"}` — field issues dropped.
- Trace: date inputs carry native `required` (`strategy/page.tsx:363-364`) → browser blocks submit with a transient bubble; `Input` primitive (`src/ui/primitives/input.tsx:28-45`) renders no visible required marker (app-wide), while `operator-safe-errors.ts:262` tells users to look for "fields marked with *". When the request does reach the server, `parseOrThrow` puts `z.prettifyError` into `ValidationError.details` (`src/lib/validation.ts:7-9`) but the canonical wrapper serialises only `error` (`src/lib/canonical-route-enforcement.ts:829-850`), and `presentDomainError` maps "Validation failed" to "That didn't look right…". Error is shown in the page banner far above the form. "Evaluate scenario" disabled until a scenario is saved (`strategy/page.tsx:341`) — intended.
- Classification: **CONFIRMED BUG**, P2 (hostile review: the native `required` bubble does fire, so feedback is transient rather than absent; the lost field detail is systemic across all routes). Evaluate-disabled: **EXPECTED BEHAVIOR**.
- Status: FIXED (832a47f4): wrapper returns sanitised `fieldErrors`; `HttpResponseError.fieldErrors`; Input/Select visible required marker + `aria-invalid`.
- Remediation: wrapper returns `fieldErrors` for `ValidationError` (4xx, owner-safe); `Input`/`Select` render a visible required marker; Strategy form surfaces field errors inline.

### BIV-08 — Sales validation UX (4.8)
- A. Discoverability: server message "Cannot verify a sales action without a before (baseline) value…" is lost in the Sales page `api()` helper (`sales/page.tsx:68` throws plain `Error`, dropping status) → classifier fallback "Couldn't process this action. Please try again." (`operator-safe-errors.ts:314`); rendered in page banner (`sales/page.tsx:392-399`) not in the inline form. **CONFIRMED BUG**, P1 (owner cannot learn what is required).
- B. Field-level: no field highlighting anywhere (systemic, 33 pages use the lossy `api()` pattern). **DESIGN/SEMANTIC DEFECT**, P2.
- C. Domain validation: see BIV-10.
- D. Provenance: see BIV-10.
- Remediation (A): Sales `api()` uses `httpResponseErrorFromBody` (existing helper already used by Strategy); inline verification form shows the server message and marks "Before value" required.
- Hostile review: same lossy `api()` + shared form hint ("leave the field blank") on Money, Operations, Execution too — batch all 4.
- Status: FIXED (2e802d14) on all 4 pages; they now use `presentDomainError` (allowlist presenter already used by the other 4 domain pages), so a 404 "<Model> not found: <uuid>" is never shown raw; the form shows server errors inline and requires Before only when no measured baseline exists.

### BIV-09 — Action lifecycle (4.9)
- State machine (`src/domain/founder-recovery/action-status.ts:19-26`): proposed→assigned|cancelled; assigned→in_progress|blocked|cancelled; in_progress→blocked|completed|cancelled; blocked→assigned|in_progress|cancelled; completed, cancelled terminal. Enforced on PATCH (runtime: `in_progress→verified` rejected; `proposed→proposed` rejected).
- "Verified" is not a status: verification is a separate append-only row. Runtime: `POST /api/owner/sales/actions/{proposed action}/verify` → **201**; action stays `proposed`; a second verification also accepted. Same unguarded shape in all 7 domain verification services (finance, cashflow, operations, marketing, strategy, sop, sales). Governed Phase-3 contract (`docs/opsiq/ux/UX-05A-ACTIONS-LAYER-CONTRACT.md:283-312`) allows outcome verification only after completion.
- Assign: sends no `assignedTo`; status "assigned" with nobody assigned → DESIGN/SEMANTIC DEFECT, P2. Page jump to top: full-page skeleton on every reload (`sales/page.tsx:164,374`) → CONFIRMED BUG, P3.
- Classification (revised by hostile review): **DESIGN/SEMANTIC DEFECT**, P1. The cited UX-05A contract governs `ProcessExecutionTask`, not domain actions; existing tests treat verifying an `in_progress` action as valid (`owner-home/services.db.test.ts` DC-PROJ-001, `workflow1-feedback-loop.test.ts`). Verifying a `proposed` action is not supported by any contract.
- Status: FIXED (2e802d14): `canRecordOutcome` allows in_progress | blocked | completed and rejects proposed | assigned | cancelled, enforced in all 7 domain services + recovery (8 instances); Verify button hidden otherwise on all 8 pages. Runtime re-check below.

### BIV-10 — Verification evidence provenance (4.10)
- Runtime: measured `discountDependencePct` = 5.2 (finding `sourceValue`); verify accepted `before=50, after=20, direction=up` for a metric whose improvement direction is down; stored and displayed "before 50 → after 20 (up)" with no provenance marker. No source/provenance field exists in schema, model or UI; service never compares to the measured baseline; direction is user-controlled.
- Product promise: "missing data is reported, never invented" (`sales/page.tsx:481`), "outcomes stay honest".
- Classification: **DESIGN/SEMANTIC DEFECT**, P1 (owner-reported values presented as observed fact; contradiction with measured value silently accepted).
- Remediation: record `baselineSource` (MEASURED vs OWNER_REPORTED) and the measured baseline on each verification; when an owner-entered before-value differs from the measured value, persist the conflict and present it ("Owner-reported — differs from measured 5.2"); prefill before-value from the measured baseline.
- Status: FIXED (2e802d14), following the Module 1 measured-baseline pattern: blank Before ⇒ measured value (MEASURED); a different owner value is kept (never forced) but stored as OWNER_REPORTED with `measured_before_value`, an evidence line and audit payload; UI shows "baseline owner-reported (diagnosis measured 5.2)". Additive nullable migration `20260925120000_add_verification_baseline_provenance`. Not changed: improvement direction remains owner-selected (no per-metric direction exists in the domain model) — recorded as limitation.

### BIV-11 — "Verified — no improvement" (4.11)
- Two concepts rendered as one badge: verification record exists + outcome class. For 50→20 "up" the classifier (`verifyOutcome`) correctly returns `verified_not_improved` per its tested contract (no "worsened" class).
- Classification: **DESIGN/SEMANTIC DEFECT**, P2 (presentation conflation; resolved in practice once verification is gated to completed actions). Not contradictory in itself.

### BIV-12 — Diagnosis cycle history (4.12)
- Runtime: cycle 2 created three new `proposed` actions; cycle-1 `in_progress` action retained (status intact, queryable by id), cycle 1 listed in `cycleHistory`; dashboard/UI renders only the latest cycle's actions; history list is counts only. No deletion; no carry-forward; duplicate action for the same recommendation. Known in `owner-sales/services.db.test.ts:191-256`.
- Classification (revised by hostile review): **DESIGN/SEMANTIC DEFECT**, P1 — the regenerate-per-cycle mechanism is deliberate and asserted (`owner-sales/services.db.test.ts:191-256`), but open owner work becoming unreachable is not.
- Status: FIXED (final design 4a0cc8f3 + 238091d6, after audit rounds 1–3 rejected two earlier designs) in all 7 domain diagnosis services + recovery: an ENGAGED action (assigned / in progress / blocked) whose finding/recommendation is planned again is re-attached to the new cycle (ranking and wording re-evaluated, original finding kept as the pre-work baseline, status-guarded, audited with from/to cycle); untouched proposals are regenerated (original per-cycle contract and test preserved); engaged actions not planned again stay on their cycle and are still listed on the domain page ("Still open from cycle #N", flagged when no longer raised). Nothing is deleted. Runtime: after cycle 2 the in-progress action appears exactly once, in progress, with its measured baseline intact.

### BIV-13 — Health / Risk / Data confidence (4.13)
- Runtime: Sales cycle → health 80, risk 0, data confidence 25, with a "Critical sales inputs are missing" finding. Formula: risk sums only signals whose metric is non-null (missing ⇒ 0); health = 0.6·(100−risk) + 0.4·momentum with momentum default 50 ⇒ 80 with no data (`src/domain/owner-sales/metrics.ts:186-233`). Money already enforces "UNKNOWN ≠ HEALTHY" with `healthScoreCeiling = floor(50 + confidence/2)` (`src/domain/owner-finance/metrics.ts:320-360`); `UX-04A-CORE-BUSINESS-DOMAIN-CONTRACT.md:144,179,230-245` records the Sales/Operations gap. Same uncapped formula in marketing, operations, sop, strategy.
- Money "80 at confidence 0": **INSUFFICIENT EVIDENCE** (hostile review: the ceiling holds at HEAD, but the dashboard shows the persisted `overallHealthScore`, so a cycle stored by an earlier build could still show 80; shallow history cannot rule it out).
- Classification (Sales and uncapped domains, revised): **DESIGN/SEMANTIC DEFECT**, P2. `UX-04A-CORE-BUSINESS-DOMAIN-CONTRACT.md:231-251` records the Sales/Operations asymmetry as intentional ("none is proposed for change"); `salesState` is forced to SOFT below 50 confidence and shown next to the score. Also uncapped: cashflow, marketing, operations, sop, strategy.
- Status: NOT CHANGED — formula change requires an owner decision (documented contract). Recommendation: extend the existing Money `healthScoreCeiling` to the uncapped domains, or suppress the score below a confidence floor.

### BIV-14 — Confidence terminology (4.14)
- Distinct metrics: (a) data completeness `dataConfidenceScore` 0–100; (b) finding confidence 0–1 (= completeness/100 for metric findings, hard-coded 1 for missing-data findings); (c) finance tiers; (d) goal trajectory LOW/MEDIUM/HIGH. Different banding for the same value: FindingCard ≥0.5 "Reasonably sure" vs Trust ≥0.67 "High".
- Raw keys on Trust (`trust/page.tsx:274,280,285` not wrapped in existing `humanizeEvidenceLine`) → **CONFIRMED BUG**, P2. "No data gaps" beside "some non-critical fields missing" (`opportunity-rules.ts:47` hard-codes `missingData: []`) → **CONFIRMED BUG**, P2. Mixed banding / "100%" on missing-data findings → **DESIGN/SEMANTIC DEFECT**, P2. Metrics must not be merged.

### BIV-15 — Discount recommendation at 5.2% vs 15% (4.15)
- Runtime: finding "Tighten discounting to protect margin", severity low, sourceValue 5.2, threshold 15.
- Trace: threshold risk rule `SALES_DISCOUNT_DEPENDENCE` (`risk-rules.ts:293`, `5.2 > 15` false) did **not** fire. The recommendation comes from the separate opportunity rule `SALES_OPP_TIGHTEN_DISCOUNT` (`opportunity-rules.ts:128-147`) which fires on any discount > 0 and attaches `threshold: 15` for display.
- Classification: **DESIGN/SEMANTIC DEFECT**, P2 (no comparator/unit bug; opportunity rule has no floor and displays a threshold that was not breached). Not a rules-engine threshold defect.

### BIV-16 — Strategy decision output (4.16)
- Runtime (tester inputs): verdict `strategyState = RISKY` (affordability 0.67 < 1.0), yet actions include "Low-regret bet — proceed", "Pursue this high-return option", "Size up a high-safety option" alongside "Secure funding or stage the spend". Engine has STRONG_GO/GO/MARGINAL/RISKY/AVOID; opportunity rules ignore the verdict; the page renders only a small "Risky" badge while promising "a clear go / no-go" (`strategy/page.tsx:291,390`).
- Classification (revised): **DESIGN/SEMANTIC DEFECT**, P2 — the top-ranked action is "Secure funding or stage the spend" and the positive templates are hedged ("staged", "provided the downside is survivable"); the contradiction is real but secondary. No product spec beyond page copy defines go/no-go.
- Status: NOT CHANGED (P2). Recommendation: render the computed `strategyState` as the headline decision and suppress `STRREC_PURSUE`/`STRREC_SCALE` when the state is RISKY/AVOID.
- Remediation: when verdict is RISKY/AVOID, suppress the positive "pursue/proceed/size up" recommendations; render the existing verdict as the headline decision (GO / GO WITH CONDITIONS / NOT YET / NO-GO mapped 1:1 from `strategyState`).

### BIV-17 — Phone placeholder / localisation (4.17)
- `customers/page.tsx:525` placeholder "+1 555 000 0000"; validation is `z.string().max(50)` (no US format enforced; nothing invalid persisted).
- Classification: **DESIGN/SEMANTIC DEFECT**, P3.

### Additional findings surfaced during investigation
- BIV-22 — `GET /api/owner/businesses/{id}/progress?review=true` accepts a foreign businessId without a membership check and emits an audit event in the caller's own workspace (`owner-mode/owner-progress.service.ts:183,214`; hostile review, not executed because it writes). No data exposure. **DESIGN/SEMANTIC DEFECT**, P3.
- BIV-23 — Growth pricing catalog: USD creation default and gap analysis across tiers of different currencies (`pricing-engine.ts:168,198,376-408`). **CONFIRMED BUG** (code), P2; not exercised by the review.
- BIV-18 — `vitest-global-setup.ts` loaded and rewrote `.env.test` from whatever `DATABASE_URL` the shell carried; in this container that is the remote Neon endpoint and `TEST_WITH_DB=true` is set globally, so an "offline" unit-test run opened a DB connection. **DESIGN/SEMANTIC DEFECT** (test-harness safety); treated as a merge blocker by owner instruction. Status: FIXED (374dbd17, 6c77a12b, d65d2227, aa6038ed) — see "Environment incident" for the guard and its proof.
- BIV-19 — Assign without assignee (see BIV-09): DESIGN/SEMANTIC DEFECT, P2.
- BIV-20 — "My Business" skeleton delay: **INSUFFICIENT EVIDENCE**, P3 (sequential fetch waterfall exists; no timing evidence).
- BIV-21 — Accounting/banking/POS "Not available yet": **EXPECTED BEHAVIOR** (documented beta scope).

---

## Summary counts (final, after hostile review; primary facet per item, secondary facets in brackets)

| Classification | Count | Items |
|---|---|---|
| CONFIRMED SECURITY DEFECT | 0 | — |
| CONFIRMED BUG | 7 | BIV-03b, 05, 06, 07, 08A, 14 (raw keys / "No data gaps"), 23, [BIV-09 page-jump P3] |
| DESIGN/SEMANTIC DEFECT | 15 | BIV-01 (QA data hygiene), 03a, 04, 08B, 09, 10, 11, 12, 13, 15, 16, 17, 18, 19, 22 |
| EXPECTED BEHAVIOR | 2 | BIV-02 (admin authorization), 21 (manual-only data); [BIV-01 tenant-isolation facet; BIV-07 Evaluate-disabled facet] |
| NOT REPRODUCIBLE | 0 | — |
| INSUFFICIENT EVIDENCE | 1 (+1 facet) | BIV-20; [BIV-13 Money "80 at confidence 0" facet] |

P0/P1 remediated: BIV-03a, 05, 08A, 09, 10, 12 (P1) and BIV-18 (test-harness safety; merge blocker by owner instruction), plus every P1 found by post-remediation audit rounds 1–8. P2 fixed where they shared the P1 root cause: BIV-04, 06 (goals + labels), 07, 03b. Owner decisions (not changed): BIV-13 Sales Health low-data semantics, BIV-16 Strategy verdict vs action wording.

---

## Remediation log (branch `claude/epic-ptolemy-a4473k`)

| Commit | Scope | Items |
|---|---|---|
| 832a47f4 | Validation `fieldErrors` through canonical wrapper; visible required marker | BIV-07, BIV-08B groundwork |
| dd3be6aa | Goal trajectory DTO, finite-or-null numbers, currency resolution, past-date rejection, Overdue | BIV-04, BIV-05, BIV-06 (goals) |
| 2e802d14 | Outcome-evidence policy (status gate + measured/owner-reported provenance) in 8 services; lossy client error path on 4 pages | BIV-08A, BIV-09, BIV-10 |
| 572b03ba | Action continuity across diagnosis cycles (superseded in part by 07ce73e4) | BIV-12 |
| dd221d6f | Home surfaces open domain-diagnosis work; add-business prompt conditional | BIV-03 |
| 5d6669a2 | Customer LTV label / campaign money use business currency | BIV-06 (labels) |
| 07ce73e4 | Final hostile audit round 1 fixes (see below) | BIV-05, BIV-06, BIV-10, BIV-12 |
| 4a0cc8f3 | Round 2: re-attach engaged actions to the new cycle (all readers agree); bounded goal projections | BIV-03, BIV-05, BIV-12 |
| 238091d6 | Round 3: keep pre-work baseline on re-attach; finance re-diagnoses latest cycle; guarded re-attach | BIV-10, BIV-12 |
| 0d4147cd | Round 4: finance measured baseline follows the snapshot amendment chain | BIV-10 |
| 374dbd17 | Test-harness guard (fail closed on non-throwaway DB) | BIV-18 |
| 6c77a12b | Round 5 + changed-file audit: unbounded amendment-chain walk; guard host/hostaddr bypass; e2e seed guard; outcome-policy messages allowlisted; dead code / stale comments removed | BIV-08A, BIV-10, BIV-18 |
| 149a33db | Keep canonical-wrapper line numbers stable (governance baseline) | — |
| d65d2227 | Round 6: only postgres TCP URLs count as loopback; remaining fixture seeds guarded | BIV-18 |
| aa6038ed | Round 7: Playwright local-server/DB paths and demo seeds through the guard; library import no longer triggers it | BIV-18 |
| 24e699c2 | Round 8: Playwright guard uses the exact condition that starts the local dev server (BASE_URL no longer skips it) | BIV-18 |

### Final hostile audit — round 1 (post-remediation)
Findings reproduced live and fixed in 07ce73e4:
- P1 — continuity carried never-touched `proposed` actions: stale priorities, empty new cycle, contradictory surfaces (finance dashboard vs cockpit finance card vs command-center). Now only engaged actions are carried and re-prioritised; untouched proposals regenerate; carried actions whose finding is no longer raised are flagged and excluded from Home priority.
- P1 — goal trajectory `cagr()` NaN when profit crosses into a loss, producing a false "On track: Yes". Now null rate, no projection, never on track without a projection.
- P2 — goal snapshot currency match was case-sensitive; invalid business currency ("Rs") inherited and crashed the goals page; prompt pages turned "₹1200" into null → recorded as MEASURED; finance break-even findings labelled revenue as a measured break-even baseline; after-value provenance unstated. All fixed.
- P3 — "Haven't added your business yet?" could flash during context load (fixed). Recorded, not fixed: recovery cycle numbers can duplicate under concurrent POSTs (pre-existing, no unique constraint); no freshness window on the domain Home card; Zod enum options visible in `fieldErrors` messages (low sensitivity); remaining USD defaults in waste-leakage, procurement, vendor, revenue-engine services and onboarding fallback (BIV-23 class).

### Final hostile audit — round 2
- P1 — surfaces still disagreed when all of a domain's actions were engaged (carried actions stayed on old cycles; recommendedNextAction, cockpit finance card, command-center and trust read only the latest cycle). Root fix in 4a0cc8f3: engaged actions whose finding is raised again are re-attached to the new cycle (audited, RecoveryAction.version incremented), so every existing reader agrees without special-casing; getOwnerHome reverted to main.
- P1 — `/api/owner/now-view` 500 (RangeError) when a very slow goal projection produced an Invalid Date (pre-existing). Projections bounded to 100 years; now-view never serialises an invalid date.
- P2 — reached goal after its date reported AT_RISK; results crossing zero reported "growth needs to turn positive". Fixed.
- P3 recorded: concurrent diagnoses → one 500 (P2002, sequence computed outside the transaction; pre-existing); `Number("0x10")` accepted by the prompt parse; strategy `sourceMetric "riskLevel"` holds `strategyRiskScore` (measured baseline therefore never used there — safe).

### Final hostile audit — round 3
Cross-surface agreement re-verified live on dashboard, now-view, command-center, home and trust. Fixed in 238091d6:
- P1 — measured baseline drifted after re-attachment (findingId moved to the newest finding) → original findingId kept.
- P1 — finance completion/verification of an action left on an older cycle re-diagnosed that cycle's stale snapshot → latest cycle's snapshot.
- P2 — re-attached actions kept stale wording → description/verification method/timeframe refreshed (audited).
- P3 — re-attach update now status-guarded.
- P3 recorded, not changed: re-attachment moves an action out of its original cycle, so that cycle's history count drops (the move is recorded in the ACTION_UPDATED audit event with from/to cycle); recovery overdue list counts superseded proposals from all cycles (pre-existing); `recommendedNextAction` raw row has no `measuredBaseline` (pre-existing); goal target amount has no upper bound.

### Final hostile audit — round 4
Round-3 P1s confirmed fixed; cross-surface agreement and tenant isolation hold. New P1 (introduced by 238091d6): after a finance snapshot amendment the kept original finding held a retracted value, recorded as a MEASURED verified_improved → fixed in 0d4147cd (baseline follows the governed amendment chain; unreconciled amendment ⇒ no measured baseline). Regression test fails with the fix stashed, passes with it.

### Round 5 (0d4147cd + guard) and changed-file audit
- P1 residual: `resolveCurrentSnapshotId` capped at 20 hops, re-opening the retracted-baseline defect at 21+ amendments (live repro) → unbounded walk with cycle/dangling-link fail-closed (6c77a12b); the old test that pinned the cap was replaced.
- P2: guard accepted `?host=`/`hostaddr` overrides → refused (6c77a12b); 20 e2e fixture seeds unguarded → guarded.
- Changed-file audit (95 → 120 files): unrelated `.claude/deployment_preflight_report.json` timestamp reverted; dead `isStillFlagged` removed; stale comments fixed; interface placement; audit `actionCount`; original synchronous `require` restored on the permission-denied path; one extra goals-page line removed. Found that the two outcome-policy messages had never been allowlisted in `presentDomainError` (scripted edit had aborted) → fixed, retired template replaced. Lint-only fixes are limited to files the lint ratchet required to be clean (base errors: canonical-route-enforcement 7, vitest-global-setup 6, seed-test-db 2, owner-sales services.db.test 1, seed-e2e-owner 1).

### Rounds 6–7
- Round 6: no P0/P1 (amendment walk and presenter fix verified live incl. a 22-amendment positive control). P2: `socket:`/non-postgres scheme bypass → fixed (d65d2227); 3 more fixture seeds guarded.
- Round 7 (harness only): invariant holds for the vitest path (PG* env vars, parser mismatches, pooler rewrite, sibling variables, other runners all refused/irrelevant). P2: Playwright started the local dev server with the inherited DATABASE_URL and 3 specs ran SQL behind a substring regex; 2 demo seeds unguarded → fixed (aa6038ed). Recorded, not changed (P2/P3): two concurrent vitest runs in one checkout share `.env.test` (only guarded URLs can leak between them); workers read `.env.test` from `process.cwd()`; a local tunnel/proxy on loopback to a remote database is indistinguishable from a throwaway database.

### Rounds 8–9
- Round 8 (aa6038ed, static): **P1**. `playwright.config.ts` guarded the database only when `!CI && !BASE_URL`, but started the local `npm run dev` server whenever `!CI`. So with CI unset and any `BASE_URL` (including `http://localhost:3001`), the dev server booted with the inherited, unguarded `DATABASE_URL`. Fixed in 24e699c2: a single `startsLocalServer` condition drives both. The regression source-contract test fails before the fix and passes after. `playwright test --list` refuses a remote `DATABASE_URL` with a remote or localhost `BASE_URL`, and lists 561 tests with a loopback DB or `CI=true`.
- Round 9 (24e699c2, static): **no P0/P1**. Every vitest path, both Playwright configs and the fixture/e2e seeds are guarded; CI is unaffected. Recorded, not changed (P2/P3):
  - an already-running dev server that Playwright reuses is not re-checked;
  - the `demo:seed` tool (`scripts/seed-demo-workspace.mjs`) and `scripts/seed-case-library.ts` are manual tools with no guard;
  - outside CI, a remote `BASE_URL` still starts a local dev server, so it now needs a loopback DB or the opt-in.

### Final regression gate (HEAD 24e699c2; the app code is identical to aa6038ed)
| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx prisma validate` | valid |
| `npm run build` (production, at aa6038ed; 24e699c2 changes only `playwright.config.ts` and a test) | exit 0 |
| `npm run lint:ratchet` | exit 0; changed_file_lint_errors 0 (123 changed lint files) |
| `governance:scan:strict` / `:auth` / `:a77` | no new errors / all routes comply / all gates green |
| Non-DB suite (CI lane: `vitest run --maxWorkers 2 --exclude '**/*.db.test.ts'` plus quarantine excludes) | 1225 files passed, 1 failed, 4 skipped; 32,535 tests passed, 1 failed, 184 skipped, 1 todo |
| Fresh throwaway-DB suite (new `opsiq_final` on loopback, `prisma migrate deploy`, `vitest run .db.test.ts --maxWorkers=1`) | 296/296 files; 2214 passed, 6 skipped; exit 0 |
| `test-database-guard.test.ts` | 14/14 |

The one non-DB failure is `stage7-g1-proof-binding.test.ts` › "the evidence validator and bundle validator both stay green". It is pre-existing: `validate-evidence-artifacts.mjs` exits 1 with byte-identical output on a clean worktree at mission-start `d9d74eff` ("BLOCKING: 2 artifact(s)…"; `fatal: bad object ffff…` from the shallow clone).

An earlier DB-suite attempt (74 failures) was invalid and was discarded. It ran at the same time as the non-DB run in the same checkout, so the non-DB global setup overwrote `.env.test` with the placeholder URL. This is the recorded shared-`.env.test` P2. The suites above were then run one after the other.

### Environment incident (disclosed; merge blocker until the guard landed)
**What happened.** This container exports a remote Neon `DATABASE_URL` / `TEST_DATABASE_URL` / `MIGRATION_DATABASE_URL` and `TEST_WITH_DB=true` by default. During the investigation phase, several read-only subagents ran `npx vitest run …` in that environment. At mission start, `vitest-global-setup.ts` trusted the inherited `DATABASE_URL`, loaded any existing `.env.test`, and rewrote `.env.test` with that URL for every worker. With `TEST_WITH_DB=true` it then ran `getDbInstance` → `pingDatabase` → opened a keepalive client → `resetStartupStatus()` / `setStartupStatus("READY")` **before any test body**.

**What may have touched the remote database.** Connection attempts, the ping, the keepalive and the startup-status reset/write from global setup. If any run got past setup, the `*.db.test.ts` fixtures of those runs may also have run (these create and delete their own rows).

**What cannot be proven.** Nothing in this container can prove or rule out whether those connections succeeded or whether the startup-status write landed on the remote database. The agents reported that no test body ran and that one run hung at warm-up. That is their report, not verified evidence. The remote database was not inspected, and was deliberately not contacted afterwards.

**Containment.** The processes were killed and `.env.test` was deleted. Every later run was pinned to the throwaway loopback Postgres (`localhost:5433`), with the remote variables unset.

**Safeguard (commits 374dbd17, 6c77a12b, d65d2227, aa6038ed).** `src/infra/test-database-guard.ts` is called by `vitest-global-setup.ts` before any DB access:
- A stale `.env.test` is deleted, never loaded.
- Non-DB runs replace every DB variable with a loopback placeholder.
- DB runs need an explicit `DATABASE_URL` and refuse production authorization flags.
- Every DB variable must be loopback (postgres:/postgresql: TCP only, no `host`/`hostaddr` override). Otherwise `OPSIQ_ALLOW_REMOTE_TEST_DB=true` must be set explicitly; only the three remote-test workflows set it.
- Error messages are sanitized.

The same guard covers:
- the fixture/e2e/demo seed scripts (`scripts/lib/assert-test-database.ts`, `seed-test-db.ts`, `seed-owner-scenarios` CLI)
- Playwright's local dev-server path (`playwright.config.ts`) and the 3 specs that issue SQL.

**Fail-closed proof.** `src/infra/__tests__/test-database-guard.test.ts` (13 tests) includes a source-contract check that global setup calls the guard before connecting. Live runs:
- Incident-shaped env (fake remote `.invalid` host, `TEST_WITH_DB=true`) → vitest aborts `REFUSED`, exit 1, 0 tests, URL not echoed.
- `socket:` scheme → refused.
- Planted stale `.env.test` → deleted and ignored.
- Seeds pointed at a remote URL → refused.
- `playwright test --list` with a remote `DATABASE_URL` → refused. With loopback, or a remote `BASE_URL`, it lists 561 tests.

**Residual (P2/P3, recorded):**
- Concurrent runs in one checkout share `.env.test`, but only guarded URLs can leak between them.
- A loopback tunnel to a remote database cannot be distinguished from a local one.

## Gate verdict (HEAD 24e699c2 + this status update)

BETA INTEGRITY GATE: PASS
