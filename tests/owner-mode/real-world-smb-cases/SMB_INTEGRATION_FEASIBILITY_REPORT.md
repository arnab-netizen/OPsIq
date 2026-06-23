# SMB Integration Feasibility Report

**Date:** 2026-06-20
**Branch:** claude/cool-ptolemy-dxrpm7
**Scope:** Read-only audit — no production code, harness, fixture, package, CI, or scoring changes

---

## SECTION A — ENTRYPOINT DISCOVERY

### Primary Entrypoint

| Field | Value |
|---|---|
| **File** | `src/services/consulting-engine/diagnosis-engine.ts` |
| **Function** | `diagnoseRootCause` |
| **Signature** | `diagnoseRootCause(evidence: EvidenceItem[], businessProblem: string): DiagnosisResult` |

**Note on second parameter name:** The exported signature names the second argument `businessProblem: string` (a free-text problem description). The in-code comment in `runCaseAgainstOpsiq.ts` describes it as `caseId: string` — that comment is incorrect. The actual parameter is a free-text business problem string.

### Callers (complete list found by repo search)

| Caller | File | Test or Production? |
|---|---|---|
| `orchestrator.ts` | `src/services/consulting-engine/orchestrator.ts` | Production |
| `runConsultingEngine` (wraps it) | `src/services/consulting-engine/orchestrator.ts` | Production |
| `run-historical-validation.ts` | `simulation_runner/run-historical-validation.ts` | Validation harness |
| Various unit test files (direct) | `src/__tests__/services/diagnosis-*.test.ts` | Unit tests |
| `realWorldSmbHarness.test.ts` (Part B, skipped) | `tests/owner-mode/real-world-smb-cases/realWorldSmbHarness.test.ts` | SMB harness (skipped) |

### Historical Replay Adapter

The `simulation_runner/run-historical-validation.ts` adapter is the closest existing analog to what the SMB harness would need. It:

1. Reads case files with `RawEvidence[]` (free-text `dimension`, `finding`, optional `confidence`, `source`, `isCritical`, `supportingData`)
2. Maps `dimension` strings to engine canonical dimensions via a hardcoded `DIMENSION_MAP` lookup table
3. Calls `runConsultingEngine` (which internally calls `diagnoseRootCause`)
4. Scores output against a hidden `outcome.json` sidecar

### Benchmark Adapter

`src/services/benchmark/round2-scorer.ts` — scores frozen `runConsultingEngine` outputs; does not call `diagnoseRootCause` directly. Uses `normalizeDiagnosis()` which applies one allowed synonym (`quality_trust_failure → quality_control_failure`).

### Test Coverage for `diagnoseRootCause`

- 14 dedicated unit test files in `src/__tests__/services/` covering all pattern archetypes
- Historical replay harness covers integration path
- No existing test passes SMB narrative format directly to the engine

---

## SECTION B — INPUT CONTRACT

### `EvidenceItem` (from `src/domain/consulting-engine/types.ts`)

| Field | Type | Required/Optional | Source File | SMB Fixture Provides It? |
|---|---|---|---|---|
| `id` | `string` (UUID v4) | **Required** | `types.ts:64` | No — must be generated |
| `dimension` | `enum` (7 values: `customer_retention`, `operational_efficiency`, `quality_delivery`, `financial_health`, `process_maturity`, `team_capability`, `market_position`) | **Required** | `types.ts:66-74` | **No** — fixture has no dimension field anywhere |
| `finding` | `string` (min 1) | **Required** | `types.ts:75` | Partial — symptoms and facts are available but not pre-tagged to dimension |
| `confidence` | `ConfidenceLevel` enum (`LOW`, `MEDIUM`, `HIGH`, `PROVISIONAL`) | **Required** | `types.ts:76` | No — must be derived or defaulted |
| `source` | `string` (min 1) | **Required** | `types.ts:77` | No — must be synthesized |
| `timestamp` | `Date` | **Required** | `types.ts:78` | No — must be synthesized (can use `new Date(0)`) |
| `isCritical` | `boolean` | Optional (default `false`) | `types.ts:79` | No — must be derived or defaulted |
| `supportingData` | `Record<string, string | number | boolean>` | Optional | `types.ts:80` | Partial — `facts_known_to_owner` is a key-value map with numeric values; it IS compatible in shape |

### Engine Trigger Mechanics

The engine patterns do **not** perform NLP or semantic parsing. They inspect:

1. `e.dimension` (enum match) — required as the primary gate on every pattern
2. `fin_text(e)` — a concatenation of `e.finding` and `JSON.stringify(e.supportingData ?? {})` — searched by regex
3. `fin_num(e, "key")` — a numeric lookup into `e.supportingData[key]` — used for confidence elevation

**This is the critical finding:** the engine patterns are lexical regex triggers on `finding` strings and named numeric keys in `supportingData`. They are not semantic; they do not summarize or interpret. The only semantic requirement is:

- `finding` must contain specific vocabulary phrases (e.g., "cannot make payroll", "working capital", "receivables", "cac exceeds ltv") OR
- `supportingData` must contain specific named numeric keys (e.g., `cashRunwayMonths`, `dso`, `contribution`, `discountPct`)

---

## SECTION C — GAP MATRIX

| Engine Requirement | Present In SMB Fixture | Generic Derivation Possible | Evidence |
|---|---|---|---|
| `id` (UUID) | No | **Yes** — `uuidv5(caseId + "#evidence#" + i, NS)` pattern used by historical replay | `run-historical-validation.ts:186-188` |
| `dimension` (canonical enum, 7 values) | **No** — fixtures have no dimension label at any level | **Partially** — symptoms can be heuristically binned; `facts_known_to_owner` numerics are financial | Gap: no field in fixture stores dimension intent |
| `finding` (string with diagnostic vocabulary) | **Partially** — `scenario.symptoms` are free-text sentences; `facts_known_to_owner` values are numerics | **Partially** — symptoms can be concatenated or used verbatim as `finding` strings | Gap: symptoms are written in owner-voice narrative, NOT in the engine's diagnostic vocabulary (e.g., "owner cannot make payroll" ≈ engine's `LIQUIDITY_HARD` pattern, but only by coincidence) |
| `confidence` (ConfidenceLevel enum) | No | **Yes** — default `MEDIUM` is used by historical replay for all items without explicit confidence | `run-historical-validation.ts:190` |
| `source` | No | **Yes** — default `"smb-fixture"` string | `run-historical-validation.ts:191` |
| `timestamp` | No | **Yes** — `new Date(0)` used by historical replay | `run-historical-validation.ts:192` |
| `isCritical` | No | **Partially** — could default `false`, or heuristically flag items mentioning "cannot make payroll", "critical" etc. | Default `false` is safe; heuristic flagging works for some patterns |
| `supportingData` numeric keys (e.g., `dso`, `cashRunwayMonths`, `contribution`, `discountPct`) | **Partially** — `facts_known_to_owner` contains relevant numerics (e.g., `bank_balance_usd`, `receivables_outstanding_usd`, `gross_margin_pct`) but uses **different key names** | **No without case-specific key renaming** — the engine looks for `dso` not `receivables_outstanding_usd`; `cashRunwayMonths` not `bank_balance_usd` | Gap: `facts_known_to_owner` key names are narrative (human-readable); engine `supportingData` key names are canonical technical identifiers |
| `dimension` correct classification (financial_health, market_position, etc.) | No | **Partially** — a heuristic can assign `financial_health` to all numeric fact items; assign symptoms to dimensions by keyword matching | Gap: misclassification silently causes pattern triggers to miss (dimension is the primary filter in every pattern predicate) |
| Engine `primary_root_cause` type matches fixture `primary_root_cause` string | **No** — fixture uses narrative labels (`working_capital_cash_flow_trap`, `inventory_cash_trap`, etc.); engine uses enum values (`working_capital_stress`, `cash_liquidity_crisis`, etc.) | **No without a mapping table** — 0 of 12 SMB primary_root_cause strings are exact matches to engine DiagnosisType enum values | See Section E for full analysis |

---

## SECTION D — GENERIC ADAPTER FEASIBILITY

### Field-level classification

| Adapter Requirement | Classification | Justification |
|---|---|---|
| Generate `id` | **A — DIRECTLY COMPATIBLE** | `uuidv5(caseId + "#ev#" + i, stableNamespace)` is deterministic and already proven by the historical replay adapter |
| Default `confidence` to `MEDIUM` | **A — DIRECTLY COMPATIBLE** | Historical replay uses this default for all items without explicit confidence. Safe. |
| Default `source` to `"smb-fixture"` | **A — DIRECTLY COMPATIBLE** | No semantic effect on engine pattern matching. |
| Default `timestamp` to `new Date(0)` | **A — DIRECTLY COMPATIBLE** | Engine never consults timestamp in pattern evaluation. |
| Default `isCritical` to `false` | **B — GENERIC TRANSFORMATION POSSIBLE** | Some engine patterns require `isCritical=true` to fire (operational_bottleneck, quality_delivery, customer_retention patterns). A generic heuristic can flag items as critical when `finding` contains `["critical","cannot","payroll","straining","declined","fell"]`. Deterministic; no case-specific logic. Risk: under-flagging → fewer patterns trigger → INSUFFICIENT_EVIDENCE. |
| Map `scenario.symptoms` → `finding` strings | **B — GENERIC TRANSFORMATION POSSIBLE** | Each symptom string can become one `EvidenceItem.finding`. Deterministic. Risk: symptom vocabulary may not match engine regex patterns; false negatives are likely. |
| Map `facts_known_to_owner` values → `finding` + `supportingData` | **C — REQUIRES HUMAN INTERPRETATION** | `facts_known_to_owner` is a flat key-value map with business-context key names (`receivables_outstanding_usd`, `bank_balance_usd`). Engine patterns look for canonical key names (`dso`, `cashRunwayMonths`). A generic adapter cannot rename these without a lookup table that is effectively a case-specific mapping. The key names are not standardized across the 12 fixtures (each fixture has different fact keys). |
| Assign `dimension` to each evidence item | **C — REQUIRES HUMAN INTERPRETATION** | The engine's primary gate on every pattern is `e.dimension`. No dimension label exists anywhere in the SMB fixture structure. A generic heuristic (e.g., all facts → `financial_health`; all symptoms → dimension from keyword matching) is possible but produces systematic misclassification that silently suppresses correct pattern matches. For example: SMB-009 (`staff_turnover_cost_spiral`) requires `team_capability` dimension items. Nothing in the generic adapter can know to assign `team_capability` without interpreting the symptom or fact content. |
| Map fixture `primary_root_cause` → engine `DiagnosisType` for scoring | **C — REQUIRES HUMAN INTERPRETATION** | Zero of 12 SMB `primary_root_cause` strings match any `DiagnosisType` enum value. A synonym table is required (e.g., `working_capital_cash_flow_trap → working_capital_stress`). Some SMB causes have no engine equivalent at all (see Section E). |

### Overall classification

**`INTEGRATION_BLOCKED_BY_INPUT_MODEL_MISMATCH`** — confirmed below in Section F.

---

## SECTION E — HAND-MAPPING DETECTION

### Root Cause Label Gap (complete)

| SMB fixture `primary_root_cause` | Closest engine `DiagnosisType` | Gap type |
|---|---|---|
| `working_capital_cash_flow_trap` | `working_capital_stress` | **Synonym required** — different label, same concept. Mappable by a synonym table but the table entry itself is a judgment call. |
| `inventory_cash_trap` | `inventory_forecasting_mismatch` OR `working_capital_stress` | **Ambiguous** — "inventory cash trap" could be working-capital or inventory-forecasting depending on whether the problem is the cash cycle or the inventory model. Requires interpretation. |
| `negative_unit_economics_paid_acquisition` | `unit_economics_failure` | **Synonym required** — mappable but narrows to one sub-type (paid acquisition). |
| `prime_cost_margin_erosion` | `margin_erosion` | **Synonym required** — "prime cost" is food-service vocabulary; the engine has only generic margin erosion. |
| `revenue_concentration_single_client_dependency` | **None** | **No engine archetype** — the engine has no `revenue_concentration` or `client_concentration` DiagnosisType. This scenario would return `INSUFFICIENT_EVIDENCE` or `key_person_risk` at best. |
| `fixed_cost_overextension_below_breakeven` | `unit_economics_failure` OR `margin_erosion` | **Ambiguous** — depends on whether the primary failure is per-unit economics or total cost structure. |
| `owner_capacity_bottleneck_revenue_ceiling` | `operational_bottleneck` | **Synonym required** — owner-capacity is a specific form of operational bottleneck; the engine pattern requires `operational_efficiency` dimension items with bottleneck vocabulary, which generic adaptation could provide. |
| `accounts_receivable_cash_flow_gap` | `working_capital_stress` | **Synonym required** — AR gap is a sub-type of working-capital stress. |
| `staff_turnover_cost_spiral` | **None** | **No engine archetype** — the engine has no `staff_turnover` or `labour_cost_spiral` DiagnosisType. Closest is `operational_bottleneck` or `key_person_risk`, but neither captures the turnover-cost spiral mechanism. |
| `input_cost_margin_compression_without_pricing_response` | `margin_erosion` | **Synonym required** — the additional "without pricing response" qualifier is not in the engine taxonomy but the underlying archetype maps. |
| `product_market_fit_gap_audience_engagement_without_paid_validation` | **None** | **No engine archetype** — the engine has no `product_market_fit` DiagnosisType. `demand_generation_failure` is related but requires a numeric (`newCustomerRate`, `leadVolume`) that the fixture does not provide in canonical form. |
| `unit_economics_failure_premature_expansion` | `unit_economics_failure` | **Synonym required** — "premature expansion" context is not captured by the engine enum but the base archetype maps. |

### Assessment: Does successful integration require case-specific rules?

**Yes.** The following cannot be resolved generically:

1. **SMB-005-specific rule:** `revenue_concentration_single_client_dependency` has no engine archetype. Any scoring of this case against the engine requires either (a) declaring it an abstention-correct case, or (b) adding a new engine archetype — both require per-case judgment.

2. **SMB-009-specific rule:** `staff_turnover_cost_spiral` has no engine archetype. Same situation.

3. **SMB-011-specific rule:** `product_market_fit_gap_audience_engagement_without_paid_validation` has no engine archetype. The engine's `demand_generation_failure` pattern requires a numeric key (`newCustomerRate`, `leadVolume`, `pipelineValue`, `funnelConversionPct`) which the fixture's `facts_known_to_owner` does not provide under those canonical key names.

4. **`dimension` assignment per fixture:** The engine's `fin_isWorkingCapital` pattern requires `e.dimension === "financial_health"` AND specific numeric keys (`dso`, `cashConversionDays`). For SMB-001 to trigger this pattern, the adapter must (a) assign the correct dimension, AND (b) rename `receivables_outstanding_usd` to a key the engine will recognize. Neither step can be done generically without knowing the intended engine archetype for that fixture.

5. **`supportingData` key renaming per fixture:** Each fixture has unique fact key names. The engine requires canonical key names. No generic rule can rename `bank_balance_usd → cashRunwayMonths` for SMB-001 without knowing that is the intent.

**CLASSIFY INTEGRATION AS INVALID** for scoring purposes: successful integration that produces meaningful pass/fail verdicts against fixture `primary_root_cause` labels requires either (a) per-case synonym entries, (b) per-case evidence engineering (dimension assignment + supportingData key renaming), or (c) new engine archetypes for 3 of 12 cases. None of these are generic transformations.

---

## SECTION F — FINAL DECISION

**`INTEGRATION_BLOCKED_BY_INPUT_MODEL_MISMATCH`**

### Three independent blockers (each is sufficient alone)

**Blocker 1 — Dimension assignment is interpretive, not derivable**
The engine's pattern evaluation gates on `e.dimension` first. Every pattern predicate begins with a dimension check. The SMB fixture format carries no dimension field. A generic adapter must guess dimension from symptom/fact content. This introduces systematic misclassification that will silently produce wrong results, not failures — and cannot be validated without knowing the expected engine behavior per-item.

**Blocker 2 — `supportingData` key vocabulary mismatch**
Engine confidence elevation and several trigger predicates require specific canonical key names in `supportingData` (e.g., `dso`, `cashRunwayMonths`, `contribution`, `discountPct`, `newCustomerRate`). Fixture `facts_known_to_owner` uses human-readable business key names (`receivables_outstanding_usd`, `bank_balance_usd`, `gross_margin_pct`, `average_client_payment_terms_days`). The rename mapping is case-specific — different fixtures use different fact keys for conceptually similar values.

**Blocker 3 — Three SMB cases have no corresponding engine archetype**
SMB-005 (`revenue_concentration_single_client_dependency`), SMB-009 (`staff_turnover_cost_spiral`), and SMB-011 (`product_market_fit_gap_audience_engagement_without_paid_validation`) map to no `DiagnosisType` in the current engine. The engine would return `INSUFFICIENT_EVIDENCE` for all three if fed well-formed evidence. This cannot be resolved by a generic adapter — it requires either new engine archetypes (an engine change) or reclassification of these cases (a fixture change). Both are prohibited.

---

## FINAL SUMMARY

### Exact diagnosis entrypoint
`src/services/consulting-engine/diagnosis-engine.ts` → `diagnoseRootCause(evidence: EvidenceItem[], businessProblem: string): DiagnosisResult`

### Exact blockers

1. **No dimension field in SMB fixtures.** Every engine pattern gates on `e.dimension`; there is no generic derivation without interpretation.
2. **`supportingData` key names differ per fixture and per case.** Engine requires canonical names; fixtures use human-readable names. No generic rename rule exists.
3. **Three of 12 SMB `primary_root_cause` labels have no engine archetype.** Engine would correctly abstain; fixture expects a specific positive match. Scoring these cases requires new engine archetypes or fixture reclassification.

### Generic adapter path (if one were pursued despite blockers)

A partial generic adapter is **possible** for 9 of 12 cases (excluding SMB-005, SMB-009, SMB-011) and would require:

1. Map `scenario.symptoms` → one `EvidenceItem` per symptom with dimension guessed by keyword matching
2. Map `facts_known_to_owner` numeric values → one `EvidenceItem` per fact, assigned to `financial_health` by default, with `supportingData` using the original key names
3. Generate `id` via `uuidv5`; default `confidence=MEDIUM`, `isCritical=false`, `source="smb-fixture"`, `timestamp=new Date(0)`
4. Maintain a 12-entry synonym table mapping SMB `primary_root_cause` labels → engine `DiagnosisType` for scoring
5. Mark SMB-005, SMB-009, SMB-011 as abstention-correct (engine cannot diagnose them)

This partial adapter would be deterministic and generic in structure but would require a 12-entry synonym table — which is a case-level judgment, not a case-specific rule. Whether this is "valid" integration depends on the definition: it is generic in code but produces unreliable results due to Blockers 1 and 2.

### Recommended next action

**Do not implement the adapter until the input model mismatch is resolved.** The two viable resolution paths are:

**Path A (recommended):** Add an explicit `evidence_hints` array to each SMB fixture — each hint providing `dimension` and optional `supportingData` key mappings — without changing the fixture schema's `scenario` or `expected_opsiq_diagnosis` fields. This is a fixture enrichment, not an engine change, and is deterministic and harness-maintainable.

**Path B (alternative):** Accept that the SMB harness scores free-text output (from an LLM or a deterministic text generator) against keyword criteria — which is the current `scoreOutput()` approach — and do not connect the engine at all. The engine is designed for structured `EvidenceItem[]` input, not narrative owner descriptions. The harness scoring contract already evaluates OpsIQ output quality correctly without calling the engine.

**The existing Part B skip is correct.** The integration is blocked, not just pending. The "missing entrypoint" documented in `runCaseAgainstOpsiq.ts` is accurate but incomplete — it is not a missing implementation detail, it is a fundamental input model mismatch between narrative SMB fixtures and the engine's structured evidence contract.
