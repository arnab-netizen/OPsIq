# OPSIQ JARVIS 360 — CONTINUOUS IMPLEMENTATION REPORT

Continuation of gap-closure after `OPSIQ_JARVIS_BUSINESS_360_GAP_AUDIT.md`
(classification at start: **OWNER_COMMAND_CENTER_PARTIAL**).

- **Branch:** `claude/opsiq-jarvis-360-audit-m8jro7`
- **Base HEAD:** `6e281f6` (audit report)
- **Canonical local test command:** `node node_modules/vitest/dist/cli.js run <files> --reporter=dot`
  (the `.bin/vitest` symlink is unstable in this sandbox; the direct path is stable.)

## Environment note (non-blocking, per prompt §2.10)
`npm install` repeatedly failed because `@prisma/engines` postinstall downloads
engine binaries from a host blocked by the egress proxy (`ECONNRESET`), which
aborted the whole install and left `node_modules` partial (vitest chunks missing).
**Workaround:** `npm install --ignore-scripts` completes and vitest runs
(`vitest/4.1.7`). DB-backed tests auto-skip (no `TEST_WITH_DB`/Postgres); the
generated Prisma client is not present, so tests that import `@prisma/client`
directly cannot run locally — those are covered by CI. All slice tests here are
DI/pure (inject a mock `db`, mock `@/infra/audit`) and run locally green.

---

## SLICE 0 — DEFAULT-ON SAFETY GATES — **COMPLETE_LOCAL**

### Reuse decision
- **Inspected:** `src/services/recommendation.ts` (promotion path, lines ~715–736),
  `src/services/owner-finance/recommendation-cash-safety.service.ts`,
  `src/services/owner-mode/recommendation-input-quality.service.ts`,
  `src/services/business-impact/recommendation-business-impact.service.ts`,
  `src/services/decision-confidence/recommendation-confidence.service.ts`,
  `src/domain/owner-mode/recommendation-input-quality-gate.ts`,
  `src/domain/owner-finance/cash-safety-gate.ts`, `ClientAccount` model, `src/infra/audit.ts`.
- **Reused:** all four existing, proven promotion gates (`enforce*ForPromotion`),
  the existing sensitivity mapping, the existing `assertInputQualityForPromotion` /
  `assertCashSafetyForPromotion` fail-closed logic, the existing audit helper and
  `requireBusinessImpactAssessment` flag.
- **New code (and why):** one central orchestrator/policy
  (`gate-enforcement-policy.ts`) was required because no single helper existed to
  make the gates default-on and to host the audited opt-out. No new gate engine,
  no duplicate cash/input/business-impact logic.
- **Duplicate engines avoided:** yes — the orchestrator calls the existing gates.
- **Runtime path enforced:** `updateRecommendation` promotion (`status === "approved"`)
  in `src/services/recommendation.ts:719` now calls `enforceOwnerGatesForPromotion`.

### What changed (behavior)
Gates were **opt-in** (only enforced when `requireBusinessImpactAssessment === true`).
Now there are three modes resolved per workspace:
- **OPTED_OUT** — an active, audited owner opt-out exists → gates skipped.
- **STRICT** — legacy flag true → full fail-closed (missing input-quality ⇒ `critical_missing`).
- **DEFAULT_ON** (new default) — gates enforce; when no input-quality assessment
  exists it is treated as `data_limited`, so **material** (finance/growth/pricing/
  hiring/compliance) recs are blocked/downgraded while low-risk **GENERAL** recs
  proceed with caution. Cash-safety missing data already defaults to `AT_RISK`
  (blocks growth, allows non-growth).
Silent opt-out is impossible: opt-out requires owner authority + non-empty reason +
risk class, and emits `owner.gate_opt_out_recorded`.

### Files
- `prisma/schema.prisma` — `ClientAccount` += `ownerGateOptOut{At,Reason,By,Risk,ExpiresAt}` (all nullable).
- `prisma/migrations/20260628100000_owner_gate_opt_out/migration.sql` — additive, idempotent.
- `src/domain/constants/audit-events.ts` — `OWNER_GATE_OPT_OUT_RECORDED/CLEARED`, `OWNER_GATE_PROMOTION_BLOCKED`.
- `src/services/owner-mode/gate-enforcement-policy.ts` — **new** central policy + opt-out service.
- `src/services/owner-mode/recommendation-input-quality.service.ts` — `enforceInputQualityForPromotion` gains a `missingDefault` param (backward-compatible default).
- `src/services/recommendation.ts` — promotion path routes through `enforceOwnerGatesForPromotion`.
- `src/app/api/owner/gates/opt-out/route.ts` — **new** OWNER_MANAGE POST/DELETE opt-out surface.
- `src/__tests__/owner-mode/gate-enforcement-policy.test.ts` — **new** 12 tests.

### Tests
- New: 12 passed (mode resolution incl. fail-safe + expiry + opt-out precedence;
  short-circuit when opted out; opt-out authority/reason/audit/workspace-scope; clear).
- Regression: existing gate suites re-run green — input-quality, cash-safety,
  business-impact, confidence service tests + input-quality-gate domain test = **43 passed**.
- `tsc --noEmit` shows no errors in any changed file.

### Commands run
- `node node_modules/vitest/dist/cli.js run src/__tests__/owner-mode/gate-enforcement-policy.test.ts` → 12 passed
- `node node_modules/vitest/dist/cli.js run <4 gate service tests + domain gate test>` → 43 passed
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` (filtered to changed files) → clean

### Remaining limitations (honest)
- Capacity/equipment gates are not part of this slice (no such engine yet) — deferred to Slice 7 as the audit requires; recorded as a future dependency, not faked here.
- The migration is written but not applied locally (no Postgres); CI applies it.
- DEFAULT_ON enforcement composition (the four gates firing together on real rows)
  is verified by the existing per-gate suites + Slice 15 integration, not by a local DB run.

### Next slice started automatically: **Slice 1 — data sufficiency & evidence disclosure.**

---

## SLICE 1 — DATA SUFFICIENCY & EVIDENCE DISCLOSURE — **COMPLETE_LOCAL**

### Reuse decision
- **Inspected:** `src/domain/owner-mode/input-quality.ts` (status taxonomy, stale/missing
  detection), `src/domain/owner-mode/recommendation-input-quality-gate.ts`,
  `src/domain/owner-finance/cash-safety-gate.ts`, `src/domain/owner-spine/contracts.ts`
  (`buildBusinessConditionProfile` rollup), `src/domain/owner-home/summary.ts`
  (`buildOwnerHomeSummary`), `src/services/owner-home/home.service.ts`.
- **Reused:** the two proven gate evaluators (`evaluateInputQualityGate`,
  `evaluateCashSafetyGate`) — the disclosure adds NO new advisory/scoring logic, only a
  combined status + presentation. Reused the existing profile/home builders.
- **New code (why):** `evidence-disclosure.ts` (a thin composition of the two gates) and
  additive sufficiency fields on the profile + home summary. No duplicate confidence/
  data-quality engine.
- **Duplicate engines avoided:** yes.
- **Runtime path enforced:** the owner command-center home (`home.service.ts:207` →
  `buildOwnerHomeSummary`) now returns `dataSufficiency`; the cross-domain rollup
  (`buildBusinessConditionProfile`, behind `/api/owner/command-center`) now exposes
  `lowestDataConfidenceScore` + `dataSufficiencyStatus` + `lowConfidenceDomains`.
  Block/downgrade on weak data is enforced by the Slice 0 gates.

### What changed (behavior)
- The rollup previously **averaged** domain data-confidence, so a single stale/missing
  domain was hidden. Now the WORST domain confidence is surfaced and a coarse
  `dataSufficiencyStatus` (sufficient/caution/insufficient) is computed; any
  missing-critical-data forces `insufficient` even at high confidence.
- New owner-facing `buildEvidenceDisclosure` composes input-quality + cash-safety into a
  single status ladder (allowed/caution/high_risk/blocked) with prominent stale-data flag,
  data sources, missing inputs, assumptions, confidence, and reasons.
- The gate policy now emits an auditable `owner.gate_promotion_blocked` event whenever a
  promotion gate blocks (previously a silent throw).

### Files
- `src/domain/owner-spine/contracts.ts` — profile schema + builder gain
  `lowestDataConfidenceScore`, `dataSufficiencyStatus`, `lowConfidenceDomains`; new
  `DATA_CONFIDENCE_CAUTION/INSUFFICIENT` constants.
- `src/domain/owner-mode/evidence-disclosure.ts` — **new** pure disclosure composer.
- `src/domain/owner-home/types.ts` + `summary.ts` — `OwnerHomeSummary.dataSufficiency`.
- `src/services/owner-mode/gate-enforcement-policy.ts` — block-audit on gate error.
- `src/__tests__/owner-mode/evidence-disclosure.test.ts` — **new** 8 tests.

### Tests
- New: 8 passed (disclosure allow/caution/high_risk/blocked, stale prominence,
  rollup worst-not-average, missing-critical forces insufficient).
- Regression: owner-spine consumer suites (strategy/operations/marketing/home) = 73 passed;
  combined Slice 0+1 = 28 passed. `tsc` clean on changed files.

### Remaining limitations (honest)
- `missingCriticalData` into the home summary currently defaults to `[]` (the worst-confidence
  signal fully drives the status); wiring the per-workspace `OwnerMissingDataFlag` query is a
  follow-on, not required for the disclosure to function.
- `services.db.test.ts` and other `*.db.test.ts` cannot run locally (no generated Prisma
  client — `prisma generate` hits `ECONNRESET`); environmental, pre-existing, CI-covered.
- `buildEvidenceDisclosure` is consumed by command-center surfaces; deeper per-recommendation
  surfacing is wired further in Slice 9.

### Next slice started automatically: **Slice 2 — finance/cash/margin guardrails.**

---

## SLICE 2 — FINANCE/CASH/MARGIN GUARDRAILS — **COMPLETE_LOCAL**

### Reuse decision
- **Inspected:** `src/domain/owner-finance/unit-economics.ts` (`assessDiscountSafety`,
  `marginFloorPrice` — present but uncalled), `src/domain/owner-finance/metrics.ts`
  (`grossMarginPct`), `OwnerFinancialSnapshot` (revenue/costOfGoods/discountAmount),
  `SpendEntry` (category+amount only — no per-unit price), `spend-governance.ts`.
- **Reused:** the existing gross-margin formula + `RecommendationSensitivity` taxonomy +
  the persisted finance snapshot + the Slice 0 promotion policy.
- **New code (why):** a pure `margin-safety-gate.ts` + a DI enforcement service, because no
  gate actually *blocked* below-margin pricing. No new finance engine.
- **Duplicate engines avoided:** yes.
- **Runtime path enforced:** added as a 5th gate inside `enforceOwnerGatesForPromotion`
  (the same default-on promotion path), so PRICING-sensitive recs are blocked when the
  latest snapshot gross margin is below the floor.

### What changed (behavior)
- Cash-critical already blocks spend/growth/marketing recs via the Slice 0 cash-safety gate
  (growth blocked at AT_RISK, spend/pricing/hiring at CRITICAL) — now default-on.
- **New:** a pricing/discount recommendation is BLOCKED when current gross margin is below a
  15% floor (`DEFAULT_MARGIN_FLOOR_PCT`); unknown margin is deferred to the input-quality gate
  to avoid double-blocking; non-pricing recs are untouched. Owner override is the audited
  workspace opt-out (Slice 0). Blocks emit `owner.gate_promotion_blocked`.

### Files
- `src/domain/owner-finance/margin-safety-gate.ts` — **new** pure gate + `grossMarginPctFrom`.
- `src/services/owner-finance/recommendation-margin-safety.service.ts` — **new** DI enforcement.
- `src/services/owner-mode/gate-enforcement-policy.ts` — margin gate added to the gate set.
- `src/__tests__/owner-finance/margin-safety-gate.test.ts` — **new** 9 tests.

### Tests
- New: 9 passed (below-floor block, at/above allow, non-pricing skip, unknown-margin defer,
  DI service block/allow/skip-snapshot-read). Policy regression: 12 passed. `tsc` clean.

### Remaining limitations (honest)
- The margin floor is a constant (15%); per-business/threshold-config floor is a follow-on.
- There is no Quote/Contract entity yet, so quote-level margin gating arrives in Slice 11;
  this slice gates pricing/discount *recommendations* against the business's actual margin.
- Per-recommendation owner override (vs the workspace-level audited opt-out) is a follow-on.

### Next slice started automatically: **Slice 3 — proof anti-gaming & completion gate.**

---

## Slice completion table

| Slice | Title | Status |
|---|---|---|
| 0 | Default-on safety gates | COMPLETE_LOCAL |
| 1 | Data sufficiency & evidence disclosure | COMPLETE_LOCAL |
| 2 | Finance/cash/margin guardrails | COMPLETE_LOCAL |
| 3 | Proof anti-gaming & completion gate | IN_PROGRESS |
| 4 | Owner load reduction baseline | NOT_STARTED |
| 5 | SOP & checklist lifecycle baseline | NOT_STARTED |
| 6 | Staff training & skills matrix baseline | NOT_STARTED |
| 7 | Equipment/capacity/maintenance baseline | NOT_STARTED |
| 8 | Process review & continuous improvement | NOT_STARTED |
| 9 | Command center & guided execution wiring | NOT_STARTED |
| 10 | Decision arbitration baseline | NOT_STARTED |
| 11 | Marketing/opportunity/contract guardrails | NOT_STARTED |
| 12 | Business memory & do-not-repeat | NOT_STARTED |
| 13 | Self-evaluation loop baseline | NOT_STARTED |
| 14 | Compliance/professional-review boundary | NOT_STARTED |
| 15 | Adversarial simulation & E2E proof | NOT_STARTED |
