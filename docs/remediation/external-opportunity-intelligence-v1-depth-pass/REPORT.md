# External Opportunity Intelligence v1 — Depth Pass

Classification: `EXTERNAL_OPPORTUNITY_INTELLIGENCE_V1_REAL_AND_OWNER_VISIBLE`

## A. Files created
- `src/domain/owner-mode/external-opportunity-intelligence.ts` — the full intake→classify→dedupe→tender-screen→promote→guardrail loop (pure).
- `src/__tests__/owner-mode/external-opportunity-intelligence.test.ts` — 25 required + 1 pipeline-composability = 26 unit tests.
- `src/__tests__/components/opportunity-panel.test.tsx` — 7 jsdom component tests.
- `src/__tests__/execution/external-opportunity-intelligence-simulation.db.test.ts` — DB-backed laundry sim + multi-family (competitor / B2B / tender / grant) loop proof.
- `docs/remediation/external-opportunity-intelligence-v1-depth-pass/REPORT.md` — this file.

## B. Files changed
- `src/services/owner-guidance/owner-now-view.service.ts` — `externalOpportunityIntelligence` added to `OwnerNowViewPayload`; `deriveExternalOpportunitySignals` derives an evidence-backed retention opportunity from a recurring internal complaint pattern; wired through cash/profit protection + capability gaps + approval boundary.
- `src/components/owner/ProcessIntelligencePanel.tsx` — `OpportunityPanel` + view types (candidate, tender candidate, summary).
- `src/app/(authenticated)/owner/process-intelligence/page.tsx` — "Grow: opportunities to validate" cockpit group.
- `src/__tests__/app/owner-process-intelligence-page.test.tsx` — mock extended; asserts the group renders.
- `.github/workflows/db-verification.yml` — new DB sim added to LANE_B and LANE_A file lists.

## C. Schema changes
None. Structured/manual external signal intake is the engine's input contract; internal auto-intake derives from existing complaint/rework data.

## D. Backend logic implemented (the real loop, not a shell)
Exported, individually-tested pure stages:
- **`normalizeExternalOpportunitySignals`** — fills bands, computes evidence completeness + promotion readiness + missing fields.
- **`dedupeOpportunitySignals`** — collapses duplicates by dedupe key.
- **`classifyRawOpportunitySignals`** — RAW / DUPLICATE / IRRELEVANT / NEEDS_DATA / CANDIDATE / REJECTED / PARKED. Vague/unsupported ideas never become owner-visible candidates.
- **`screenTenderProcurementSignal`** — separate eligibility / cost / compliance / EMD / payment-delay / working-capital / capacity screen. Decisions: `REJECT_UNFIT` / `PARK` / `COLLECT_ELIGIBILITY_DATA` / `COLLECT_COST_DATA` / `OWNER_REVIEW_REQUIRED` / `VALIDATE_CHEAPLY` / `PREPARE_BID_DRAFT` / `DO_NOT_BID` / `NEEDS_CAPABILITY`. Never auto-submits; `readyToBid` is never a submission and is only reachable when eligibility+cost+compliance+capacity+cash are all known & safe; owner approval always required.
- **`promoteOpportunityCandidate`** — cash/profit guardrail → capability-gap check → approval-policy → owner-workload screen. Steps: `REJECT` / `PARK` / `COLLECT_DATA` / `COLLECT_ELIGIBILITY_DATA` / `COLLECT_COST_DATA` / `VALIDATE_CHEAPLY` / `PREPARE_BID_DRAFT` / `OWNER_REVIEW` / `NEEDS_CAPABILITY`.
- **`buildExternalOpportunityIntelligence`** — orchestrates the loop; the owner cockpit sees only the top material candidate + top tender; every other signal is classified and summarised for audit.
- **20 signal source categories** supported (competitor, local search, complaint pattern, B2B demand, pricing/service gap, seasonal/local event, supplier advantage, market trend, regulatory, community/apartment, social pain, manual observation, **government tender**, **public procurement**, **corporate vendor**, **grant/scheme**, **export/institutional**, data-insufficient).
- **Guarantees:** validation always required; no candidate is ever ready-to-scale; missing evidence/unit-economics lowers confidence and links a capability gap; no fabricated market data / profit guarantee / hidden score.

## E. Frontend logic implemented
`OpportunityPanel` (Executive Cockpit standard): top material candidate (next step first, why, segment, cash/workload risk, approval, evidence collapsed), a tender/procurement block only when relevant (with the "OpsIQ never submits automatically — owner approval required" guardrail and never-ready-to-bid state), and an ingest/dedupe summary — never a raw signal dump.

## F. Acceptance criteria checklist
- [x] Raw signal intake + classification (7 states).
- [x] Dedupe; reject/park/needs-data.
- [x] Tender/procurement screen + owner-approval guardrail (never auto-submit / ready-to-bid).
- [x] Cash/profit + capability-gap + approval + owner-workload integration.
- [x] ≥8 signal source categories (20 supported).
- [x] Owner cockpit shows top candidate + top tender only.
- [x] Validation required; no ready-to-scale.
- [x] 26 domain + 7 component + 1 page assertion + DB sim (multi-family).
- [x] DB sim wired into LANE_B/LANE_A.
- [x] `tsc` 0 · governance 31 frozen / 0 new · lint:ratchet PASS.

## G. Known limitations
- **Live auto-intake in the now-view currently derives one internal family** (customer-complaint → retention). Broad external/manual/tender/grant intake is fully implemented and tested in the engine and exercised over four families in the DB sim, but feeding those families *live* needs a structured intake path (owner-entered / connector persistence) — which is itself surfaced as a capability need. No live scraping or paid sources are used (by design).
- `validationCostEstimate` and tender EMD/cost are reported only when the caller supplies them (never fabricated).

## H. Manual verification steps
1. `npx vitest run src/__tests__/owner-mode/external-opportunity-intelligence.test.ts` → 26 passed.
2. `npx vitest run src/__tests__/components/opportunity-panel.test.tsx` → 7 passed.
3. `npx vitest run src/__tests__/app/owner-process-intelligence-page.test.tsx` → 2 passed.
4. LANE_B/LANE_A run `external-opportunity-intelligence-simulation.db.test.ts` against real Postgres.
5. Load `/owner/process-intelligence` → open "Grow: opportunities to validate".

## I. Trigger map
Recurring internal complaint pattern (+ structured external signals via the engine) → `deriveExternalOpportunitySignals` → the loop → `externalOpportunityIntelligence` in the Owner Now View → `OpportunityPanel`.

## J. Failure modes covered
Vague/no-evidence → NEEDS_DATA; duplicates collapse; irrelevant → REJECTED/PARKED; tender unknown eligibility/cost/compliance → collect-data/owner-review; high EMD/payment-delay/cash → owner review; missing unit economics → capability gap; clean workspace → null; workspace isolation preserved; no fabricated money/market data, no profit guarantee, no ready-to-scale, no hidden score, no fraud/HR-discipline language.

## K. Events emitted
None (read/derivation path; no mutation).

## L. Automated tests added
26 pure + 7 component + 1 page assertion + 3 DB-sim checks (2 DB-backed + 1 multi-family loop) = 37 new checks.

## Hostile self-audit (required by the add-on)
1. Merely enums/shapes without filtering? **No** — full pipeline with real classify/dedupe/screen/promote logic + 26 tests.
2. Can raw signals be rejected/parked/deduped/needs-data? **Yes.**
3. Tenders screened safely? **Yes** — separate eligibility/cost/compliance/cash/capacity screen.
4. Every tender requires owner approval before submission? **Yes** — `ownerApprovalRequired` always true; PREPARE_BID_DRAFT ≠ submission; never auto-submitted.
5. Missing unit economics blocks confidence? **Yes** — lowered to LOW + NEEDS_CAPABILITY/COLLECT_COST_DATA.
6. Cash/profit protection blocks risky opportunities? **Yes** — active risk / high cash → OWNER_REVIEW.
7. Approval policy blocks high-risk actions? **Yes** — material/high-risk → OWNER.
8. Capability gaps surfaced? **Yes** — `systemCapabilityRecommendation` + `capabilityRecommendations`.
9. Owner UI avoids raw-signal overload? **Yes** — top candidate + top tender + summary only.
10. DB sim proves a realistic flow? **Yes** — DB-backed now-view candidate + multi-family loop (dedupe, tender screen, guardrails).
11. Avoided fake market data? **Yes.** 12. Avoided profit guarantees? **Yes.** 13. Avoided scale-before-validation? **Yes.**
14. DB sim actually ran in CI before merge? **To be verified at the merge gate from the LANE_B log** (a green lane alone is not accepted).
