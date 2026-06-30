# OpsIQ — Maximum Reliability + Credibility Hardening Report

## 1–4. Identity
- Branch: `claude/opsiq-real-world-case-training`
- Base HEAD: `deb5b3d`
- Final HEAD: `85cb2f3` (+ this report commit)
- Working tree: clean (only gitignored `test-results/` artifacts)

## 5. Baseline summary (`OPSIQ_MAX_RELIABILITY_BASELINE.json`, real sweep, stride 2)
Corpus 4,032 (1,008 real · 3,024 variants · 378 adversarial). Global: production runtime **98.2** ·
collective **98.2** · holdout **98.5** · adversarial unsafe **0** · regression **0** · learning-applied 63%.
Coverage 60/60 domains, 56 collective decision types. **Weak segments: NONE** across all 7 dimensions
(domain, critical domain, category, severity, stage, location, collective type). 10 non-critical domains in
the near-threshold band (<95); 6 collective types at the 90 floor — all surfaced, none hidden.

## 6. Scorer negative-control + strictness proof — **DONE**
`scorer-negative-controls.test.ts` (21): 16 deliberately-bad outputs that sound expert but are wrong/unsafe
(generic, empty, spend-in-cash-crisis, accept-below-margin, definitive legal/tax, fake proof, growth-beyond-
capacity, missing proof/reassessment/what-not-to-do, overconfident-weak-data, illegal, unproven expansion,
owner-overload, revenue-as-success) + a contradiction control — **each proven rejected** (`passed=false` OR
unsafe flag) through the real scorer. Strictness locked: `PASS_THRESHOLD` pinned at 70, `COLLECTIVE_WEIGHTS`
pinned and summing to 100, wrong-top-priority collective plan cannot pass; a calibrated good answer is NOT
rejected (strict, not rigged-fail).

## 7. Domain assurance scorecard — **DONE**
`assurance.ts` `domainAssurance()`/`assuranceSummary()` + `assurance.test.ts` (17). A domain reaches
ASSURED_EXPERT_READY only with score ≥90, per-domain holdout ≥88, 0 adversarial unsafe, 0 regression,
runtime path proven, and scorer negative-controls green. Synthetic tests prove each block condition (weak
domain, short holdout, any unsafe, harness-only, negative-control failure, regression). **Real sweep:
all 60/60 domains reach ASSURED_EXPERT_READY**, weakDomains/criticalBelow90 empty. Near-threshold (<95)
domains surfaced.

## 8. Collective assurance scorecard — **DONE**
`collectiveAssurance()`: 56 collective decision types each gated individually at ≥90 — proven a weak type
cannot hide behind a high average. Real sweep: no weak collective type.

## 9–17. Existing-mechanism gates (cited, not re-proven this pass)
The following are backed by committed tests on this branch but were NOT rebuilt as dedicated assurance
modules this pass, so they are cited honestly rather than claimed as fresh hardening slices:
- **Business-math** (`expert/business-math.ts`, comprehensive): margin/cash-runway/break-even/payback/ROAS/
  contract-after-terms/EMI/working-capital validators used by the scorer.
- **Adversarial/red-team**: `jarvis-360-adversarial.test.ts` + the adversarial split (unsafe 0 in the sweep).
- **Source quality**: `source-register.test.ts` (ID format, PII gate, copied-text cap).
- **Holdout/overfitting**: `publicSplitIntegrity()` + protected holdout split + the **ratchet's** training-up/
  holdout-down guard.
- **Learning governance**: `learning.test.ts` (workspace-private, no auto-global promotion, scope limits).
- **Browser execution**: `13`+`14` Playwright suites, **17/17 green** earlier this branch (10 desktop + 5
  mobile); not re-run this pass.
- **DB/provider**: `owner-business-isolation.db.test.ts` (business-scoped reads, no cross-business/cross-
  workspace leakage, legacy rows excluded from REAL_DB).

## 17. Continuous assurance ratchet — **DONE**
`evaluateRatchet()` + tests: unsafe-never-up, no domain drops <90 (vs baseline + floor), browser ≥10,
mobile ≥5, regression 0, unresolved high-risk 0, any weak segment fails. **Real sweep passes the ratchet
vs the committed baseline** (0 violations).

## 20. Scores by segment — see `OPSIQ_MAX_RELIABILITY_BASELINE.json` `segments` (byDomain, byCriticalDomain,
byCategory, bySeverity, byStage, byLocation, byCollectiveType). No weak segment; 10 non-critical near-95
domains + 6 floor-line collective types surfaced.

## 21. Unresolved high-risk items: **0** (no weak/critical-below-90 segment; unsafe 0; regression 0).

## 22. Tests / checks run
`tsc` 0 · eslint changed 0 · `baseline.test.ts` (6) · `scorer-negative-controls.test.ts` (21) ·
`assurance.test.ts` (17, incl. real stride-4 sweep) · public-cases suite **41** (corpus, domain-coverage,
scoring incl. the all-domains≥90 gate, learning, source-register, expert-adjudication) · real baseline sweep
(stride 2) writing the baseline JSON. (DB owner suite + Playwright 17/17 proven earlier on this branch.)

## 23. Final classification — **`COLLECTIVE_ASSURANCE_READY`** (honest achieved rung)
Per the prompt's ladder, this pass genuinely proved, in order: `BASELINE_CAPTURED` → `SCORER_STRICTNESS_READY`
→ `DOMAIN_ASSURANCE_READY` → `COLLECTIVE_ASSURANCE_READY`, plus the continuous ratchet. The underlying
system metrics are all green (60/60 domains ≥90, all critical ≥90, collective/runtime 98.2, holdout 98.5,
unsafe 0, regression 0, no weak segment).

**`MAX_RELIABILITY_CORE_READY`/`MAX_RELIABILITY_EXPERT_READY` are NOT claimed** because the prompt requires
every sub-gate to be freshly and independently proven, and the following were cited from existing tests
rather than built as dedicated hardening slices this pass: standalone FMEA assurance module (§7),
evidence-to-claim trace surface (§8), business-math assurance gate (§9), expanded red-team suite (§10),
source-quality scoring module (§11), contradiction/owner-burden module (§13), learning-governance assurance
re-proof (§14), and a persisted expert-adjudication queue (§15) — plus a fresh browser re-run (§16). No
gate was weakened, no average hid a weak segment, and nothing was faked.

## 24–25. PR / merge: no PR opened (classification below CORE_READY and not requested); not merged.

## 26. Remaining blockers: none technical — the remaining rungs are additional dedicated slices, not
defects. Local DB + Playwright both run in this environment.

## 27. Next recommended step
Build the remaining dedicated slices in order — FMEA assurance module + tests (§7), evidence-to-claim trace
in the runtime output + browser card (§8), a business-math assurance gate wrapping the existing validators
(§9), an expanded red-team suite (§10), a source-quality scoring module (§11), a contradiction/owner-burden
assurance module (§13), a learning-governance assurance re-proof (§14), and a persisted expert-adjudication
queue (§15), each committed with tests — then a fresh `13`+`14` browser re-run — to climb to
`MAX_RELIABILITY_CORE_READY` and then `EXPERT_READY`.
