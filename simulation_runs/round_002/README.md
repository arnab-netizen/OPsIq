# Round 2 Case Pack Template Structure

This directory contains the structure and templates for Round 2 case pack preparation.

## Directory Structure

```
simulation_runs/round_002/
├── README.md (this file)
├── CASE_SOURCING_LOG.md (tracking sourced cases)
├── ANSWER_KEYS_STATUS.md (answer key creation status)
├── SCORING_GUIDES_STATUS.md (scoring guide status)
├── LEAKAGE_AUDIT_CHECKLIST.md (leakage verification)
├── SOURCE_QUALITY_AUDIT.md (source verification)
├── case_templates/
│   ├── CASE_TEMPLATE_REAL_WORLD.json
│   ├── CASE_TEMPLATE_PUBLIC_DATASET.json
│   ├── CASE_TEMPLATE_SYNTHETIC.json
│   ├── CASE_TEMPLATE_ADVERSARIAL.json
│   ├── CASE_TEMPLATE_BLIND_OUTCOME.json
│   ├── ANSWER_KEY_TEMPLATE.json
│   └── SCORING_GUIDE_TEMPLATE.md
└── cases/ (when populated)
    ├── RW-016/ through RW-030 (15 real-world)
    ├── PD-011/ through PD-020 (10 public-dataset)
    ├── SYN-011/ through SYN-020 (10 synthetic)
    ├── ADV-011/ through ADV-020 (10 adversarial)
    └── BLND-006/ through BLND-010 (5 blind-outcome)
```

## Round 2 Preparation Status

**Specification:** ✓ COMPLETE (ROUND_2_CASE_PACK_SPECIFICATION.md)

**Tasks:**
1. Case Sourcing (15 RW + 10 PD + 10 SYN + 10 ADV + 5 BLND = 50 total)
2. Answer Key Creation (manual, consultant-level, domain expert)
3. Scoring Guide Development (domain expert level)
4. Leakage Audit (no answer-key hints in case data)
5. Source Quality Audit (legitimate, distinct sources)

**Timeline:** 12-17 days (case sourcing + answer keys + guides)

## Key Constraints

- ✗ NO Round 1 case reuse (all 50+ must be fresh)
- ✗ NO Round 1 answer key reuse
- ✗ NO Round 1 scoring guide reuse
- ✓ Leakage audit must PASS
- ✓ Source quality audit must PASS
- ✓ Manual answer keys REQUIRED
- ✓ Manual scoring guides REQUIRED

## Next Steps

1. Use case templates to source new cases (each case gets directory with 01_case_input.json)
2. For each case, create ANSWER_KEY.json (manual, domain expert level)
3. Create SCORING_GUIDE per case type
4. Run leakage audit (cross-check case data against answer keys)
5. Run source quality audit (verify sources are distinct from Round 1)
6. When all 50+ cases ready: Execute Round 2 (11-step protocol)

## Reference

- See ROUND_2_CASE_PACK_SPECIFICATION.md for detailed requirements
- See execution_consultant_engine_v2.md §13, §14, §15 for authoritative rules
