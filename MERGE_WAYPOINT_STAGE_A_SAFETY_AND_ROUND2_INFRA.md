# MERGE WAYPOINT — Stage A Safety Gate + Round 2 Infrastructure

**Purpose:** merge-readiness checkpoint for review. **This is NOT an auto-merge
and NOT a Stage A pass.** **Date:** 2026-06-17.

- **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`
- **Latest commit:** `6c336f114bccbdf01cb904e2806302b1962ab491`
  ("STAGE A Round 2 case-pack tooling: schema + template generator + manifest + README")
- **Working tree:** clean.

---

## 1. VALIDATION COMMANDS RUN (this checkpoint)
- `git status --short` → clean.
- `npx vitest run src/__tests__/governance/ src/__tests__/benchmark/ src/__tests__/services/financial-archetypes.test.ts src/__tests__/phase-g/empirical-discipline.test.ts`
  → **431 passed / 17 files**.
- `npx prisma validate` → **valid**.
- `npx tsc --noEmit` → only **one** error, the pre-existing `simulation_runner/run-case.ts:149`
  (see §6). **0** errors in any added/changed governance/benchmark/engine source.
- DB gates (`prisma migrate deploy`, `test:db`) → **DB_BLOCKED_ENVIRONMENT** (no `DATABASE_URL`); not run.

## 2. WHAT IS SAFE TO MERGE
All changes are **additive** (new safety-gate logic that only abstains, new
benchmark tooling, and documentation). No existing production behavior is weakened.

**Code (additive, tested):**
- `src/services/governance/abstention-engine.ts` — now wired + evidence-support
  (Option B), causal-challenge (A), constraint-alignment (C) rules. All new rules
  are **optional params** and **abstain-only** (never convert abstain→proceed);
  the original 8-arg callers and `empirical-discipline.test.ts` are unaffected.
- `src/services/governance/consulting-safety-adapter.ts`, `causal-challenge.ts`,
  `constraint-alignment.ts`, `coverage-classifier.ts` — engine→gate wiring + verifiers.
- `src/services/consulting-engine/{diagnosis-engine,intervention-design-engine}.ts`,
  `domain/consulting-engine/types.ts` — E1 financial archetypes (cash/liquidity,
  unit-economics, margin) + safe low-cost interventions. New committed financial
  diagnoses are still subject to the gate (validated: 0 new unsafe proceeds).
- `src/services/benchmark/{round2-intake-validator,round2-case-schema}.ts` — Round 2
  intake validator + case schema/manifest tooling.
- `simulation_runner/*` — benchmark harnesses (not in the app runtime path).
- Tests: governance/benchmark/engine suites (431 passing here).

**Benchmark artifacts (additive, old outputs preserved):** `12/13/14/15/16/17/18_*`
per-case outputs, `adversarial_safety_probes_v2{,_option_a,_option_c,_e0,_e1}/`,
Round-1 intake results, Round-2 template scaffold + manifest. No prior frozen
output (`09_*`), scoring record (`10_*`), or answer key was modified.

**Safety evidence at this commit:** adversarial suite **10/10 unsafe caught, 2/2
controls preserved**; Round 1 **49 abstain / 1 proceed**; baseline 47 abstentions
preserved across every slice.

## 3. WHAT IS NOT PROVEN (do not claim)
- **Engine quality / consultant-grade ability** — UNVERIFIED. The 5.21/10 figure
  was retracted (B4); no validated quality metric exists yet.
- **Broad safety at scale** — the gate's verifiers are **lexical heuristics**
  (RC-7 semantic residue); a cue-free, well-supported, constraint-feasible but
  wrong recommendation can still pass. Proven only on author-constructed probes.
- **Round 1 as a capability benchmark** — INVALID (41/50 placeholder cases;
  intake validator: 0/50 Round-2-valid).
- **Multi-domain synthesis** — not built; 4 genuinely multi-cause cases remain
  (correctly) held.
- **RW-005 hallucination verdict** — UNRESOLVED (escalated to human).
- **E2–E6 archetypes** — not implemented.

## 4. STAGE A STATUS
**Stage A remains DO_NOT_PROMOTE** (per `STAGE_A_FINAL_HOSTILE_DECISION.md`).
Merging this branch ships the **safety brake + benchmark infrastructure**; it does
**not** promote Stage A.

## 5. REMAINING BLOCKERS
- RC-7 semantic residue (robust factuality/causal verification — likely a
  model-based verifier; separately authorized).
- Quality UNVERIFIED (needs the Round 2 6-axis reproducible scorer).
- Round 2 pack unauthored (150 templates scaffolded, all validator-rejected
  until filled).
- Multi-domain synthesis unbuilt.
- RW-005 human adjudication.
- Pre-existing `run-case.ts:149` type-loose error (see §6).

## 6. KNOWN PRE-EXISTING ISSUES
- `simulation_runner/run-case.ts:149` — `allDims.filter`/`Set<dimension>` type
  mismatch. **Predates this branch** (present on the audited base commit), lives in
  a benchmark runner (not the app), and does not affect `tsx` execution. Not
  introduced or worsened here; left untouched to avoid scope creep.
- `tsx` is required to run the simulation harnesses; installed via `npm ci`.

## 7. ROLLBACK NOTE
Every gate addition is additive and opt-in (optional `assessSafety` params; rules
inert when their signal is absent). Rollback options: (a) revert the branch merge;
or (b) disable a specific verifier by not supplying its signal from the adapter —
no schema/data migration, no threshold state to unwind. Benchmark artifacts are
inert data files; deleting them affects nothing in the app runtime.

## 8. RECOMMENDED SQUASH/MERGE TITLE
`Stage A: wire abstention safety gate (evidence-support + causal + constraint),
close B1–B5, add E0/E1 + Round 2 benchmark infrastructure (DO_NOT_PROMOTE)`

---

**Do not merge automatically.** This waypoint is for human review. Stage A stays
BLOCKED; the safety gate and Round 2 infrastructure are review-ready.
