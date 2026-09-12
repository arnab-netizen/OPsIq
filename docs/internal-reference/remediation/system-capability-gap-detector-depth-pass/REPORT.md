# OpsIQ Capability Gap Detector / System Feature Recommendation Engine — Depth Pass

Classification: `SYSTEM_CAPABILITY_GAP_DETECTOR_REAL_AND_OWNER_VISIBLE`

## A. Files created
- `src/domain/owner-mode/system-capability-gap-detector.ts` — pure `buildCapabilityGapDetector` engine.
- `src/__tests__/owner-mode/system-capability-gap-detector.test.ts` — 16 pure unit tests.
- `src/__tests__/components/capability-gap-panel.test.tsx` — 5 jsdom component tests.
- `src/__tests__/execution/system-capability-gap-detector-simulation.db.test.ts` — laundry DB simulation (2 tests).
- `docs/remediation/system-capability-gap-detector-depth-pass/REPORT.md` — this file.

## B. Files changed
- `src/services/owner-guidance/owner-now-view.service.ts` — `capabilityGaps` added to `OwnerNowViewPayload`; `deriveCapabilityGapSignals(...)` builds gap signals from the approval policy (unautomatable decisions), owner workload (manual burden), and corrections (missing data); `gapConfidenceFromLevel` maps the evidence confidence.
- `src/components/owner/ProcessIntelligencePanel.tsx` — `CapabilityGapPanel` + view types (`CapabilityGapView`, `CapabilityRecommendationView`, `CapabilityGapSummaryView`).
- `src/app/(authenticated)/owner/process-intelligence/page.tsx` — "What OpsIQ should build next" section.
- `src/__tests__/app/owner-process-intelligence-page.test.tsx` — mock extended with `capabilityGaps`; asserts the new section renders.
- `.github/workflows/db-verification.yml` — new DB sim added to LANE_B and LANE_A file lists.

## C. Schema changes
None. Pure derivation over already-derived now-view blocks.

## D. Backend logic implemented
- **`buildCapabilityGapDetector(input, workspaceId, evaluatedAt)`** — pure + deterministic. Groups gap signals by the capability they imply and emits one **21-field `SystemCapabilityRecommendation`** per capability: problem statement, recommended capability, owner benefit, whether it unlocks automation + which actions, a governance guardrail, aggregated severity (max), signal count, deduped evidence, what is blocked today, data dependency, a fixed per-capability complexity band, a priority rank, and `status: "RECOMMENDED"` (never auto-built). Ranked most-severe then most-supported first; summary counts total/critical/high/unlocks-automation.
- **≥8 missing-capability types** (14 total): `VERIFIED_FINANCIAL_LEDGER`, `REFUND_RECONCILIATION`, `MARGIN_SIMULATION`, `SPEND_CONTROL_LEDGER`, `COMPENSATION_INTEGRATION`, `CONTRACT_TERMS_REGISTRY`, `LEGAL_REVIEW_WORKFLOW`, `IDENTITY_EVIDENCE_CHAIN`, `AUTOMATED_PROOF_CAPTURE`, `REAL_TIME_KPI_FEED`, `SUPPLIER_INVENTORY_INTEGRATION`, `CUSTOMER_FEEDBACK_INTAKE`, `AUTOMATED_ROLLBACK`, `DEMAND_VALIDATION`.
- **`deriveCapabilityGapSignals`** — three real signal sources: (1) approval-policy decisions carrying a capability gap → `UNAUTOMATABLE_DECISION` (capability mapped from the policy's lightweight enum); (2) owner workload burden → `MANUAL_OWNER_BURDEN` (proof burden → automated proof capture, recurring-complaint escalation → customer-feedback intake); (3) missing complaint/rework data → `MISSING_OPERATIONAL_DATA` → customer-feedback intake.

## E. Frontend logic implemented
`CapabilityGapPanel` (Executive Cockpit standard): the single highest-priority capability by default (what OpsIQ can't do today, the recommendation, the owner benefit, what it unlocks, the governance guardrail), evidence/blocks collapsed in a `<details>`, a summary counts line, and the rest behind a `<details>` summary. Prop-driven; no business logic.

## F. Acceptance criteria checklist
- [x] Pure `buildCapabilityGapDetector` with a 21-field recommendation shape.
- [x] ≥8 missing-capability types (14 provided).
- [x] Scans the now-view for gaps and recommends system features.
- [x] `capabilityGaps` wired into the now-view payload + `CapabilityGapPanel`.
- [x] 16 pure tests + 5 component + 1 page assertion + laundry DB simulation.
- [x] DB sim wired into LANE_B and LANE_A.
- [x] `tsc` 0 · governance 31 frozen / 0 new · lint:ratchet PASS.

## G. Known limitations
- The now-view derives gap signals from three sources (approval policy, workload, corrections). Other potential gap sources (real-time KPI/supplier/inventory integrations) are represented in the catalogue but only surface once a corresponding signal exists.
- Complexity is a fixed per-capability band, never a fabricated effort/cost estimate.

## H. Manual verification steps
1. `npx vitest run src/__tests__/owner-mode/system-capability-gap-detector.test.ts` → 16 passed.
2. `npx vitest run src/__tests__/components/capability-gap-panel.test.tsx` → 5 passed.
3. `npx vitest run src/__tests__/app/owner-process-intelligence-page.test.tsx` → 2 passed.
4. LANE_B/LANE_A run `system-capability-gap-detector-simulation.db.test.ts` against real Postgres.
5. Load `/owner/process-intelligence` → "What OpsIQ should build next" section.

## I. Trigger map
Approval-policy capability gap / owner workload burden / missing data → `deriveCapabilityGapSignals` → `buildCapabilityGapDetector` → `capabilityGaps` in the Owner Now View → `CapabilityGapPanel`.

## J. Failure modes covered
No gaps → null (no fabricated recommendation); empty/clean workspace → no capability gap, no evidence leak; every recommendation is `RECOMMENDED` (never auto-built); material decisions stay owner-controlled even after the capability exists; no fabricated money, no fraud/negligence/HR-discipline language, no hidden score.

## K. Events emitted
None (read/derivation path; no mutation).

## L. Automated tests added
16 pure unit + 5 component + 1 page assertion + 2 DB simulation = 24 new checks.
