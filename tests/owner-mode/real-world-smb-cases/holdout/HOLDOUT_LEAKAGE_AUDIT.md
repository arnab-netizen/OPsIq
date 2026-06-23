# Holdout Leakage Audit

## Purpose

This audit is run against the sealed holdout set before the first validation run. Its purpose is to detect whether any holdout fixture's answer key vocabulary has leaked into:

1. The fixture's own scenario fields (self-leakage)
2. The existing OpsIQ composer source (pre-contamination)
3. The existing internal benchmark fixtures (co-construction overlap)

A holdout that fails this audit is not a valid test of independent capability.

---

## Audit Checks

### Check 1 — Self-Leakage: must_identify phrases in scenario fields

**What it tests**: Whether the fixture's own answer key vocabulary appears in the evidence the system is given.

**Method**: For every holdout fixture, for every phrase in `must_identify`:
- Normalize: lowercase, strip non-alphanumeric, collapse whitespace
- Check if normalized phrase appears as a substring of normalized:
  - `scenario.business`
  - each element of `scenario.symptoms`
  - each element of `scenario.misleading_signals`
  - each string value in `scenario.facts_known_to_owner`

**Pass criterion**: No must_identify phrase appears in any scenario field for any holdout case.

**Failure action**: Case is returned to author for revision. The scenario must be rewritten to use owner-language descriptions that do not contain the diagnostic vocabulary. Or the must_identify term must be revised to a more specific phrase that only a consultant would use.

**Why this matters**: If "accounts receivable" appears in the symptoms ("we have too many accounts receivable outstanding"), then a system that simply echoes symptom vocabulary would match the term. The holdout would not test diagnostic capability; it would test symptom recitation.

---

### Check 2 — Composer Pre-Contamination: must_identify phrases in existing composer source

**What it tests**: Whether the holdout fixture's must_identify terms already appear in `smbOutputComposer.ts` as double-quoted string literals — indicating that the composer was built with knowledge of the holdout cases (which should be impossible given author independence, but must be verified).

**Method**: For every holdout fixture, for every phrase in `must_identify` with ≥ 2 meaningful tokens (tokens with length > 2 after normalization):
- Check if `"${phrase}"` (double-quoted) appears in `smbOutputComposer.ts`

**Pass criterion**: No holdout must_identify phrase appears as a double-quoted string literal in the composer source.

**Note on template literals**: Phrases appearing only in template literals (backtick strings) in the composer are not automatic failures — they may be generic vocabulary added before the holdout set was constructed. Document any such matches for human review.

**Failure action**: If a holdout must_identify phrase appears as a double-quoted string literal in the composer, this suggests the composer was built with knowledge of the holdout case's answer key. This is an author independence violation if the phrase is case-specific. Document and investigate. If the phrase is common industry vocabulary (e.g., "gross margin", "payroll"), it is not a violation.

---

### Check 3 — Cross-Fixture Vocabulary Overlap: must_identify phrases vs existing internal fixtures

**What it tests**: Whether the holdout cases are genuinely new scenarios or re-encodings of existing benchmark cases.

**Method**: For every holdout fixture, for every phrase in `must_identify`:
- Check if the phrase appears in any existing internal fixture's `must_identify` list (SMB-001 through SMB-012)

**Pass criterion**: Less than 50% of a holdout case's must_identify phrases appear in any single internal fixture's must_identify list.

**Note**: Some overlap is expected and acceptable — standard accounting terms like "accounts receivable" appear in many cases across both sets. The concern is wholesale overlap that suggests a holdout case is a disguised version of an existing case.

**Failure action**: If ≥ 50% overlap detected with a specific internal fixture, review both cases for scenario duplication. If the business scenario is different but the root cause vocabulary is the same (e.g., two different AR collection cases), this is acceptable — AR cases legitimately share vocabulary. If the business scenario is essentially the same, the holdout case is a duplicate and must be replaced.

---

### Check 4 — Sidecar Pre-construction: evidence-hint sidecars for holdout cases

**What it tests**: Whether evidence-hint sidecars have been pre-built for holdout cases (they must not exist before the first run).

**Method**: Check that no file matching `HO-*.evidence-hints.json` exists in the `evidence-hints/` directory before the first run.

**Pass criterion**: No holdout evidence-hint sidecars exist at time of first run.

**Failure action**: If holdout sidecars exist, investigate when they were created and by whom. If they were created after seeing the holdout fixture content, they may have been tuned to the cases. Document and assess impact on holdout validity.

**Note**: Evidence-hint sidecars are a necessary part of the composer pipeline. They will need to be constructed for holdout cases at some point. The requirement is that they are constructed AFTER the first run results are recorded, not before.

---

### Check 5 — Bad Recommendation Cross-Contamination: bad_recs vs composer exclusions

**What it tests**: Whether any holdout bad_recommendations_to_flag phrase is an exact substring match with an entry in `PER_ARCHETYPE_EXCLUSIONS` in `smbOutputComposer.ts` — which would indicate the holdout bad recommendations were derived by reading the composer source.

**Method**: For every holdout fixture, for every phrase in `bad_recommendations_to_flag`:
- Normalize (lowercase, strip non-alphanumeric)
- Check if normalized phrase is an exact substring of any normalized entry in `PER_ARCHETYPE_EXCLUSIONS` or `UNIVERSAL_EXCLUSIONS` in `smbOutputComposer.ts`

**Pass criterion**: Less than 30% of a holdout case's bad recommendations are exact substrings of existing exclusion entries, across the full holdout set.

**Why 30%, not 0%**: Some overlap is expected because the bad recommendations are derived from domain knowledge, not from the composer. Bad advice for a cash-stressed business (e.g., "hire more staff") is a natural derivation from domain knowledge, not evidence of reading composer source. 30% is a reasonable threshold for natural domain overlap vs composer-derived construction.

**Failure action**: If > 30% overlap, review whether the bad recommendations were constructed from domain knowledge or from reading exclusion lists.

---

## Audit Execution

### Automated checks (run before first holdout run)

Checks 1, 2, 3, 4, and 5 can be implemented as a test suite. Run:
```
npx vitest run tests/owner-mode/real-world-smb-cases/holdout/holdoutLeakageAudit.test.ts
```

The test file should:
- Load `holdout_cases.jsonl`
- Load `smbOutputComposer.ts` as source text
- Load existing internal fixtures
- Run all five checks per fixture
- Report violations with case_id, check number, and specific offending phrase

### Manual checks (run by reviewer)

After automated checks pass:

- [ ] **M1** — Random sample of 20% of holdout cases reviewed by domain expert who has not read OpsIQ source. Reviewer confirms: (a) must_identify terms are standard vocabulary they would use independently; (b) diagnosis is correct; (c) misleading signals are genuinely misleading.
- [ ] **M2** — Author independence declarations reviewed for all holdout cases
- [ ] **M3** — Source basis descriptions in holdout_meta reviewed for plausibility

---

## Audit Sign-Off

Before the first holdout run proceeds, the following sign-offs are required:

| Check | Status | Reviewer | Date |
|---|---|---|---|
| Check 1 — Self-leakage (automated) | PENDING | — | — |
| Check 2 — Composer pre-contamination (automated) | PENDING | — | — |
| Check 3 — Cross-fixture overlap (automated) | PENDING | — | — |
| Check 4 — Sidecar pre-construction (automated) | PENDING | — | — |
| Check 5 — Bad rec cross-contamination (automated) | PENDING | — | — |
| M1 — Domain expert sample review | PENDING | — | — |
| M2 — Author independence review | PENDING | — | — |
| M3 — Source basis plausibility | PENDING | — | — |
| **OVERALL AUDIT STATUS** | **PENDING** | — | — |

All checks must be PASS before the holdout run proceeds. Any FAIL blocks the run.

---

## Audit Failure Disposition

| Failure | Action |
|---|---|
| Check 1 (self-leakage) | Return case to author; revise scenario or must_identify; re-audit |
| Check 2 (composer pre-contamination) | Investigate author independence; if violation confirmed, reject case |
| Check 3 (cross-fixture overlap) | Review for duplicate scenario; replace if genuine duplicate |
| Check 4 (sidecar pre-construction) | Remove sidecars; investigate how they were created; assess impact |
| Check 5 (bad rec contamination) | If > 30% threshold, investigate; if author read exclusion lists, reject cases |
| M1 (domain expert) | If expert disagrees with diagnosis, classify as HOLDOUT_ERROR candidate |
| M2 (author independence) | If declaration cannot be confirmed, treat case as potentially contaminated |
| M3 (source basis) | If implausible, return to author for clarification |
