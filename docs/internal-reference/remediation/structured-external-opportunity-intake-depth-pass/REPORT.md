# Structured External Opportunity Intake — Depth Pass (hostile-hardened)

Classification: `STRUCTURED_EXTERNAL_OPPORTUNITY_INTAKE_REAL_AND_OWNER_VISIBLE`

A controlled **structured** live intake path (never scraping, never autonomous action) that lets a real
owner/manager/system submit an external opportunity signal, plus a full **opportunity operating layer** on
top of the External Opportunity Intelligence engine so the loop runs on live data — a real opportunity
operating layer, not a passive signal list or enum shell.

## A. Files created
- `src/domain/owner-mode/external-opportunity-intake.ts` — 13 intake types, submission validation/normalisation, source-quality, engine mapping (tender-aware).
- `src/domain/owner-mode/opportunity-operating-layer.ts` — the decision loop: source quality + evidence strength → business-fit gate → tender bid/no-bid gate → win-readiness + proof pack → prep checklist → freshness → negative reasons → next-action owner → quality band → clustering → repeated-blocker learning.
- `src/services/owner-mode/external-opportunity-intake.service.ts` — governed submit (persist + audit + idempotent) + `getActiveExternalOpportunitySignals`.
- `src/app/api/owner/opportunities/signals/route.ts` — `POST` (OWNER_MANAGE, workspace-scoped, validated).
- `src/__tests__/owner-mode/external-opportunity-intake.test.ts` — 23 domain/operating-layer tests.
- `src/__tests__/owner-mode/external-opportunity-intake.service.test.ts` — 7 service tests (in-memory DB).
- `src/__tests__/components/opportunity-operating-panel.test.tsx` — 7 jsdom component tests.
- `src/__tests__/execution/external-opportunity-intake-simulation.db.test.ts` — DB-backed laundry multi-source sim.
- `prisma/migrations/20260706000000_external_opportunity_signal/migration.sql` — new table.
- this report.

## B. Files changed
- `prisma/schema.prisma` — `ExternalOpportunitySignal` model.
- `src/domain/constants/audit-events.ts` — `OWNER_OPPORTUNITY_SIGNAL_SUBMITTED`.
- `src/services/owner-guidance/owner-now-view.service.ts` — live persisted signals feed the intelligence engine AND drive `opportunityOperating` (built from a `BusinessStateContext` derived from live now-view data); new optional `externalOpportunitySignals` dep.
- `src/components/owner/ProcessIntelligencePanel.tsx` — `OpportunityOperatingPanel` + view types.
- `src/app/(authenticated)/owner/process-intelligence/page.tsx` — "Submitted opportunity signals" subsection in the Grow group.
- `src/__tests__/app/owner-process-intelligence-page.test.tsx` — mock + assertion.
- `.github/workflows/db-verification.yml` — new DB sim wired into LANE_B and LANE_A.

## C. Schema changes
New table `external_opportunity_signals` (workspace-scoped, `UNIQUE(workspace_id, idempotency_key)`, indexed on `(workspace_id, status)`). Additive, backfill-safe, non-destructive. Numeric value/exposure are stored for the record only — never turned into profit/impact.

## D. Intake types supported (13)
COMPETITOR_REVIEW_GAP, B2B_DEMAND_SIGNAL, GOVERNMENT_TENDER, PUBLIC_PROCUREMENT_NOTICE, CORPORATE_VENDOR_OPPORTUNITY, GRANT_OR_SCHEME_SIGNAL, PRICING_GAP, SERVICE_GAP, COMMUNITY_OR_APARTMENT_DEMAND, SUPPLIER_OR_COST_ADVANTAGE, MARKET_TREND_SIGNAL, MANUAL_OWNER_OBSERVATION, DATA_INSUFFICIENT.

## E. Operating layer (the real decision loop, not an enum shell)
- **Source quality** (8 values) + **evidence strength** (4) — evidence is capped by source: unverified/low sources can never be STRONG.
- **Current-business-fit gate** — businessFit / capacityFit bands + executionReadiness (8 states). Unresolved critical bottleneck → unrelated growth is WEAK/parked (STRATEGIC_DISTRACTION); a signal that addresses the bottleneck stays active but still validation-gated; unknown capacity ⇒ never STRONG.
- **Tender bid/no-bid gate** — 9 decisions; unknown eligibility→COLLECT_ELIGIBILITY_DATA, missing docs→COLLECT_DOCUMENTS, unknown cost→COLLECT_COST_DATA, unknown compliance/high EMD/payment-delay/cash→OWNER_REVIEW_REQUIRED, expired→DO_NOT_BID. `submissionAllowed` is **always false**; PREPARE_BID_DRAFT ≠ submission.
- **Win-readiness** (never a fake %) + **proof-pack requirement** (missing proof lowers win-readiness and becomes checklist items).
- **Prep checklist** (7 types) with owner/manager/staff/OpsIQ-draft delegation, blocking items, deadline items.
- **Freshness** (5 values) — expired tenders can never be active candidates.
- **Negative reasons** (18) — owner-visible, downgrade/park/review.
- **Next-action owner** (6) — owner only for material decisions; advisor for compliance uncertainty; OpsIQ drafts only.
- **Opportunity quality** (HIGH/MEDIUM/LOW/UNKNOWN) — transparent bands, no hidden numeric score; unknown data can never be HIGH.
- **Clustering/anti-spam** — similar signals collapse into one cluster; duplicates don't inflate priority.
- **Repeated-blocker learning** — a blocker hit ≥2× produces a capability recommendation.

## F. Owner cockpit integration
`OpportunityOperatingPanel` under the Grow group: one top opportunity (or cluster) with quality band, fit/evidence line, tender bid/no-bid state + never-auto-submit guardrail, win-readiness, negative reasons, a collapsed delegated prep checklist, next-action owner — top-action-first, no raw spam. The live now-view also feeds submitted signals into `externalOpportunityIntelligence` so a submitted signal can become the top candidate/validation/portfolio item.

## G. Tests added
23 domain/operating + 7 service + 7 component + page assertions + 5 DB-sim checks = 42 new checks (plus the existing opportunity suites still green).

## H. DB sim result
`external-opportunity-intake-simulation.db.test.ts` submits 8 real signals (competitor ×2 duplicate, B2B, government tender, manual, grant, expired procurement, high-cash corporate vendor) via the governed service against real Postgres, then asserts through `getOwnerNowView`: persistence + audit, duplicate cluster collapse, tender gates (collect-eligibility / expired do-not-bid / high-cash owner-review, never submittable), weak win-readiness + prep checklist for the proof-less B2B, repeated-blocker capability recommendation, cockpit top-only, no scale/fabrication, workspace isolation, clean-workspace-null, and idempotent resubmit.

## I. DB sim CI execution proof
To be taken at the merge gate from the LANE_B log (expect Test Files 36 with the `external-opportunity-intake-simulation.db.test.ts ✓` line + `LANE_B_DB_VERIFIED`). A green lane alone is not accepted.

## J. Commands run
`prisma validate` ✅ · `prisma generate` ✅ · `tsc --noEmit` 0 · `governance:scan:strict` 31 frozen / 0 new · `lint:ratchet` PASS · intake/operating/service/component/page suites green · portfolio/validation/intelligence/now-view suites green (no regression).

## K. Commands failed/blocked
None. (DB sim runs only under `TEST_WITH_DB=true` in CI, as designed.)

## L. Known limitations
- Live `BusinessStateContext` reports staff/equipment/delivery capacity as UNKNOWN (the now-view does not yet measure per-resource capacity) — honestly surfaced (unknown ⇒ never STRONG fit), never guessed.
- The owner **submit form** UI is not built this pass; the live intake path is the governed `POST /api/owner/opportunities/signals` route + service (with an in-memory-DB service test and a real-Postgres DB sim). The read cockpit surface (`OpportunityOperatingPanel`) is built. This is an API-first UI decision, not a gap in the intake path.

## Hostile completion gate
1. Reject noisy signals? **Yes** (validation + REJECT/PARK + evidence caps). 2. Dedupe? **Yes** (dedupeKey). 3. Group/cluster? **Yes**. 4. Tender bid/no-bid? **Yes** (9 decisions). 5. Detect eligibility/document/cost/compliance gaps? **Yes**. 6. Block expired/stale? **Yes** (freshness). 7. Weak win-readiness? **Yes**. 8. Prep checklists? **Yes** (7 types). 9. Next-action ownership? **Yes** (6). 10. Proof-pack requirements? **Yes**. 11. Negative reasons? **Yes** (18). 12. Avoid owner overload? **Yes** (top-only + clusters). 13. Avoid scale-before-validation? **Yes** (validationRequired always true). 14. Avoid fake money/profit/win %? **Yes** (bands only; JSON-asserted no `%`, `[$£€]\d`, `score`, `guarantee`). 15. Learn from repeated blockers? **Yes**. 16. DB sim proves competitor + B2B + tender/procurement + manual/grant? **Yes**. 17. LANE_B proves the DB sim executed? **To be verified at the merge gate from the LANE_B log.**
