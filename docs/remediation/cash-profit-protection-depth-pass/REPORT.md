# Cash / Profit Protection Depth — Depth Pass

Classification: `CASH_PROFIT_PROTECTION_REAL_AND_OWNER_VISIBLE`

## A. Files created
- `src/domain/owner-mode/cash-profit-protection.ts` — pure `buildCashProfitProtection` engine.
- `src/__tests__/owner-mode/cash-profit-protection.test.ts` — 16 pure unit tests.
- `src/__tests__/components/cash-profit-panel.test.tsx` — 6 jsdom component tests.
- `src/__tests__/execution/cash-profit-protection-simulation.db.test.ts` — laundry DB simulation (2 tests).
- `docs/remediation/cash-profit-protection-depth-pass/REPORT.md` — this file.

## B. Files changed
- `src/services/owner-guidance/owner-now-view.service.ts` — `cashProfitProtection` added to `OwnerNowViewPayload`; derived from real financial readings (defaulted `0`s are treated as "no reading", never a fabricated cash crisis) + rework/delivery counts; computed only when there is real activity or a real financial context.
- `src/components/owner/ProcessIntelligencePanel.tsx` — `CashProfitPanel` + view types (`CashProfitProtectionView`, `CashProfitSignalView`, `CashProfitSummaryView`).
- `src/app/(authenticated)/owner/process-intelligence/page.tsx` — "Protect cash & profit" cockpit group (first collapsed group).
- `src/__tests__/app/owner-process-intelligence-page.test.tsx` — mock extended with `cashProfitProtection`; asserts the group renders.
- `.github/workflows/db-verification.yml` — new DB sim added to LANE_B and LANE_A file lists.

## C. Schema changes
None. Pure derivation over existing snapshot / operational readings.

## D. Backend logic implemented
- **`buildCashProfitProtection(input, workspaceId, evaluatedAt)`** — pure + deterministic. Emits **11 protection signal types** — `CASH_SAFETY_RISK`, `LOW_MARGIN_WORK_RISK`, `PRICING_LEAK`, `DISCOUNT_LEAK`, `REWORK_COST_RISK`, `DELIVERY_COST_RISK`, `STAFF_INEFFICIENCY_COST_RISK`, `B2B_UNDERPRICING_RISK`, `WORKING_CAPITAL_STRAIN`, `MISSING_UNIT_ECONOMICS`, `PROFIT_DATA_INSUFFICIENT` — each a **23-field signal** with category, severity, confidence, a protective action, approval level + owner-review flag, a risk guardrail, a directly-counted observed count, a metric type + **real metric value (or null)** + threshold, evidence refs, and missing-data. Most severe first; summary counts total/critical/high/owner-review.
- **No fabricated money:** `metricValue` is only ever a real caller-provided number, else null; risk is expressed as type + severity + direction, never an invented amount. Defaulted zero financial readings are passed as `null` so no cash crisis is invented from missing data.
- **Owner control:** material money decisions (cash, margin, pricing, discount, B2B) require owner review; cost-at-source fixes (rework, delivery, staffing, receivables) are manager-level and reversible.

## E. Frontend logic implemented
`CashProfitPanel` (Executive Cockpit standard): the single most severe risk by default (protective action first, plain explanation, a real metric chip only when a real value exists, owner-review marker + guardrail), evidence collapsed in a `<details>`, a summary counts line, and the rest behind a summary. Shown in the "Protect cash & profit" progressive-disclosure group.

## F. Acceptance criteria checklist
- [x] 11 protection signal types.
- [x] 23-field signal shape.
- [x] Pure `buildCashProfitProtection`; no fabricated financial impact.
- [x] `cashProfitProtection` wired into the now-view payload + `CashProfitPanel`.
- [x] 16 pure tests + 6 component + 1 page assertion + laundry DB simulation.
- [x] DB sim wired into LANE_B and LANE_A.
- [x] `tsc` 0 · governance 31 frozen / 0 new · lint:ratchet PASS.

## G. Known limitations
- The now-view currently feeds cash runway, net margin, and rework/delivery counts; pricing/discount/B2B/receivable/labour counts are passed as `0` until a deeper finance integration provides them (never guessed). Per-job unit economics are honestly reported as missing (`MISSING_UNIT_ECONOMICS`) until captured.

## H. Manual verification steps
1. `npx vitest run src/__tests__/owner-mode/cash-profit-protection.test.ts` → 16 passed.
2. `npx vitest run src/__tests__/components/cash-profit-panel.test.tsx` → 6 passed.
3. `npx vitest run src/__tests__/app/owner-process-intelligence-page.test.tsx` → 2 passed.
4. LANE_B/LANE_A run `cash-profit-protection-simulation.db.test.ts` against real Postgres.
5. Load `/owner/process-intelligence` → open "Protect cash & profit".

## I. Trigger map
Real financial readings + rework/delivery counts + data-completeness → `buildCashProfitProtection` → `cashProfitProtection` in the Owner Now View → `CashProfitPanel`.

## J. Failure modes covered
Healthy business → no risk signal; empty/clean workspace → null (nothing to protect), no evidence leak; defaulted-zero financials → treated as "no reading" (no invented cash crisis); missing unit economics / financials → honest `MISSING_UNIT_ECONOMICS` / `PROFIT_DATA_INSUFFICIENT` rather than a fabricated profit picture; material money decisions keep owner review; no fabricated money, no fraud/negligence/HR-discipline language, no hidden score.

## K. Events emitted
None (read/derivation path; no mutation).

## L. Automated tests added
16 pure unit + 6 component + 1 page assertion + 2 DB simulation = 25 new checks.
