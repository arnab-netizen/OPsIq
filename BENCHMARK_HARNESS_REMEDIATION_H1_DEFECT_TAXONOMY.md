# Benchmark Harness Remediation: H1 Defect Taxonomy

**Date:** 2026-06-16
**Scope:** Complete analysis of Round 1 scoring infrastructure defects
**Verified:** Through manual inspection of case_pack_scorer.py, score_remaining_cases_v3.py, and sample case pack markdown

---

## Defect A: Fallback/Default Scoring Behavior

**Location:** `score_remaining_cases_v3.py` lines 106-121

**Evidence:**
- When dimension scores missing from heuristic scoring record, v3 scorer assigns hardcoded `5.0/10` per dimension
- Pattern: RW-005, RW-009-014, ADV-009 all show uniform 5.0 across multiple dimensions, matching hardcoded default
- Manifest: 8 of 12 Slice 1 verification baseline cases contain default fallback scores

**Root Cause:**
```python
# Lines 106-121 in score_remaining_cases_v3.py
for dim in default_dims:
    if dim not in result:
        result[dim] = {
            "score": 5.0,  # HARDCODED FALLBACK
            "rationale": "Derived from heuristic scoring",
            "weight": 1.0 / 13
        }
```

**Impact:**
- Impossible to distinguish "case genuinely scores 5.0 against answer key" from "case was never scored"
- Baseline scoring cannot be trusted without knowing which cases have real scores vs. synthetic defaults
- Remediation blocks: Cannot report accurate benchmark coverage without identifying which cases are actually scored

---

## Defect B: Parser Format Mismatch (Inline vs. Bullet)

**Location:** `case_pack_scorer.py` lines 175-185 (`_extract_bullet_list` method)

**Evidence:**
- Regex pattern: `(?:^|\n)\s*(?:[-•]|\d+\.)\s+(.+?)(?=\n\s*(?:[-•]|\d+\.)|$)` matches ONLY bullets
- Cases RW-009 through RW-014 use inline format: `**field:** text without bullets`
- Inline format applies to scoring guides; when parsed by bullet regex, returns `[]` (empty list)
- Manifest: 6 of 12 verification baseline cases have empty criteria lists from inline format failures

**Root Cause:**
Single regex pattern assumes all markdown lists use bullet format. Inline format (`**field:** text, item2, item3`) is structurally different and doesn't match bullet pattern. Parser returns empty list without diagnostic.

**Impact:**
- Empty criteria lists cause degenerate scoring (see Defect C)
- No warning when criteria cannot be parsed
- Silently treats unparseable guides same as non-existent guides
- Remediation blocks: Cannot score cases with inline format without dual-format parser

---

## Defect C: Degenerate Scoring from Empty Criteria

**Location:** `case_pack_scorer.py` lines 350-382 (root_cause_match) and lines 384-422 (first_priority_action)

**Evidence:**
- When criteria list is empty (from Defect B), scoring logic becomes: `any(term in engine_text for term in [].split())`
- Empty list causes loop to have zero iterations → condition defaults to implicit True → score assigned as 10.0
- Manifest: 6 verification cases show consecutive dimensions with artificial 10.0 scores

**Root Cause:**
```python
# Lines 359-362 in case_pack_scorer.py
for criterion in scoring_guide.root_cause_full_credit:  # Empty list
    criterion_lower = criterion.lower()
    if any(term in engine_description + engine_type for term in criterion_lower.split()):
        full_credit_matches += 1
# If criteria list empty, full_credit_matches = 0
# Line 364: if full_credit_matches >= len(scoring_guide.root_cause_full_credit) * 0.7:
# Evaluates: 0 >= 0 * 0.7 → 0 >= 0 → TRUE → score = 10.0
```

**Impact:**
- Scores artificially inflated for cases where criteria parsing failed
- No validation that criteria list is non-empty before scoring
- Impossible to distinguish "case meets full credit criteria" from "criteria list was empty"
- Remediation blocks: Must validate criteria list non-empty before proceeding with scoring

---

## Defect D: Token Matching Perverse Incentives

**Location:** `case_pack_scorer.py` lines 359-362 and 371-373 (token matching logic)

**Evidence:**
- Loose token matching: `any(term in engine_description for term in criterion.lower().split())`
- Rewards substring overlap over semantic alignment
- RW-006: diagnosis improved (unknown → unit_economics_breakdown, matches Wet Seal documented root cause) but score DECREASED (6.69 → 5.29)
- Root cause: verbose boilerplate ("Evidence insufficient for definitive diagnosis") has more tokens and matches more of the generic criteria phrases than focused correct diagnosis

**Root Cause:**
Algorithm splits criterion on whitespace and checks if ANY token appears in engine output as substring:
- Generic boilerplate: "Evidence insufficient for definitive diagnosis" → tokens: ["evidence", "insufficient", "for", "definitive", "diagnosis"]
- Correct diagnosis: "unit_economics_breakdown indicates margin compression from overexpansion" → tokens: ["unit_economics", "breakdown", "indicates", ...] 
- Boilerplate overlaps more with generic answer-key phrases like "evidence" + "insufficient"
- Focused correct diagnosis matches fewer generic tokens, scores lower

**Impact:**
- Scorer incentivizes verbose generic text over focused correct answers
- Improvement in diagnosis quality can result in lower scores
- Slice 1 verification showed this empirically: correct diagnosis improvement → score decrease
- Remediation blocks: Must improve keyword matching to use exact phrase or semantic similarity, not token overlap

---

## Defect E: No Validation on Parsed Criteria Results

**Location:** All dimension scoring functions (lines 350+)

**Evidence:**
- No guard clause checking `if not criteria` before scoring
- Empty criteria lists (from Defect B) are treated as valid and proceed to scoring logic
- No error or warning generated when criteria cannot be parsed

**Root Cause:**
Scoring functions assume criteria list is always valid (non-empty). No pre-condition validation.

**Impact:**
- Silent pass-through of degenerate scores (Defect C)
- No diagnostic information when criteria parsing fails
- Remediation blocks: Must add explicit validation that criteria lists are non-empty before scoring

---

## Defect F: Scoring Guide Section Validation Missing

**Location:** `case_pack_scorer.py` lines 102-161 (answer key and guide loading)

**Evidence:**
- `_extract_answer_key` and `_extract_scoring_guide` return `None` if section missing
- No validation that required subsections exist (root_cause_full_credit, first_priority_action_full_credit, etc.)
- No check that extracted fields are non-empty
- No structured diagnostic when validation fails

**Root Cause:**
Loader methods extract sections but don't validate completeness or structure of extracted content.

**Impact:**
- Cannot distinguish "answer key missing" from "answer key incomplete" from "answer key malformed"
- Scoring proceeds with partial information without diagnostic
- Remediation blocks: Must create structured validation manifest showing answer_key_found, guide_found, criteria_parse_status per case

---

## Summary: Defect Classification

| Defect | Type | Severity | Scope | Remediation |
|--------|------|----------|-------|-------------|
| A — Fallback/Default Behavior | Harness | CRITICAL | 8 of 50 cases | Remove hardcoded 5.0, fail explicitly |
| B — Parser Format Mismatch | Harness | CRITICAL | 6 of 50 cases | Implement dual-format parser (bullet + inline) |
| C — Degenerate Scoring | Harness | CRITICAL | 6 of 50 cases | Validate criteria non-empty before scoring |
| D — Token Matching Incentives | Harness | HIGH | All cases | Improve keyword matching (exact phrase vs. token) |
| E — Parsed Criteria Validation | Harness | HIGH | All cases | Add pre-condition validation on criteria lists |
| F — Guide Section Validation | Harness | HIGH | All cases | Create structured validation manifest |

**Total defects affecting baseline:** All 50 cases (defects D, E, F), 14 cases severely compromised (defects A, B, C)

---

## Remediation Strategy H2-H7

**H2: Remove Fallback/Default Scoring**
- Delete all hardcoded 5.0 assignments
- Replace with explicit error on missing keys: `raise ValueError(f"Missing dimension: {dim}")`
- Fail case scoring if required dimension data not present

**H3: Fix Parsing for Dual Format**
- Implement smart parser that detects bullet vs. inline format
- Return structured diagnostics: `parser_status, format_detected, criteria_list, diagnostics`
- Fail explicitly if neither format detected

**H4: Validation Manifest**
- For each of 50 cases, generate: `answer_key_found, guide_found, criteria_parse_status, criteria_non_empty, frozen_output_found, validation_status`
- Mark cases as VALID_FOR_SCORING vs. INVALID_FOR_SCORING

**H5: Re-Score with Assisted Flags**
- Run repaired scorer against frozen Round 1 outputs
- Output: `automated_assisted_score, scoring_status, parser_diagnostics, manual_review_required`
- Mark cases where semantic judgment exceeds parser capability

**H6: Classification Counts**
- Count: valid_for_scoring, invalid_for_scoring, degenerate_cases, fallback_cases, parser_failure_cases
- Aggregate: scoring_coverage percentage

**H7: Corrected Benchmark Status**
- Generate BENCHMARK_HARNESS_REMEDIATION_CLOSEOUT.md
- Trust classification: TRUSTED / PARTIALLY_TRUSTED / UNTRUSTED
- Decision: whether Slice 1 re-verification or Slice 2 proceeding required

---

**Status:** H1 DEFECT TAXONOMY COMPLETE
