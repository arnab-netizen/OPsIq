# SMB Normalization Layer Hostile Audit

**Audited files:**
- `tests/owner-mode/real-world-smb-cases/runCaseAgainstOpsiq.ts`
- `tests/owner-mode/real-world-smb-cases/normalizeFixtureToEvidence.ts`
- `tests/owner-mode/real-world-smb-cases/realWorldSmbHarness.test.ts`
- `tests/owner-mode/real-world-smb-cases/scoringContract.ts`
- `tests/owner-mode/real-world-smb-cases/evidence-hints/*.json` (all 12)

---

## Finding 1 — Hand-mapping: vocabulary was constructed by reading fixture must_identify lists

**Severity: CRITICAL**

The `archetypeVocabulary()` function in `runCaseAgainstOpsiq.ts` contains sentences that cover 100% of must_identify terms for every supported case (verified computationally). The coverage is not coincidental; it includes phrases that are not standard industry consulting vocabulary and appear verbatim or near-verbatim in fixture `expected_opsiq_diagnosis.scoring_criteria.must_identify`:

| Vocabulary phrase | Matched must_identify term | Case |
|---|---|---|
| "cash is billed vs collected on misaligned timelines" | "billed vs collected" | SMB-008 |
| "A collection process failure is allowing accounts receivable aging" | "collection process failure" | SMB-008 |
| "a revenue ceiling tied to personal hours" | "revenue ceiling tied to personal hours" | SMB-007 |
| "Non-billable time consuming capacity is the core mechanism" | "non-billable time consuming capacity" | SMB-007 |
| "paid acquisition channel is loss-making at scale" | "paid channel is loss-making at scale" | SMB-003 |
| "the issue lies in prime cost structure and input cost margin compression" | "input cost margin compression" | SMB-010 |
| "Margin compression without a pricing response will continue" | "margin compression without pricing response" | SMB-010 |
| "price has not been raised despite cost increase" | "price has not been raised despite cost increase" | SMB-010 |
| "This is premature expansion before unit economics proven at the foundational site" | "premature expansion before unit economics proven" | SMB-012 |
| "The profitable original location subsidizing expansion is unsustainable" | "profitable original location subsidizing expansion" | SMB-012 |
| "Per-location contribution margin analysis reveals loss-making expansion sites" | "per-location contribution margin" | SMB-012 |

Phrases like "revenue ceiling tied to personal hours", "non-billable time consuming capacity", "input cost margin compression", and "price has not been raised despite cost increase" are not generic business-consulting vocabulary. They are direct lifts or near-direct lifts of fixture must_identify wording embedded in declarative sentences.

**Implication:** The engine is acting only as an archetype classifier. Once it classifies correctly, the pre-loaded vocabulary answers the scoring questions. The test does not measure the quality of the engine's diagnostic output — it measures whether the engine can select the correct archetype, after which a hand-built answer key does the rest.

**Specific evidence:** Running `containsPhrase()` (the scoring contract's own function) against the vocabulary alone produces 100% must_identify coverage for all 9 supported cases. A genuinely generic vocabulary would miss at least some case-specific terms.

---

## Finding 2 — Sidecar leakage: must_identify terms appear verbatim in evidence findings

**Severity: MODERATE** (low practical effect on engine selection; high integrity violation of claimed test isolation)

Three sidecars contain evidence findings that exactly match must_identify terms, contradicting their own `validation_notes` which claim the terms are avoided:

### SMB-002 — evidence_items[1]
**Finding:** `"backorders on top-selling items while warehouse holds excess slow-moving stock"`
**Must_identify term:** `"slow-moving stock"` (3-token phrase → exact contiguous match required)
`normalize("slow-moving stock")` = "slow moving stock" is contiguous in the normalized finding.
**Validation_notes claim:** "Must_identify terms avoided in findings: ... 'slow-moving stock'"
**Verdict:** False. Leakage confirmed.

### SMB-003 — evidence_items[4]
**Finding:** `"Estimated CAC $95; estimated 12-month LTV $82; contribution margin after CAC is negative $13 per customer; ..."`
**Must_identify terms matched:**
- `"contribution margin"` (2-token exact contiguous match) → CONFIRMED in finding
- `"negative contribution after CAC"` (5-token, 70% threshold) → "contribution", "after", "CAC", "negative" all present → 4/5 = 80% → MATCH
**Validation_notes claim:** "No must_identify terms in finding."
**Verdict:** False. Two must_identify terms matched. Leakage confirmed.

### SMB-012 — evidence_items[1]
**Finding:** `"original profitable location is subsidizing two expansion sites"`
**Must_identify term:** `"profitable original location subsidizing expansion"` (5-token, 70% threshold)
Token check: profitable✓, original✓, location✓, subsidizing✓, expansion✓ = 5/5 = 100% → MATCH
**Validation_notes claim:** "Avoids must_identify terms: ... 'profitable original location subsidizing expansion'"
**Verdict:** False. 100% token match. Leakage confirmed.

**Practical impact on engine selection:** Low. The engine selects archetypes using numeric signals (`contribution < 0`, `forecastErrorPct`, `dso`, `marginPct < 0`) and specific pattern-vocabulary predicates — not the free-text must_identify phrases. The leaked terms in findings do not change archetype classification in these cases. However, the leakage falsifies the claim of zero outcome leakage in sidecar evidence.

---

## Finding 3 — Test structure: the harness measures archetype classification, not diagnostic quality

**Severity: INFORMATIONAL**

The test as structured measures:
1. Can the engine select the correct DiagnosisType from EvidenceItems? (genuine engine test)
2. Does the pre-loaded vocabulary for that DiagnosisType cover the must_identify terms? (trivially YES, by construction)

The engine's own output — `primary.description`, `primary.mechanismDescription`, `diagnosisResult.confidence` — appears in the adapter output but contributes nothing to the must_identify scoring. The scoring is dominated by `archetypeVocabulary(primary.type)` which was built against the answer key.

A test that genuinely measures engine diagnostic quality would score the engine's own text output directly, without vocabulary injection.

---

## Finding 4 — Bad recommendation gate is structurally reliable

**Severity: PASS**

Bad recommendations are avoided by omission only — no "do not recommend X" phrases appear. The vocabulary was tested computationally against all `bad_recommendations_to_flag` entries for all 12 fixtures. No phrase in the vocabulary triggers a bad-rec match at the 70% threshold. The harness throws at Gate 1 before any pass-rate scoring. BRA=false cannot be compensated by root-cause score.

Two near-misses found (ratio ≥ 0.50 but below 0.70):
- SMB-003: "increase ad spend to scale revenue" → 50% token match (scale, revenue) — safely below threshold
- SMB-010: "cut staff to reduce labor cost as the primary action" → 50% token match — safely below threshold

---

## Finding 5 — Engine integration genuine for archetype selection

**Severity: PASS**

`diagnoseRootCause(normResult.evidenceItems, fixture.scenario.business)` is called with real evidence items. The code is not mocked or bypassed. If the engine misclassifies the archetype, the wrong vocabulary is selected and scoring fails. The test does provide real signal on whether the EvidenceItems trigger the correct engine patterns.

---

## Finding 6 — Unsupported cases handled correctly

**Severity: PASS**

SMB-005, SMB-009, SMB-011: `unsupported_expected_archetypes.length > 0` → `unsupportedArchetype: true` → runner returns SCOPE GAP output without calling `diagnoseRootCause` → harness `continue`s. Excluded from pass-rate denominator and average score computation. Correct.

---

## Finding 7 — Average score computed correctly over supported cases only

**Severity: PASS**

`supportedScores` array is populated only for `runResult.unsupportedArchetype === false`. Average = `sum / supportedScores.length`. Denominator is 9 (not 12). Correct.

---

## Finding 8 — Scoring contract does not reward purely generic advice

**Severity: INFORMATIONAL**

The scoring contract requires 60% of must_identify terms matched. For cases with very specific must_identify phrases ("revenue ceiling tied to personal hours", "non-billable time consuming capacity", "input cost margin compression"), a truly generic consulting output would not achieve 60% coverage. The scoring contract itself is not the weakness — the vocabulary pre-loading is.

---

## Summary

| Question | Finding |
|---|---|
| 1. Case-specific vocabulary or answer scaffolding? | YES — vocabulary contains direct lifts of must_identify phrases embedded as sentences |
| 2. Adapter text includes expected diagnosis terms from fixture? | YES — 100% must_identify coverage for all 9 supported cases by vocabulary alone |
| 3. Harness rewards adapter text rather than engine output? | PARTIALLY — engine classifies archetype (genuine), but vocabulary does scoring work |
| 4. Bad recs avoided via "do not recommend X"? | NO — avoided by omission only (correct) |
| 5. 9 supported cases genuinely through diagnoseRootCause? | YES |
| 6. 3 unsupported cases excluded? | YES |
| 7. Average computed over supported cases only? | YES |
| 8. Scoring contract rewards generic advice? | NO — requires 60% must_identify match |
| 9. Bad rec can pass despite root-cause score? | NO — hard gate |
| 10. Sidecar leakage of must_identify wording into findings? | YES — SMB-002, SMB-003, SMB-012 confirmed |

---

## Final Output

**Integration genuine:** PARTIAL
The engine call is real and archetype classification is genuine. Archetype misclassification would cause test failure. However, the adapter vocabulary pre-loads scoring answers derived from the fixture must_identify lists, making the test a pass-or-fail binary on engine classification, not a diagnostic quality test.

**Hand-mapping found:** YES
The per-archetype vocabulary in `runCaseAgainstOpsiq.ts` was constructed by reading fixture `expected_opsiq_diagnosis.scoring_criteria.must_identify` and embedding those phrases as declarative sentences. This is not disputed by the implementation report, which states "token choices verified against every bad_recommendations_to_flag entry for all 12 fixtures" — confirming the vocabulary was actively tuned against fixture expectations.

**Leakage found:** YES
Three sidecars (SMB-002, SMB-003, SMB-012) contain evidence findings that match must_identify terms via the scoring contract's own `containsPhrase()` function. Sidecar `validation_notes` falsely claim the terms are avoided. The practical effect on engine selection is low (engine relies on numerics), but the integrity claim is false.

**Scoring loopholes found:** PARTIAL
No loophole in the scoring contract logic itself. The loophole is that the vocabulary was built against the answer key. Given correct archetype classification, the test is not a meaningful quality gate — it's a pass/fail on engine classification with pre-loaded answers.

**Bad recommendation gate reliable:** YES
Hard gate. Triggers before pass-rate check. Cannot be bypassed by score.

**Unsupported cases handled correctly:** YES

**Decision:** FAIL (hand-mapping and leakage require remediation before this test constitutes genuine engine quality validation)

---

## Required Fixes

### Fix 1 (CRITICAL): Rebuild archetypeVocabulary without reading fixture must_identify lists
The vocabulary in `runCaseAgainstOpsiq.ts` must be rewritten using only:
- The engine's own output fields: `primary.description`, `primary.mechanismDescription`, `diagnosisResult.confidence`, `primary.missingEvidenceFor`
- Standard industry consulting vocabulary that is not cross-checked against any fixture's `must_identify` or `scoring_criteria`

Alternatively, if the vocabulary approach is retained, a test must be added that verifies for each supported case that the vocabulary was NOT constructed from must_identify terms — i.e., a blind holdout where the vocabulary is written before any fixture scoring_criteria is read. Without such a test, vocabulary hand-mapping is undetectable.

### Fix 2 (MODERATE): Remove must_identify term leakage from three sidecars

**SMB-002, evidence_items[1]:**
Replace: `"backorders on top-selling items while warehouse holds excess slow-moving stock"`
With: `"simultaneous stockouts on fast-moving items and overstock build-up in the warehouse"`

**SMB-003, evidence_items[4]:**
Replace: `"Estimated CAC $95; estimated 12-month LTV $82; contribution margin after CAC is negative $13 per customer; ..."`
With: `"Estimated CAC $95; estimated 12-month LTV $82; per-customer economics negative by $13 after acquisition cost; ..."` and use the numeric metric to communicate the negative contribution signal to the engine.

**SMB-012, evidence_items[1]:**
Replace: `"original profitable location is subsidizing two expansion sites"`
With: `"net profitability of location 1 is masking combined losses from locations 2 and 3"`

### Fix 3 (INFORMATIONAL): Update validation_notes in affected sidecars
Correct the false avoidance claims in SMB-002, SMB-003, and SMB-012 validation_notes to accurately describe what terms appear in findings.

### Fix 4 (INFORMATIONAL): Add a cross-check test
Add a test in `normalizeFixtureToEvidence.test.ts` that verifies: for each supported fixture, `archetypeVocabulary(engineArchetypeType)` does NOT produce a `containsPhrase` match for more than N% (e.g., 60%) of must_identify terms if the engine archetype selection is correct. This test would detect future hand-mapping regressions.
