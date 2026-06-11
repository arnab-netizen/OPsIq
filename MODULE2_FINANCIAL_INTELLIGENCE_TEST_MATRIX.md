# Module 2 — Financial Intelligence — TEST MATRIX

Status: **PLANNED (NOT STARTED)**. Defines the tests that must exist and pass before
Module 2 can reach `STAGING_PROVEN`. No tests are implemented in this document. All
core-logic tests are deterministic and DB-free; persistence/route/runtime tests use
the existing CI Postgres + deployed-app patterns. Aligns with execution.md §24 and
the addendum §6.

Test locations (planned): unit/domain →
`src/__tests__/owner-finance/*.test.ts`; route/persistence/authz → existing
`withCanonicalEnforcement` test patterns; runtime → a new HTTP smoke modelled on
`scripts/smoke-owner-recovery-runtime-proof.ts`.

---

## 1. Unit tests — financial calculations (deterministic)

For each derived metric (§4 of SPEC): correct value on known inputs; `null` when
inputs insufficient; currency preserved (never assumes USD); pure (same input → same
output). Specifics:
- gross/net/contribution margin (incl. negative).
- fixedCostBurdenPct, costLeakageRatioPct, discountLeakagePct.
- breakEvenRevenue + dailyBreakEvenRevenue (incl. contribution ≤ 0 → `null`/flagged).
- cashRunwayDays (positive burn, zero/negative burn → `null`/"not burning").
- debtServicePressurePct, receivablesPressurePct, payablesPressurePct,
  ownerWithdrawalPressurePct.
- profitPerOrder / profitPerCustomer only when counts present (else `null`).
- revenueQualityScore, financialHealthScore, financialRiskScore,
  financialOpportunityScore — monotonic sanity (worse inputs → worse score) +
  bounded 0–100.
- dataConfidenceScore — bounded 0–1, decreases as critical inputs go missing.

## 2. Risk detection tests

Each §5 risk rule fires exactly when its threshold is crossed and not otherwise;
boundary values tested; each produced Finding carries source metric + threshold +
severity + confidence + verificationMetric. Thresholds resolved from industry
template; generic fallback path tested.

## 3. Opportunity detection tests

Each §6 opportunity fires only when supporting inputs exist; "insufficient data" path
emits no fabricated opportunity; opportunity Findings carry expected-impact provenance.

## 4. Recommendation tests

Every recommendation includes all mandatory traceability fields (source metric,
threshold, severity, expected impact, confidence, owner action, verification method,
timeframe). Negative test: a recommendation missing any field fails the test. Anti-
invention: no recommendation introduces a numeric value not derivable from inputs.

## 5. Action creation tests

Each Finding → one Action with valid initial status `proposed`, correct
`metricToMove`, `verificationMethod`, priority, `domain="finance"`, and Spine
prioritization fields populated. No action without a parent Finding.

## 6. Verification tests

Before baseline captured at creation; after-value recorded; classification
(`verified_improved` / `verified_not_improved` / `disputed` / `unverified`) computed
honestly from metricToMove direction; non-improvement recorded truthfully; invalid
state transitions rejected.

## 7. API route tests

Each `/api/owner/finance/*` route: success shape (canonical JSON), input validation
rejects malformed bodies (safe errors), correct status codes, no secret leakage. POST
snapshot → 201; GET metrics/risks/dashboard → 200; PATCH action via shared route.

## 8. Authz tests

Unauthenticated → 401/403; non-owner without capability → 403; `OWNER_VIEW` cannot
mutate; `OWNER_MANAGE` required for writes.

## 9. Workspace isolation tests

Cross-workspace snapshot/finding/action access blocked (≥400, 404 for foreign id);
list/read scoped to `verifiedWorkspaceId`; no cross-tenant leakage in dashboard rollup.

## 10. Persistence tests

Snapshot/finding/action/verification persist and read back identically; transactional
writes where multiple rows created atomically (diagnosis + findings + actions);
optimistic `version` increments; audit fields populated.

## 11. Dashboard read tests

Dashboard returns persisted data only (no mock); reflects latest snapshot, ranked
risks, single next action, verified wins, data-confidence/missing-data banner; finance
DomainScore emitted to Business Condition Profile.

## 12. Business-model adaptability tests

Same metric inputs under service vs inventory model → different relevant
metrics/findings; B2B-heavy vs B2C-heavy → different receivables/revenue-quality
weighting; irrelevant inputs absent do not lower confidence. Industry-template tests:
same inputs, different template pack → different fired thresholds; generic fallback
when template unknown.

## 13. Missing-data / data-confidence tests

Missing critical input (revenue or costs) → metric `null`, confidence lowered,
"missing data" surfaced, recommendation becomes "collect/confirm <metric>"; stale
snapshot flagged; partial-period data flagged; confidence never silently upgraded.

## 14. Anti-hallucination tests

No invented revenue/cost/customer/market/tax numbers; with all inputs missing, system
returns "insufficient data," not a guessed diagnosis; recommendations cite only
metrics present in the snapshot.

## 15. Runtime smoke proof requirements (deployed HTTP)

New manual workflow + HTTP smoke (model: `module-1-owner-recovery-runtime-proof`):
owner session → create business → submit FinancialSnapshot (INR) → get metrics →
get risks (findings persisted) → finance action created → complete action (evidence)
→ verify → dashboard reflects finance condition + the action + verification →
**finance contributes to the owner Business Condition Profile** → security checks
(unauth blocked, foreign business blocked, invalid transition rejected). Masked IDs
only; no secrets. Fail-closed `confirm` input.

## 16. CI gates

`git diff --check` · `npm run lint:ratchet` (no error increase) · `npx prisma
validate` · `npm run build` · `npm test` (full suite green, 0 failed) · `npx vitest
run src/__tests__/owner-finance/` · `npx vitest run src/__tests__/founder-recovery/`
(Module 1 unaffected) · migration applied via manual workflow (no auto-migrate on
push) · deployed runtime smoke green.

---

## Required edge cases (explicit)

zero revenue · negative profit · missing cost · missing revenue · high fixed cost ·
high debt/EMI pressure · receivables overdue · payables overdue · break-even not
reached · invalid currency · duplicate snapshot (same period) · stale snapshot ·
partial period data · unusually high revenue spike · unusually high cost spike ·
no-receivables/payables business · service vs inventory business · B2B-heavy vs
B2C-heavy · Tumbledry-like laundry example (validation only).

## False-green guards (must all hold)

- A calculation test that passes for the wrong reason (hardcoded expected = code
  output) is forbidden; expected values are computed independently in the test.
- Dashboard tests must read persisted rows, not in-memory fixtures presented as real.
- Runtime smoke must fail on the exact endpoint/status if any step regresses (no
  silent adapt).
- Module 1 suite must remain green (no behavioral change to proven recovery loop).
