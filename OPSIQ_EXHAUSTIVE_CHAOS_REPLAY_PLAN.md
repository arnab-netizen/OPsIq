# OpsIQ Exhaustive Real-World Chaos Replay — Plan

> Lift **all 180 counted chaos scenarios** from runtime/in-memory proof (already shipped) up to **DB-backed +
> dashboard + real-browser** proof, with an exact per-scenario proof ledger. Additive and conservative only;
> no existing gate weakened; no synthetic/unsourced scenario counted; no overclaiming.

- **Branch:** `claude/exhaustive-real-world-chaos-replay`
- **Base HEAD:** `cbcb9519c07dc1083f5ad7e2b7195ed6050f7b82` (includes PR #63 merge `cbcb951`)

## 0. Ground truth (measured from the repo, not assumed)

| Fact | Value | Source of truth |
|---|---|---|
| **Counted scenarios** | **180** | `COUNTED_CHAOS_SCENARIOS` (165) + `INDEPENDENT_GOLD_CASES` (15) |
| Chaos corpus | **165** = 15 categories × 11 sourced patterns | `src/behavioral-validation/chaos-replay/chaos-corpus.ts` |
| Independent gold | **15** (1 per category) | `src/behavioral-validation/chaos-replay/independent-gold.ts` |
| Categories | **15** | `REQUIRED_CATEGORIES` |
| Patterns | **11** | `CHAOS_PATTERN_SET` |
| Unique sources | **26** = 11 corpus + 15 independent | corpus `sourceRefs` ∪ `INDEPENDENT_SOURCES` |
| good/bad/ugly (corpus) | 15 / 60 / 90 | `computeCoverage()` |

### 1. Exact scenario count
**180** distinct counted scenarioIds. (165 `CHAOS-PC-<pattern>-<category>-r0` + 15 `IGOLD-<category>`.)

### 2. Exact scenarioId list
Generated deterministically into the ledger (§15). Corpus ids = `CHAOS-${caseId}` for every (category × pattern); gold ids = `IGOLD-<category>`. The ledger is the authoritative list and is asserted to contain exactly 180 unique ids.

### 3. Exact source count
**26** unique sources (11 corpus patterns: SRC-FOUNDR-STARTUP, SRC-BND-FRAUD-SIGNS, SRC-SOCIALTARGETER-PIVOT, SRC-NETSUITE-DEMAND-SEASON, SRC-KENAN-RESILIENCE, SRC-SCORE-CASHFLOW, SRC-PESHEV-EXPANSION, SRC-SCIENCEDIRECT-COVID, SRC-SDK-FICTITIOUS-VENDOR, SRC-TAL-FAKEVENDOR, SRC-FORTUNE-RANSOMWARE; + 15 `SRC-IND-*`).

### 4. Exact independent gold count
**15** (`INDEPENDENT_GOLD_CASES`), each with a hand-authored expectation and a distinct `SRC-IND-*` source.

### 5. Current action-status distribution (in-memory replay — already proven)
Per `expectedActionStatus` (no real provider data at in-memory replay): **need_more_data 60, blocked 60, owner_decision_required 45** (corpus). Gold DB-target: owner_decision_required 11, blocked 4.

### 6. Target action-status distribution after exhaustive DB run (real provider data)
With seeded real data the disposition follows the **PR #63 policy**:
- `compliance_block` → **blocked**; `proof_fraud_block` → **blocked**.
- `cash_survival` / `below_margin` / `capacity_feasibility` / `owner_workload` / `customer_quality` → **owner_decision_required** (binding constraint, no SOP grant).
- `profitable_growth` (good, healthy) → **owner_decision_required** by default; **proceed** when seeded with an `owner.safe-action-approved` SOP (riskClass low) and **cautious_proceed** with riskClass medium.

All five statuses MUST appear. To exercise `proceed`/`cautious_proceed` honestly, the 15 corpus GOOD cases (`weak_unit_economics_scale`, dominant `profitable_growth`) + the 1 gold `profitable_growth` case are seeded in two sub-variants: a baseline (owner_decision_required) and an SOP-approved variant (proceed/cautious). The ledger records the exact disposition per scenarioId. proceed/cautious are NEVER asserted for any blocked/need_more_data/high-risk scenario.

Dominant-constraint distribution across 180: proof_fraud_block 47, cash_survival 33, owner_workload 33, compliance_block 17, below_margin 17, capacity_feasibility 16, customer_quality 16, profitable_growth 1.

### 7. DB strategy for all 180
- Seed each scenario into an **isolated workspace + business** (sharded; deterministic ids) using the existing `seedScenarioBusiness` shape extended with a constraint→knob mapping `chaosScenarioToKnobs(expectedDominantConstraint, goodBadUgly, sop?)`.
- The 7 existing dominant constraints (cash_survival, below_margin, capacity_feasibility, owner_workload, proof_fraud_block, compliance_block, profitable_growth) are already forceable by `ScenarioKnobs`.
- **`customer_quality` (16 scenarios) is NOT forceable** through current DB seams: `deriveOwnerContext` derives `customer_reputation`/`capacityRisk` only from numeric rows + messy-fact text, with **no complaints/reputation seam**. Resolution: add an **additive, optional customer-reputation seam** — an optional `reputation` field on `OwnerDomainRows` + a complaints-driven messy-fact in `deriveOwnerContext` (absent ⇒ byte-for-byte unchanged behavior; this is an "approved provider seam", not a gate change). The seed populates it for customer_quality scenarios so the runtime resolves `customer_quality` as dominant with all higher constraints absent.
- Run every scenario through the real `getOwnerWholeBusinessPlan`; collect dominant, action status, confidence, missing-data, impact, owner/delegate/proof/reassessment, learning/provenance.
- Assert per scenario: dominant == locked gold; action status == policy target; no cross-business/workspace leakage; `criticalDomainsRealProviderBacked`; no static/fallback; no fake confidence.
- Update the ledger `dbBackedStatus` per scenarioId.

### 8. Browser strategy for all 180
- Seed all 180 businesses into the E2E owner workspace (extend `scripts/seed-owner-scenarios.ts`), each selectable via the existing `businessSelector`.
- A **data-driven** Playwright spec iterates the 180 ledger ids (sharded — see §10), asserting per scenario: Supervisor Summary renders, runtime-fed dominant constraint visible, action status visible & correct family, proof/reassessment visible, advanced reasoning collapsed, no fatal console errors, blocked/need_more_data never read as proceed.
- scenarioId traceable via the deterministic `scenarioBusinessId` (already used by specs 19/20). No fixture/static output may satisfy the spec (asserts runtime dominant differs across scenarios).

### 9. Mobile strategy
Preferred: all 180 at mobile viewport. Realistic minimum (per prompt §7): **representative** — ≥45 scenarios spanning all 15 categories, all good/bad/ugly classes, and all 5 action statuses (≥3/category, ≥1/status). Exact mobile count + ids recorded in the ledger and report.

### 10. Sharding strategy
Playwright desktop sharded to keep each file tractable: **15 shards × 12 scenarios** (by category) OR a CI matrix (`shardIndex` 1..N). Each shard reads its slice of the ledger; a coverage test asserts the union of shard slices == 180 (no gap, no overlap). DB exhaustive runs as one `[db]` vitest file (180 iterations, 180s+ timeout) or category-sharded if too slow.

### 11. Timeout / performance strategy
- DB exhaustive: single vitest `[db]` file, `testTimeout` ≥ 300s; record wall-clock.
- Playwright: per-shard timeout; reuse one login per shard; select-and-assert loop (no per-scenario reload of the whole app). Record per-shard duration + scenario count; report shard imbalance.
- Seed once per run (idempotent upserts), not per test.

### 12. CI workflow strategy
- New workflow `chaos-exhaustive.yml`: Postgres 16 service, `TEST_WITH_DB=true`, `migrate deploy`, seed all 180, run the DB exhaustive lane + the Playwright desktop shards (matrix) + the representative mobile lane. Upload the ledger + failure artifacts.
- Do **not** modify or replace `owner-pilot-e2e.yml`; do not remove existing checks.

### 13. Artifact / report strategy
- `OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_LEDGER.json` (the proof ledger, 180 rows) — committed, regenerated by a generator script, integrity-tested.
- `OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_REPORT.md` — final scoring + honest classification + self-audit.

### 14. Anti-skip strategy
- The ledger is the single source of counted ids; every layer iterates the ledger (not an ad-hoc array).
- Integrity tests fail if: count ≠ 180, duplicate id, missing id, a layer marked pass without a run record, a skipped scenario counted as pass, an untracked scenario, or an incomplete `finalScenarioStatus`.
- Each layer test asserts it ran exactly the ledger count for that layer (e.g. DB test asserts 180 iterations executed); fewer ⇒ fail.

### 15. Proof-ledger schema
Per scenario (24 fields, per prompt §3): scenarioId, category, goodBadUgly, sourceRefs, independentGold, expectedDominantConstraint, expectedActionStatus, expectedModules, expectedDoNotDo, expectedProofReassessment, expectedProfitCashWorkload, expectedDashboardFields, arbitrateStatus, ownerRuntimeStatus, dbBackedStatus, supervisorSummaryStatus, jsdomStatus, playwrightDesktopStatus, playwrightMobileStatus, sourcePrivacyStatus, businessScopeStatus, finalScenarioStatus, failureReason, evidenceArtifactRef. Layer values ∈ {pass, fail, skipped, not_run}.

### 16. Classification gates (honest)
- `ALL_180_DB_PROVEN` — all 180 DB-backed + owner runtime + supervisor summary (no full-browser claim).
- `ALL_180_DB_DESKTOP_BROWSER_PROVEN` — + all 180 full Playwright desktop from runtime-fed DB data.
- `EXHAUSTIVE_DESKTOP_DB_WITH_REPRESENTATIVE_MOBILE` — + representative mobile (exact count reported).
- `REAL_WORLD_CHAOS_REPLAY_EXHAUSTIVE_READY` — + all gates green, all 5 statuses, no unsafe/generic/fake-confidence, complete ledger + reports.
- `REAL_WORLD_CHAOS_REPLAY_FULL_MOBILE_READY` — + all 180 mobile.
- `EXHAUSTIVE_CHAOS_REPLAY_FAILED` — if exhaustive coverage not achieved.

### 17. What will NOT be claimed if infeasible
- If `customer_quality` cannot be forced via the additive seam without risking a gate, those 16 scenarios' `dbBackedStatus` stays honest (`fail`/`not_run`) and the DB claim is capped below all-180 — reported plainly, not hidden.
- If 180-browser is too slow to complete here, the desktop claim is capped to the exact count proven (ledger truth); mobile stays representative.
- No classification is claimed unless the ledger shows the exact counts that classification requires.

### 18. Minimum-code approach
1. `chaos-ledger.ts` (new, pure) — builds the 180-row ledger from `COUNTED_CHAOS_SCENARIOS` + `INDEPENDENT_GOLD_CASES`; one generator script writes the JSON; integrity tests.
2. `chaos-scenario-seed.ts` (new) — `chaosScenarioToKnobs()` + per-scenario seed using the existing `seedScenarioBusiness` row-writers; additive `customer_quality` seam.
3. Additive customer-reputation seam: optional `reputation` on `OwnerDomainRows` + one complaints messy-fact in `deriveOwnerContext` (absent ⇒ unchanged).
4. `cautious-proceed` reuse: SOP standing instruction for the good `profitable_growth` variants.
5. DB exhaustive test (180), dashboard jsdom test (180), Playwright desktop shards (180), representative mobile.
6. `chaos-exhaustive.yml` CI; reports; full no-regression.

No new AI brain, no autonomy, no model, no Date.now in pure modules.
