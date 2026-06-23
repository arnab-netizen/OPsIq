# Owner Mode Real-World Readiness Rules

**Version:** 1.0  
**Created:** 2026-06-22  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Authority:** OWNER_MODE_REAL_WORLD_READINESS_LOOP prompt contract  

This file is the single source of truth for all Owner Mode readiness execution rules.  
It must be read at the start of every run and rechecked before final output.

---

## 1. Global Hard Rules

**NEVER:**
- Weaken scoring thresholds
- Delete or skip tests
- Hide failures
- Modify fixtures to make tests pass
- Tune engine/composer against sealed expected outputs
- Claim public/SaaS readiness
- Move to Product Hunt or public onboarding
- Add billing or subscription changes
- Add public SaaS onboarding flows
- Skip regression tests
- Skip required reports
- Combine unrelated modules in one slice
- Silently change thresholds
- Silently change sealed expected outputs
- Use sealed outcome vocabulary during engine execution (leakage)
- Let unsafe recommendations pass
- Let learning admit unverified outcomes
- Count unsupported/scope-gap cases as passes
- Convert scope gaps into passes without explicit archetype/input support
- Touch pricing/subscription files without explicit authorization
- Change production behavior without a written generic product justification

**ALWAYS:**
- Read this rule file at the start of every run
- Read relevant docs before coding
- Classify DB impact before coding
- Declare expected changed files before coding
- Run targeted tests before claiming success
- Run `npm run test:owner-real-world-simulation` (180+ tests) if simulation is touched
- Run `npm run test:owner-real-world-smb` (455 tests) if Owner Mode behavior is touched
- Run `npx tsc --noEmit` before committing
- Run `npx prisma validate` if schema/database is touched
- Write a report for every completed slice
- Commit only after all gates pass
- Push after every commit
- End every run with `NEXT_RUN_READY: /continue-owner-readiness`

---

## 2. Unauthorized-Change Rules

The following require explicit phase authorization before they may be changed:

- `simulation_cases.jsonl` — fixture content is frozen; requires Phase 3 (corpus expansion) authorization
- `evidence-hints/*.evidence-hints.json` — sidecar content is frozen; requires evidence-update authorization
- `simulationScoringContract.ts` — scoring weights/thresholds are frozen; SCORING_CHANGE class required
- SMB benchmark fixtures — frozen; requires SMB_FIXTURE_CHANGE authorization
- SMB regression locks — frozen; cannot be weakened; may only be tightened
- `sealed_expected_output` fields — must not be modified after first run against new cases
- Billing, subscription, pricing files — frozen; require explicit SaaS authorization

Unauthorized changes are blocking errors. Stop and report before proceeding.

---

## 3. DB Lane Rules

If any of the following are touched, DB lane classification is required BEFORE coding:

- Prisma schema files (`prisma/schema.prisma`)
- Migration files (`prisma/migrations/`)
- DB service files (`src/services/*.ts` with DB calls)
- Transaction logic
- Workspace scope or multi-tenant isolation
- Persistence layer
- Database-backed learning admission
- Any new `db.*` call

**Required DB lane classification:**
- LANE_A: No DB (pure logic, tests run without DB)
- LANE_B: DB-backed (requires GitHub Actions workflow proof with TEST_DATABASE_URL)
- LANE_C: Hosted Neon verification (requires LANE_C workflow passing)

**Rule:** Do not mark DB-backed slice complete without LANE_B GitHub Actions workflow proof.

---

## 4. Fixture / Scoring Anti-Tampering Rules

- Simulation fixtures (`simulation_cases.jsonl`) must not be modified to make tests pass
- Evidence-hint sidecars must not be modified to make tests pass
- Scoring weights in `simulationScoringContract.ts` must not be changed
- Pass threshold (0.70) must not be changed
- `must_identify` term lists in fixtures must not be altered post-authoring
- `sealed_expected_output` must not be retroactively modified
- Any fixture modification requires a written justification classified as:
  - CORRECTION (factual error discovered)
  - EXPANSION (new case being authored)
  - NEVER to make a failing case pass

---

## 5. Holdout Anti-Overfitting Rules

- Holdout cases must not be tuned against before first run
- Holdout first-run results must be preserved verbatim
- No threshold changes allowed after seeing holdout results
- No fixture modifications allowed after seeing holdout results
- Post-holdout fixes must be classified as GENERIC and separately reported
- Holdout first-run report must be committed before any fixes are applied

---

## 6. Safety / Bad-Recommendation Rules

- Unsafe recommendation count must be 0 at all times
- Bad recommendation count must be 0 at all times
- A recommendation is "bad" if it advises an action the scoring contract flags as harmful
- A recommendation is "unsafe" if it advises irreversible or high-risk action without evidence
- Both counts must be verified after every engine/composer change
- Any increase from 0 is a blocking error requiring immediate rollback

---

## 7. Required Test Gates

Every phase completion requires ALL of the following to pass:

| Gate | Command | Required |
|------|---------|----------|
| Targeted tests | `npx vitest run <test-file>` | Always |
| Simulation structural | `npm run test:owner-real-world-simulation` | If simulation touched |
| SMB regression | `npm run test:owner-real-world-smb` | If Owner Mode behavior touched |
| TypeScript typecheck | `npx tsc --noEmit` | Always |
| Prisma validate | `npx prisma validate` | If schema touched |
| Unsafe recommendation count | Per-case score analysis | Always for engine/composer changes |
| Bad recommendation count | Per-case score analysis | Always for engine/composer changes |

A phase is NOT complete if any gate fails.

---

## 8. Required Report Gates

Every phase requires a written report before the phase is marked complete:

| Phase | Required Report |
|-------|----------------|
| Wave 4 | `tests/owner-mode/real-world-simulation/SIMULATION_REMEDIATION_WAVE_4_REPORT.md` |
| Batch 1 lock | `tests/owner-mode/real-world-simulation/SIMULATION_BATCH_1_REGRESSION_LOCK_REPORT.md` |
| Corpus expansion (each batch) | `tests/owner-mode/real-world-simulation/CORPUS_EXPANSION_BATCH_N_REPORT.md` |
| Full simulation validation | `tests/owner-mode/real-world-simulation/FULL_SIMULATION_VALIDATION_REPORT.md` |
| Holdout first run | `tests/owner-mode/holdout/HOLDOUT_FIRST_RUN_REPORT.md` |
| Owner input module | `docs/OWNER_INPUT_MODULE_REPORT.md` |
| Internal real-business trial | `docs/OWNER_MODE_INTERNAL_REAL_BUSINESS_TRIAL_REPORT.md` |
| Reassessment validation | `docs/OWNER_MODE_REASSESSMENT_VALIDATION_REPORT.md` |
| Learning loop validation | `docs/OWNER_MODE_CONTROLLED_LEARNING_FINAL_VALIDATION_REPORT.md` |
| Final readiness decision | `docs/OWNER_MODE_REAL_WORLD_READY_DECISION.md` |

Reports must be committed before the phase is marked complete.

---

## 9. Stop Conditions

Stop immediately and write a blocker report if:

1. Any required gate fails twice in a row with the same root cause
2. A fix attempt is classified as FIXTURE_CHANGE, SCORING_CHANGE, or THRESHOLD_CHANGE
3. A fix attempt requires adding new archetypes without explicit phase authorization
4. A DB-backed change has no LANE_B proof
5. Unsafe recommendation count rises above 0
6. Bad recommendation count rises above 0
7. Any unauthorized file is found changed
8. A holdout result is visible before Phase 5 begins
9. Any sealed expected output is discovered to have been used as implementation vocabulary

---

## 10. Final Readiness Criteria

Owner Mode may only be declared `OWNER_MODE_READY_FOR_CONTROLLED_EXTERNAL_PILOT` when ALL of:

- [ ] Rule file exists and has been obeyed throughout all phases
- [ ] Simulation Batch 1 locked (regression lock test + report)
- [ ] Full simulation corpus ≥ 38 cases complete
- [ ] Full simulation validation complete (supported pass rate ≥ declared threshold)
- [ ] Holdout validation complete (first-run report committed; no tuning before first run)
- [ ] Owner input module complete (all input gates passing)
- [ ] Internal real-business trial complete (≥ 10 decisions, ≥ 3 contexts, tracked)
- [ ] Reassessment loop validated end-to-end
- [ ] Learning loop validated (safe admission only)
- [ ] All critical tests pass (simulation, SMB, typecheck)
- [ ] All reports committed
- [ ] Unsafe recommendation count = 0 throughout
- [ ] Bad recommendation count = 0 throughout
- [ ] Final readiness decision written and committed
- [ ] No P0/P1 unresolved blockers
- [ ] DB gates complete where required

Public SaaS / Product Hunt launch remains frozen until separately authorized by the repository owner. This rule file does not authorize public launch.

---

## Phase Sequence

0. Rule file creation/verification ← **THIS PHASE**
1. Simulation Wave 4 (SIM-02-001, SIM-06-001, SIM-06-002)
2. Batch 1 regression lock
3. Full simulation corpus expansion (Batches 2–4, ≥ 38 cases)
4. Full simulation execution and validation
5. Independent holdout validation
6. Owner input module
7. Controlled real-business internal trial
8. Outcome tracking + reassessment validation
9. Controlled learning validation
10. Final Owner Mode readiness decision

---

## Anti-Tuning Declaration

The following vocabulary sources are PROHIBITED as implementation sources:

- `sealed_expected_output.scoring_rubric.must_identify` term lists
- `sealed_expected_output.expected_first_action` text
- `sealed_expected_output.expected_missing_inputs` text
- Any holdout fixture expected output

Engine, composer, and input-model changes must be justified by:
- General product correctness (works across cases, not one case)
- Evidence from failure forensics (failure classification, not answer key)
- Safety requirements
- Generic input-model completeness

---

*This file is authoritative. If conflict exists between this file and any other instruction, this file governs for Owner Mode readiness work.*
