# Holdout Case Acceptance Checklist

Every holdout case must pass all items in this checklist before being included in the sealed holdout set. Cases that fail any item are rejected. Rejection reasons are documented.

This checklist is evaluated by a person other than the case author (or by automated validation where indicated).

---

## Section A — Author Independence (Manual Check)

These items are verified by reviewing the author declaration in `holdout_meta`.

- [ ] **A1** — `holdout_meta.author_read_existing_fixtures` is `false`
- [ ] **A2** — `holdout_meta.author_read_composer_source` is `false`
- [ ] **A3** — Author has confirmed in writing (separate from the fixture) that they have not read `smbOutputComposer.ts` or any of SMB-001 through SMB-012 fixtures
- [ ] **A4** — Author is not the same person who implemented any Phase 2A, 2B, 3, 4, or 4B sub-mechanism for OpsIQ
- [ ] **A5** — `holdout_meta.author_id` is recorded and matches the author's declaration

If any of A1–A5 fails, the case is rejected with status `AUTHOR_INDEPENDENCE_VIOLATION`.

---

## Section B — Schema Validation (Automated)

Run `validateFixture()` from `fixtureSchema.ts` (with `HO-` pattern substituted for `SMB-`). All items below are checked automatically:

- [ ] **B1** — `case_id` matches `/^HO-\d{3}$/`
- [ ] **B2** — `case_id` is unique across all holdout fixtures in the set
- [ ] **B3** — `title` is non-blank
- [ ] **B4** — `segment` is non-blank
- [ ] **B5** — `source_basis` is a non-empty array of non-blank strings
- [ ] **B6** — `scenario.business` is non-blank
- [ ] **B7** — `scenario.facts_known_to_owner` is a non-null object
- [ ] **B8** — `scenario.symptoms` has at least 3 non-blank strings
- [ ] **B9** — `scenario.misleading_signals` has at least 2 non-blank strings
- [ ] **B10** — `scenario.missing_inputs_opsiq_should_request` has 3–6 non-blank strings
- [ ] **B11** — `expected_opsiq_diagnosis.primary_root_cause` is non-blank
- [ ] **B12** — `expected_opsiq_diagnosis.secondary_causes` has 2–4 non-blank strings
- [ ] **B13** — `expected_opsiq_diagnosis.expected_first_action` is non-blank
- [ ] **B14** — `expected_opsiq_diagnosis.bad_recommendations_to_flag` has 4–6 non-blank strings
- [ ] **B15** — `scoring_criteria.must_identify` has 4–8 non-blank strings
- [ ] **B16** — `scoring_criteria.must_not_claim` has 2–4 non-blank strings
- [ ] **B17** — `scoring_criteria.ideal_depth` has 2–4 non-blank strings
- [ ] **B18** — `holdout_meta` is present with all required fields

If any of B1–B18 fails, the case is rejected with status `SCHEMA_VIOLATION`.

---

## Section C — Anti-Leakage (Automated)

These checks detect whether the answer key has leaked into the scenario. Run before scoring. All are automated:

- [ ] **C1** — No `must_identify` phrase appears verbatim (case-insensitive) in `scenario.business`
- [ ] **C2** — No `must_identify` phrase appears verbatim in `scenario.symptoms` (any element)
- [ ] **C3** — No `must_identify` phrase appears verbatim in `scenario.misleading_signals` (any element)
- [ ] **C4** — No `must_identify` phrase appears verbatim in `scenario.facts_known_to_owner` (any string value)
- [ ] **C5** — No `expected_first_action` phrase (first 10 words) appears verbatim in any `scenario` field
- [ ] **C6** — No `bad_recommendations_to_flag` phrase appears verbatim in any `scenario` field
- [ ] **C7** — `must_identify` terms have no overlap > 2 tokens with any `must_not_claim` term (diagnostic terms must be distinct from disqualified terms)

If any of C1–C7 fails, the case is rejected with status `LEAKAGE_IN_SCENARIO`.

---

## Section D — Content Quality (Manual Review)

These items require human judgment. Reviewed by someone who has not authored the case and who understands the SMB consulting domain:

- [ ] **D1** — The business description is plausible and internally consistent
- [ ] **D2** — The symptoms are written in plain owner language (no consulting jargon)
- [ ] **D3** — Each misleading signal is genuinely plausible as a misdiagnosis trigger — a reasonable but wrong analyst would follow it
- [ ] **D4** — The missing inputs are things a real consultant would request (not obvious, not trivial)
- [ ] **D5** — The `primary_root_cause` is the correct diagnosis given the facts presented
- [ ] **D6** — The `expected_first_action` is specific, diagnostic, and actionable within 5–10 days
- [ ] **D7** — Each `bad_recommendation` is genuinely bad advice for this case — plausible but harmful
- [ ] **D8** — `must_identify` terms are standard industry vocabulary that any domain-competent consultant would use independently
- [ ] **D9** — No `must_identify` term is so obscure or case-specific that only someone who read the case answer key would use it
- [ ] **D10** — The case is genuinely uncertain — it requires reasoning, not obvious pattern matching

If any of D1–D10 fails, the reviewer documents the specific failure and returns the case to the author for revision. The revised case is re-evaluated from Section C.

---

## Section E — Uniqueness and Diversity (Set-Level Check)

These checks apply to the holdout set as a whole, not individual cases. Evaluated once the full set is assembled:

- [ ] **E1** — No holdout case describes the same business scenario as any of SMB-001 through SMB-012 (same industry + same primary root cause combination)
- [ ] **E2** — No two holdout cases describe the same business scenario as each other
- [ ] **E3** — At least 5 distinct industries represented across the set
- [ ] **E4** — At least 3 service businesses in the set
- [ ] **E5** — At least 3 product/retail businesses in the set
- [ ] **E6** — At least 2 businesses with employees (not sole operator)
- [ ] **E7** — At least 2 cases where the presenting symptom is cash stress
- [ ] **E8** — At least 2 cases where the presenting symptom is NOT cash stress (to avoid cash-diagnosis bias)
- [ ] **E9** — At least 3 distinct primary root cause types across the set
- [ ] **E10** — No single root cause type represents more than 40% of holdout cases

If E1–E10 do not pass for the full set, the holdout coordinator requests additional cases to fill the gaps before the sealed set is declared final.

---

## Acceptance Outcomes

| Outcome | Meaning | Action |
|---|---|---|
| ACCEPTED | All sections A–E pass | Case included in sealed holdout set |
| AUTHOR_INDEPENDENCE_VIOLATION | Author has read restricted files | Case rejected; new author required |
| SCHEMA_VIOLATION | Schema validation fails | Author corrects and resubmits |
| LEAKAGE_IN_SCENARIO | Answer-key vocabulary in scenario | Author revises scenario or must_identify; re-checked from C |
| CONTENT_QUALITY_FAIL | D-section human review fails | Author revises and resubmits; re-checked from D |
| DUPLICATE | Same scenario as existing fixture or another holdout | New case required |

---

## Sealing Protocol

Once all cases have been accepted:

1. The holdout coordinator produces the final `holdout_cases.jsonl` file
2. A SHA-256 hash of the file is recorded
3. The file is treated as sealed — no modifications after this point
4. The sealed hash is documented in `HOLDOUT_VALIDATION_PLAN.md` before the first run
5. The first run is conducted using the exact sealed file
6. Any modification to the file after sealing (even typo corrections) constitutes a protocol violation and requires the run to be restarted from scratch
