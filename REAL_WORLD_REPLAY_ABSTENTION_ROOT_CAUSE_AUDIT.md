# Real-World Replay Abstention Root Cause Audit

**Date:** 2026-06-20  
**Auditor:** Automated harness trace  
**Cases inspected:** 42 (all)  
**Result file:** `simulation_runs/historical_validation/_HISTORICAL_VALIDATION_RESULT.json`

---

## Step 1 — Abstention Count

| Metric | Count |
|--------|-------|
| Total cases run | 42 |
| Cases where `gateAbstain = true` | 42 |
| Cases where `committed = true` | 0 |
| Cases where engine proceeded | 0 |

**All 42 cases abstain. Zero cases produce a committed diagnosis or recommendation.**

Top abstention reasons (all three fire simultaneously on every case):
1. `LOW_CONFIDENCE` — `confidence_score = 0.1 < 0.3` threshold
2. `MISSING_EVIDENCE` — `has_evidence = false` (no evidence IDs on diagnosis)
3. `PRECONDITION_UNMET` — `preconditions_met = false` (engine status = INSUFFICIENT_EVIDENCE)

---

## Step 2 — Input Adapter Inspection (10 Representative Cases)

### Evidence dimension values found in case files

| Case ID | Dimensions found in `01_case_input.json` | Valid for engine? |
|---------|------------------------------------------|-------------------|
| RW_INDIA_SUZLON_2012_CDR | `"finance"`, `"operations"` | NO — short-form aliases |
| RW_US_ENRON_2001_GOVERNANCE_FRAUD | `"FINANCIAL"`, `"GOVERNANCE"`, `"STRATEGIC"`, `"OPERATIONAL"` | NO — uppercase long-form |
| RW_US_APPLE_1997_TURNAROUND | `"FINANCIAL"`, `"STRATEGIC"`, `"OPERATIONAL"`, `"MARKET"` | NO — uppercase long-form |
| RW_INDIA_KINGFISHER_2012_COLLAPSE | `"FINANCIAL"`, `"OPERATIONAL"`, `"MARKET"`, `"GOVERNANCE"` | NO — uppercase long-form |
| RW_US_LEHMAN_2008_LIQUIDITY_COLLAPSE | `"FINANCIAL"`, `"GOVERNANCE"`, `"OPERATIONAL"` | NO — uppercase long-form |
| RW_INDIA_FUTURE_RETAIL_2021_DEBT | `"FINANCIAL"`, `"OPERATIONAL"`, `"GOVERNANCE"`, `"LEGAL"`, `"STRATEGIC"` | NO — uppercase long-form |
| RW_US_TOYS_R_US_2017_LBO | `"FINANCIAL"`, `"OPERATIONAL"`, `"STRATEGIC"`, `"MARKET"` | NO — uppercase long-form |
| RW_UK_THOMAS_COOK_2019_COLLAPSE | `"FINANCIAL"`, `"OPERATIONAL"`, `"STRATEGIC"`, `"MARKET"` | NO — uppercase long-form |
| RW_US_SEARS_2018_RETAIL | `"FINANCIAL"`, `"OPERATIONAL"`, `"STRATEGIC"`, `"MARKET"` | NO — uppercase long-form |
| RW_US_GENERAL_MOTORS_2009_BANKRUPTCY | `"FINANCIAL"`, `"OPERATIONAL"`, `"STRATEGIC"`, `"MARKET"` | NO — uppercase long-form |

### Engine's valid dimension values (from `src/domain/consulting-engine/types.ts`)

```
"financial_health"
"operational_efficiency"
"customer_retention"
"quality_delivery"
"market_position"
"process_maturity"
"team_capability"
```

**None of the case file dimension values match any valid engine dimension.**

---

## Step 3 — Abstention Reason Classification

### HARNESS_INPUT_ADAPTER_BROKEN

**Location:** `simulation_runner/run-historical-validation.ts` → `toEvidenceItems` function

**Bug:**
```typescript
function toEvidenceItems(caseId: string, raw: RawEvidence[]): EvidenceItem[] {
  return raw.map((e, i) => ({
    id: uuidv5(`${caseId}#evidence#${i}`, NS),
    dimension: e.dimension as EvidenceItem["dimension"],  // ← CAST SILENCES TYPE ERROR
    finding: e.finding,
    confidence: ...,
    source: e.source ?? "historical-case",
    timestamp: new Date(0),
    isCritical: !!e.isCritical,
    supportingData: e.supportingData,
  }));
}
```

`e.dimension as EvidenceItem["dimension"]` is a TypeScript type cast. It suppresses the compile-time error but does NOT transform the value at runtime. The string `"FINANCIAL"` is passed to the engine as-is. The engine receives evidence items with dimensions that do not match any known archetype mapping.

### Downstream cascade

```
Wrong dimension (e.g. "FINANCIAL") passed to engine
  → EvidenceAnalyzer cannot map evidence to archetype categories
  → No archetypes reach PROVISIONAL threshold
  → DiagnosisType.UNKNOWN, DiagnosisConfidence.INSUFFICIENT_EVIDENCE
  → orchestrator sets status = "INSUFFICIENT_EVIDENCE"
  → committed = false (harness: status !== "INSUFFICIENT_EVIDENCE" is false)
  → deriveSafetyGateInputs: confidence_score = 0.1, has_evidence = false, preconditions_met = false
  → assessSafety fires all three blocking conditions simultaneously:
      LOW_CONFIDENCE (0.1 < 0.3)
      MISSING_EVIDENCE (!has_evidence)
      PRECONDITION_UNMET (!preconditions_met)
  → abstain = true
```

---

## Step 4 — Should Proceed vs Should Abstain (10 Cases)

The safety gate is evaluated on whether the **engine** has produced a valid committed diagnosis with evidence. The question here is: given the actual case content, should the engine be able to produce a committed output if the adapter were fixed?

| Case ID | Evidence richness | Expert diagnosis available | Should engine proceed (if adapter fixed)? |
|---------|-----------------|---------------------------|------------------------------------------|
| RW_INDIA_SUZLON_2012_CDR | 8 HIGH-confidence items, all critical flags set correctly | YES (`"DEBT_CRISIS"`) | YES |
| RW_US_ENRON_2001_GOVERNANCE_FRAUD | 8+ items spanning finance/governance/operations | YES (freetext but archetype-mappable) | YES |
| RW_US_APPLE_1997_TURNAROUND | 7+ items, turnaround scenario with clear strategic data | YES | YES |
| RW_INDIA_KINGFISHER_2012_COLLAPSE | 7+ items, debt and operational collapse | YES | YES |
| RW_US_LEHMAN_2008_LIQUIDITY_COLLAPSE | Multiple items covering liquidity/balance sheet | YES | YES |
| RW_INDIA_FUTURE_RETAIL_2021_DEBT | 9+ items covering debt, legal, operations | YES | YES |
| RW_US_TOYS_R_US_2017_LBO | 7+ items covering LBO debt and retail pressure | YES | YES |
| RW_UK_THOMAS_COOK_2019_COLLAPSE | 8+ items covering liquidity, debt, market | YES | YES |
| RW_US_SEARS_2018_RETAIL | 8+ items covering retail decline, debt | YES | YES |
| RW_US_GENERAL_MOTORS_2009_BANKRUPTCY | 8+ items covering liquidity, structural cost, market | YES | YES |

**Verdict: All 10 inspected cases have evidence richness and expert diagnosis support sufficient for the engine to proceed, IF the adapter correctly maps dimension strings to the engine's vocabulary.**

The abstention is NOT because the cases are genuinely unsafe or ambiguous. It is because the harness adapter corrupts the evidence dimension field before the engine ever sees it.

---

## Step 5 — Root Cause Classification

**PRIMARY: HARNESS_INPUT_ADAPTER_BROKEN**

The `toEvidenceItems` function in `simulation_runner/run-historical-validation.ts` uses a TypeScript type cast (`as EvidenceItem["dimension"]`) to pass through raw dimension strings from case files without validating or mapping them to the engine's accepted vocabulary. This is not a case defect (the cases have valid evidence) and not an engine defect (the engine correctly rejects unrecognized dimensions). It is a pure adapter defect.

**Fix scope: one function, one file.**

The fix requires adding a dimension mapping table in `toEvidenceItems` that translates the vocabulary used in case files to the engine's `EvidenceItem["dimension"]` enum:

| Case file value | Engine value |
|----------------|-------------|
| `"finance"` | `"financial_health"` |
| `"FINANCIAL"` | `"financial_health"` |
| `"operations"` | `"operational_efficiency"` |
| `"OPERATIONAL"` | `"operational_efficiency"` |
| `"STRATEGIC"` | `"market_position"` |
| `"MARKET"` | `"market_position"` |
| `"GOVERNANCE"` | `"process_maturity"` |
| `"LEGAL"` | `"process_maturity"` |
| `"HR"` / `"HUMAN"` | `"team_capability"` |
| `"customer"` / `"CUSTOMER"` | `"customer_retention"` |
| `"quality"` / `"QUALITY"` | `"quality_delivery"` |

**SECONDARY: outcome_polarity enum mismatch (in scorer, not adapter)**

The `HistoricalOutcome` interface in the harness declares `outcome_polarity: "SUCCESS" | "FAILURE" | "MIXED"`. All 42 `outcome.json` files use `"POSITIVE"` / `"NEGATIVE"` / `"MIXED"`. The `scoreAgainstOutcome` function branches on `"FAILURE"` and `"SUCCESS"` — neither branch is ever reached. This is a separate defect from abstention; it affects `historical_alignment` scoring, not the abstention decision.

**TERTIARY: expert_diagnosis as freetext (in ground truth, not adapter)**

Several `outcome.json` files have `expert_diagnosis` as a multi-sentence freetext paragraph. `normalizeDiagnosis` lowercases but cannot extract a canonical archetype code from a paragraph. This affects `diagnosis_agreement` scoring; it is not part of the abstention root cause.

---

## Step 6 — Decision

**Safety gate change needed: NO**

The safety gate (`assessSafety`, `assessConsultingOutput`) is functioning correctly. It correctly refuses to proceed when the engine returns `DiagnosisType.UNKNOWN` with `INSUFFICIENT_EVIDENCE` status. The gate must not be weakened.

**Case changes needed: NO**

The 42 case packets contain accurate, source-backed evidence. The evidence dimension strings used in the files (`"FINANCIAL"`, `"GOVERNANCE"`, etc.) are a reasonable vocabulary choice. The cases do not need to be regenerated.

**Adapter change needed: YES**

`toEvidenceItems` in `simulation_runner/run-historical-validation.ts` must be fixed to map raw dimension strings to the engine's valid `EvidenceItem["dimension"]` values before constructing evidence items.

**Decision: FIX_INPUT_ADAPTER_ONLY**

---

## Final Output

```
Total cases:                  42
Proceed:                      0
Abstain:                      42
Top abstention reasons:       LOW_CONFIDENCE (confidence_score=0.1 < 0.3)
                              MISSING_EVIDENCE (has_evidence=false)
                              PRECONDITION_UNMET (preconditions_met=false, status=INSUFFICIENT_EVIDENCE)
Representative cases inspected: 10 (all show identical failure cascade)
Root cause:                   HARNESS_INPUT_ADAPTER_BROKEN
                              toEvidenceItems in run-historical-validation.ts casts
                              e.dimension as EvidenceItem["dimension"] without mapping.
                              Case files use "FINANCIAL"/"GOVERNANCE"/"STRATEGIC"/etc.
                              Engine expects "financial_health"/"process_maturity"/"market_position"/etc.
                              Mismatch → engine cannot map evidence to archetypes →
                              DiagnosisType.UNKNOWN → INSUFFICIENT_EVIDENCE →
                              safety gate fires three simultaneous blocking conditions →
                              abstain=true for all 42.
Safety gate change needed:    NO — gate is functioning correctly
Case changes needed:          NO — cases have valid evidence, no structural defect
Adapter change needed:        YES — add dimension mapping table in toEvidenceItems
Decision:                     FIX_INPUT_ADAPTER_ONLY
Next exact prompt:            REAL_WORLD_REPLAY_ABSTENTION_FIX
                              Fix toEvidenceItems in simulation_runner/run-historical-validation.ts.
                              Add a DIMENSION_MAP constant that translates raw case file dimension
                              strings to valid EvidenceItem["dimension"] values. Map unknown values
                              to a sensible default (e.g. "financial_health") with a console.warn.
                              Do NOT change the safety gate. Do NOT change the case files.
                              Do NOT change the engine. Do NOT change the scorer.
                              After fix: re-run the harness and verify that at least some cases
                              produce committed=true and gateAbstain=false.
                              Fix outcome_polarity enum mismatch in the same pass:
                              update scoreAgainstOutcome to handle "POSITIVE"→SUCCESS branch
                              and "NEGATIVE"→FAILURE branch, OR update HistoricalOutcome interface
                              to match the actual file values "POSITIVE"/"NEGATIVE"/"MIXED".
```
