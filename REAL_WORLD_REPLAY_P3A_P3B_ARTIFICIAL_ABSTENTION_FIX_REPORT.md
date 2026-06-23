# Real-World Replay P3-A/B Artificial Abstention Fix Report

**Date:** 2026-06-20
**Branch:** claude/cool-ptolemy-dxrpm7
**Defect classes fixed:** WIRING_DEFECT (P3-A) + CAUSAL_CHALLENGE_OVER_BROAD (P3-B)
**Scope:** Fix only P3-A and P3-B — P3-C through P3-H not touched

---

## P3-A: WIRING_DEFECT — raw evidence dimensions passed to causal challenge

### Problem

`simulation_runner/run-historical-validation.ts` line 301 passed `inp.evidence` (raw packet
dimensions: `"finance"`, `"governance"`, `"operations"`, etc.) to `assessConsultingOutput` as the
`evidence` option for the causal challenge. The causal challenge compares `ev.dimension` against
`ARCHETYPE_DIMENSIONS[diagnosisType]`, which contains ONLY the canonical engine vocabulary
(`"financial_health"`, `"process_maturity"`, etc.). Because `"finance" ≠ "financial_health"`,
every evidence item appeared off-archetype regardless of the committed diagnosis.

For Suzlon (`margin_erosion`):
- Home dimensions: `{"financial_health"}`
- Raw dimension: `"finance"` — not in home set → treated as off-archetype
- Finding: `"EBIT margin of negative 7%..."` → matches `SEVERE_FINANCIAL_TEXT` → `isHoldWorthyOffArchetype=true` → `adverseOff=true` → `gateAbstain=true`
- Root cause: the negative EBIT margin finding IS the on-archetype primary signal for `margin_erosion`; it only appeared off-archetype due to the wiring defect

### Fix

File: `simulation_runner/run-historical-validation.ts`

Changed line 303 from:
```ts
evidence: (inp.evidence as CausalEvidence[]) ?? [],
```
to:
```ts
evidence: engineInput.evidence as unknown as CausalEvidence[],
```

`engineInput.evidence` is produced by `toEvidenceItems(inp.caseId, inp.evidence)` which applies the
`DIMENSION_MAP` via `mapDimension()` — converting `"finance"` → `"financial_health"`,
`"governance"` → `"process_maturity"`, etc. The causal challenge now receives the same
canonical-dimension evidence that the diagnosis engine used.

### Impact

- Suzlon: `adverseOff=false` → `gateAbstain=false` → **proceeds**
- Any future committed-diagnosis case whose raw evidence dimensions don't match the canonical
  archetype home-set no longer risks a false adverseOff hold

---

## P3-B: CAUSAL_CHALLENGE_OVER_BROAD — legal_governance_risk not subsuming liquidity

### Problem

`DIAGNOSIS_SUBSUMES_DOMAIN["legal_governance_risk"]` was `{"legal", "integrity"}`. When the
businessProblem contained `"insolven"` (or other liquidity stems: `"cash burn"`, `"out of cash"`,
`"missed payroll"`), the `outOfModelProtectedDanger` function matched the `liquidity` domain which
`legal_governance_risk` did NOT subsume → `outOfModelCauseInProblem=true` → `gateAbstain=true`.

For Byju's:
- Engine correctly committed to `legal_governance_risk` (governance collapse, audit delays, fraud risk)
- businessProblem: `"...recommend highest-priority action plan before formal insolvency."`
- `"insolvency"` → `insolven` stem → `liquidity` domain → not subsumed → abstain
- Root cause: Byju's insolvency proceedings are a direct downstream consequence of the governance
  and audit failures — they do not represent a separate causal domain that the committed diagnosis
  ignores; they are the business outcome of the governance collapse

### Fix

File: `src/services/governance/causal-challenge.ts`

Changed:
```ts
legal_governance_risk: new Set(["legal", "integrity"]),
```
to:
```ts
legal_governance_risk: new Set(["legal", "integrity", "liquidity"]),
```

Rationale: governance/fraud failures routinely terminate in insolvency proceedings and liquidity
collapse. When a committed `legal_governance_risk` diagnosis addresses the governance root cause,
the downstream insolvency/liquidity mention in the businessProblem is an expected co-occurrence,
not an independent unaddressed causal domain.

Safety guard: `capex` is NOT added to the subsumed set — a governance crisis with an irreversible
capex commitment still requires human review (the capex danger is independent of the governance
failure). `integrity` was already subsumed. Only `liquidity` is new.

---

## Files Changed

| File | Change |
|------|--------|
| `simulation_runner/run-historical-validation.ts` | Pass `engineInput.evidence` (mapped) instead of `inp.evidence` (raw) to `assessConsultingOutput` |
| `src/services/governance/causal-challenge.ts` | Add `"liquidity"` to `DIAGNOSIS_SUBSUMES_DOMAIN["legal_governance_risk"]` |
| `src/__tests__/services/causal-challenge-p3a-p3b.test.ts` | 16 new tests (see below) |

---

## Tests Added

### `src/__tests__/services/causal-challenge-p3a-p3b.test.ts` (new — 16 tests)

**P3-A — dimension mapping verification (6 tests)**
- `mapDimension("finance", ...)` → `"financial_health"` ✓
- `mapDimension("governance", ...)` → `"process_maturity"` ✓
- `mapDimension("market", ...)` → `"market_position"` ✓
- `mapDimension("operations", ...)` → `"operational_efficiency"` ✓
- `mapDimension("financial_health", ...)` passes through ✓
- `mapDimension("process_maturity", ...)` passes through ✓

**P3-A — Suzlon-style wiring regression (3 tests)**
- Negative EBIT margin in `"financial_health"` (mapped) is NOT off-archetype for `margin_erosion` ✓
- Negative EBIT margin in `"finance"` (raw) IS treated as off-archetype — documents the bug that P3-A harness fix eliminates ✓
- Governance text in `"process_maturity"` (mapped) is NOT off-archetype for `legal_governance_risk` ✓

**P3-B — legal_governance_risk subsumes liquidity (7 tests)**
- `"before formal insolvency"` in businessProblem does NOT trigger outOfModel for `legal_governance_risk` ✓
- `"insolvency risk looms"` does NOT trigger outOfModel for `legal_governance_risk` ✓
- `"cash burn"` does NOT trigger outOfModel for `legal_governance_risk` ✓
- `"insolven"` still triggers outOfModel for `operational_bottleneck` (not subsumed) ✓
- `"insolven"` still triggers outOfModel for `key_person_risk` (not subsumed) ✓
- `cash_liquidity_crisis` still subsumes liquidity (P1 unchanged) ✓
- `debt_solvency_pressure` still subsumes liquidity (P1 unchanged) ✓
- `legal_governance_risk` with `"capex"` in businessProblem still abstains (capex NOT subsumed) ✓
- `integrity` already subsumed — fraud in businessProblem does NOT fire outOfModel for `legal_governance_risk` (unchanged) ✓

---

## Results

| Metric | Before P3-A/B | After P3-A/B |
|--------|--------------|-------------|
| Cases run | 42 | 42 |
| Proceeded | 24 | **26** |
| Abstained | 18 | **16** |
| P3-A fixed (Suzlon) | — | **YES** |
| P3-B fixed (Byju's) | — | **YES** |
| Unsafe recommendations | 0 | **0** |
| OPSIQ_WORSE | 0 | **0** |
| OPSIQ_BETTER | 12 | **11** |
| OPSIQ_MATCHED | 30 | **31** |
| Safety score | 100% | **100%** |
| TypeScript errors | 0 | **0** |
| Prisma validate | valid | **valid** |

---

## Cases Improved (P3-A/B → Proceed)

1. **RW_INDIA_SUZLON_2012_CDR** — margin_erosion, gateAbstain=False (P3-A wiring fix)
2. **RW_INDIA_BYJUS_2024_INSOLVENCY** — legal_governance_risk, gateAbstain=False (P3-B subsumes liquidity)

## Cases Worsened

**0** — no previously-proceeding case now abstains. OPSIQ_WORSE=[].

---

## Remaining 16 Abstentions After P3-A/B

| Case | dx | Classification | Defect class |
|------|-----|----------------|--------------|
| RW_CANADA_BLACKBERRY_2012_SMARTPHONE_DISRUPTION | unknown | LEGITIMATE | SCOPE_GAP |
| RW_FINLAND_NOKIA_2010_SMARTPHONE_DISRUPTION | unknown | LEGITIMATE | SCOPE_GAP |
| RW_INDIA_CCD_2019_DEBT_TURNAROUND | unknown | ARTIFICIAL | DIAGNOSIS_ENGINE_MISS |
| RW_INDIA_ILFS_2018_LIQUIDITY_DEFAULT | unknown | ARTIFICIAL | DEBT_SOLVENCY_STRICT_CORROBORATION |
| RW_INDIA_JET_AIRWAYS_2019_INSOLVENCY | unknown | ARTIFICIAL | DEBT_SOLVENCY_STRICT_CORROBORATION |
| RW_INDIA_KINGFISHER_2012_COLLAPSE | unknown | ARTIFICIAL | DIAGNOSIS_ENGINE_MISS (salary arrears) |
| RW_INDIA_RCOM_2017_2019_TELECOM_DEBT_COLLAPSE | unknown | ARTIFICIAL | DEBT_SOLVENCY_STRICT_CORROBORATION |
| RW_INDIA_VODAFONE_IDEA_2020_AGR_STRESS | unknown | ARTIFICIAL | DEBT_SOLVENCY_STRICT_CORROBORATION |
| RW_INDIA_YES_BANK_2020_MORATORIUM | unknown | ARTIFICIAL | DIAGNOSIS_ENGINE_MISS |
| RW_INDIA_ZEE_SONY_2024_MERGER_FAILURE | unknown | LEGITIMATE | SCOPE_GAP |
| RW_US_APPLE_1997_TURNAROUND | unknown | LEGITIMATE | SCOPE_GAP |
| RW_US_ENRON_2001_GOVERNANCE_FRAUD | unknown | ARTIFICIAL | DIAGNOSIS_ENGINE_MISS (circumspect vocabulary) |
| RW_US_IBM_1993_TURNAROUND | unknown | LEGITIMATE | SCOPE_GAP |
| RW_US_JCPENNEY_2012_PRICING_FAILURE | unknown | LEGITIMATE | SCOPE_GAP |
| RW_US_SEARS_2018_RETAIL_DECLINE | unknown | ARTIFICIAL | DIAGNOSIS_ENGINE_MISS (LIQUIDITY_TRIGGER_VOCAB_MISMATCH) |
| RW_US_STARBUCKS_2008_TURNAROUND | unknown | LEGITIMATE | SCOPE_GAP |

Remaining: 8 LEGITIMATE (scope-gap, must not be fixed) | 8 ARTIFICIAL

---

## Safety Gate Assessment

**No safety gate thresholds changed.** `assessSafety`, `abstention-engine.ts`, confidence cutoffs
are unmodified. The two changes are:
1. Harness wiring (not engine): evidence dimension mapping now reaches causal challenge correctly
2. `DIAGNOSIS_SUBSUMES_DOMAIN`: narrowly extended to reflect that downstream insolvency is an
   expected co-occurrence of committed governance failures

**Whether it is safe to proceed to P3-C through P3-H:** YES, with the following conditions:
- P3-C (DEBT_SOLVENCY_STRICT_CORROBORATION) affects 4 cases; vocabulary additions to DEBT_TEXT /
  LIQUIDITY_HARD must be surgically narrow to avoid false positives on non-distress cases
- P3-D through P3-H are single-case fixes with low blast radius; each should be tested
  individually against the full 42-case harness before combining
- OPSIQ_WORSE=0 and safety=100% must hold after each sub-fix
- No scope-gap case (BlackBerry, Nokia, Zee-Sony, Apple, IBM, JCPenney, Starbucks) should change
  classification

---

## Decision

**P3-A FIXED. P3-B FIXED.** Proceeded 24→26. 0 unsafe, 0 dangerous. Safe to proceed to P3-C.
