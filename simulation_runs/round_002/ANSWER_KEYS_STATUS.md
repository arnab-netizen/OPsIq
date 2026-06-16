# Round 2 Answer Keys Status

**Updated:** 2026-06-16  
**Authority:** ROUND_2_CASE_PACK_SPECIFICATION.md §9 (Answer Key Creation Requirements)  
**Purpose:** Track creation status of 50+ manual answer keys for Round 2 validation

---

## Real-World Cases (RW-016 to RW-030)

| Case ID | Status | Created | Reviewed | Locked | Notes |
|---------|--------|---------|----------|--------|-------|
| RW-016 | CREATED | ✓ | — | — | Answer key created with detailed scoring criteria and success metrics |
| RW-017 | PENDING | — | — | — | — |
| RW-018 | PENDING | — | — | — | — |
| RW-019 | PENDING | — | — | — | — |
| RW-020 | PENDING | — | — | — | — |
| RW-021 | PENDING | — | — | — | — |
| RW-022 | PENDING | — | — | — | — |
| RW-023 | PENDING | — | — | — | — |
| RW-024 | PENDING | — | — | — | — |
| RW-025 | PENDING | — | — | — | — |
| RW-026 | PENDING | — | — | — | — |
| RW-027 | PENDING | — | — | — | — |
| RW-028 | PENDING | — | — | — | — |
| RW-029 | PENDING | — | — | — | — |
| RW-030 | PENDING | — | — | — | — |

**Summary (RW):** 1/15 created, 0/15 reviewed, 0/15 locked

---

## Public-Dataset Cases (PD-011 to PD-020)

| Case ID | Status | Created | Reviewed | Locked | Notes |
|---------|--------|---------|----------|--------|-------|
| PD-011 | PENDING | — | — | — | Awaiting case input creation and data sourcing |
| PD-012 | PENDING | — | — | — | — |
| PD-013 | PENDING | — | — | — | — |
| PD-014 | PENDING | — | — | — | — |
| PD-015 | PENDING | — | — | — | — |
| PD-016 | PENDING | — | — | — | — |
| PD-017 | PENDING | — | — | — | — |
| PD-018 | PENDING | — | — | — | — |
| PD-019 | PENDING | — | — | — | — |
| PD-020 | PENDING | — | — | — | — |

**Summary (PD):** 0/10 created, 0/10 reviewed, 0/10 locked

---

## Synthetic Cases (SYN-011 to SYN-020)

| Case ID | Status | Created | Reviewed | Locked | Notes |
|---------|--------|---------|----------|--------|-------|
| SYN-011 | PENDING | — | — | — | Awaiting case input creation |
| SYN-012 | PENDING | — | — | — | — |
| SYN-013 | PENDING | — | — | — | — |
| SYN-014 | PENDING | — | — | — | — |
| SYN-015 | PENDING | — | — | — | — |
| SYN-016 | PENDING | — | — | — | — |
| SYN-017 | PENDING | — | — | — | — |
| SYN-018 | PENDING | — | — | — | — |
| SYN-019 | PENDING | — | — | — | — |
| SYN-020 | PENDING | — | — | — | — |

**Summary (SYN):** 0/10 created, 0/10 reviewed, 0/10 locked

---

## Adversarial Cases (ADV-011 to ADV-020)

| Case ID | Status | Created | Reviewed | Locked | Notes |
|---------|--------|---------|----------|--------|-------|
| ADV-011 | PENDING | — | — | — | Awaiting case input creation |
| ADV-012 | PENDING | — | — | — | — |
| ADV-013 | PENDING | — | — | — | — |
| ADV-014 | PENDING | — | — | — | — |
| ADV-015 | PENDING | — | — | — | — |
| ADV-016 | PENDING | — | — | — | — |
| ADV-017 | PENDING | — | — | — | — |
| ADV-018 | PENDING | — | — | — | — |
| ADV-019 | PENDING | — | — | — | — |
| ADV-020 | PENDING | — | — | — | — |

**Summary (ADV):** 0/10 created, 0/10 reviewed, 0/10 locked

---

## Blind-Outcome Cases (BLND-006 to BLND-010)

| Case ID | Status | Created | Reviewed | Locked | Notes |
|---------|--------|---------|----------|--------|-------|
| BLND-006 | PENDING | — | — | — | Awaiting case input creation |
| BLND-007 | PENDING | — | — | — | — |
| BLND-008 | PENDING | — | — | — | — |
| BLND-009 | PENDING | — | — | — | — |
| BLND-010 | PENDING | — | — | — | — |

**Summary (BLND):** 0/5 created, 0/5 reviewed, 0/5 locked

---

## Overall Status

| Category | Required | Created | Reviewed | Locked | % Complete |
|----------|----------|---------|----------|--------|------------|
| Real-World | 15 | 0 | 0 | 0 | 0% |
| Public-Dataset | 10 | 0 | 0 | 0 | 0% |
| Synthetic | 10 | 0 | 0 | 0 | 0% |
| Adversarial | 10 | 0 | 0 | 0 | 0% |
| Blind-Outcome | 5 | 0 | 0 | 0 | 0% |
| **TOTAL** | **50** | **1** | **0** | **0** | **2%** |

---

## Answer Key Creation Process

**For each case:**

1. **Case sourcing complete** - Case input (01_case_input.json) created and locked
2. **Independent expert review** - Domain expert reviews case independently (blind to engine output)
3. **Answer key creation** - Expert completes ANSWER_KEY_{CASE_ID}.json using ANSWER_KEY_TEMPLATE.json
   - Includes: root_cause_diagnosis, first_priority_action, rationale, evidence_basis, alternative_explanations, success_metrics
   - Format: JSON with detailed scoring_criteria section
4. **Peer review** (optional) - Answer key reviewed by second expert or PM for consistency
5. **Lock** - Answer key locked before Round 2 execution; no modifications allowed during execution or scoring

---

## Quality Gates for Answer Keys

✓ **Each answer key must:**
- [ ] Be created by domain expert (consultant, not engine team)
- [ ] Reference specific evidence from case input
- [ ] Provide clear rationale for root cause diagnosis
- [ ] Recommend a specific, implementable first action (not generic)
- [ ] Respect owner constraints
- [ ] Include alternative hypotheses considered and rejected
- [ ] Document missing evidence that would strengthen diagnosis
- [ ] Match ANSWER_KEY_TEMPLATE.json structure exactly
- [ ] Be locked before Round 2 execution
- [ ] Remain immutable during execution and scoring

---

## Timeline

**Target completion:** By 2026-06-28 (12 days)

- **Case sourcing + input creation:** 2026-06-16 to 2026-06-22 (5-7 days)
- **Answer key creation:** 2026-06-22 to 2026-06-28 (5-7 days, in parallel with sourcing)
- **Peer review + locking:** 2026-06-28 (1 day)
- **Ready for Round 2 execution:** 2026-06-29

---

## Notes

- Answer keys are created **blind** to engine output (answer key creator doesn't run engine on case)
- Answer keys are created **independently** (one expert per case, no averaging)
- Answer keys are **locked and immutable** during Round 2 execution
- Answer keys are the **ground truth** for scoring engine output
- No Round 1 answer keys may be reused (creation must be fresh for Round 2)

---

**Status:** IN_PROGRESS - Awaiting case sourcing completion before answer key creation begins  
**Blocking:** Case sourcing (must complete first)  
**Next checkpoint:** 2026-06-22 (case sourcing should be 80%+ complete)

