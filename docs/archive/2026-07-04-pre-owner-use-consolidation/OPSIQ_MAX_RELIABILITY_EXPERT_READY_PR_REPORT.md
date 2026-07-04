# OpsIQ — MAX_RELIABILITY_EXPERT_READY PR-Readiness Report

## 1–4. Identity
- Branch (head): `claude/opsiq-real-world-case-training`
- Base (main) HEAD: `57f4ea69`
- Branch final HEAD: `a7268de` (+ the lint-clean + this report commit)
- Working tree: clean (only gitignored `test-results/`); branch is 31+ commits ahead of main.

## 5. Implementation arc
- **Real-world public case training** — 4,032-case corpus (1,008 real-source + 3,024 variants), 36 categories,
  60/60 domains, 26 critical domains, gold skeletons, source register, split integrity, governed learning.
- **businessId migration for owner-mode entities** — nullable `business_id` + `(workspace_id, business_id)`
  index on `OwnerCapacitySnapshot`, `OwnerWorkloadSnapshot`, `Proof`, `OwnerStandingInstruction`; workspace-
  validated writes; business-scoped provider reads; legacy null-business rows excluded from REAL_DB.
- **Browser-representative E2E completion** — all 10 distinct flows co-seeded in ONE workspace + 5 mobile.
- **Final expert adjudication** — lifted approval-memory + staff-workload domains to ≥99 (owner-centralize
  arbitration tradeoff).
- **Max-reliability hardening (CORE)** — baseline + anti-averaging, scorer negative-control + strictness lock,
  per-domain/collective assurance scorecards, FMEA, evidence-trace, business-math gate, 25-type red-team,
  source-quality, contradiction/owner-burden, learning-governance, adjudication queue, ratchet.
- **Expert climb (EXPERT)** — lifted all 10 near-95 domains to ≥95 (customer-quality tradeoff).

## 6. Models / migrations changed
Migration `20260629020000_owner_entities_business_scope` (additive, reversible; 4 models gain nullable
`business_id` + composite index). No destructive change; legacy rows keep `business_id = NULL`.

## 7. Case corpus summary
4,032 cases · 1,008 real-source · 3,024 variants · 378 adversarial split · 36 categories · 60/60 domains ·
26 critical domains · 8 stages · 12 locations · 56 collective decision types.

## 8. Domain assurance summary
**60/60 domains ≥95** and all **ASSURED_EXPERT_READY**; all 26 critical ≥90 (in fact ≥95); no weak domain;
near-threshold (<95) list **empty**.

## 9. Collective assurance summary
All **56 collective decision types ≥90**; none weak; one weak type cannot hide behind the average (gated
individually).

## 10–11. Scores
Production runtime **99.7** · collective whole-business **99.7** · holdout **99.6** · adversarial unsafe **0**
· regression failures **0**.

## 12. Browser / mobile proof
Playwright `13`+`14` **17/17** on a fresh build (10 desktop + 5 mobile + 2 plan), real Chromium + seeded
postgres:16; whole-business card renders runtime-fed values; no cross-business/cross-workspace leakage; 0
critical console errors.

## 13. DB proof
Owner-mode `[db]` suite (whole-business-plan, business-isolation, capacity/workload snapshot, real-db-
ingestion, execution-persistence) green with `TEST_WITH_DB=true` against postgres:16; business isolation +
legacy-row exclusion + cross-workspace rejection proven.

## 14. Source / privacy proof
`source-register.test` (ID format, PII gate, copied-text cap) + `source-quality` module: register clean
(0 PII / long text), hallucinated IDs fail, low-reliability cannot globally promote.

## 15. Red-team proof
`red-team.test` (24 tests, all 25 attack types) — each defended by the real engines; unsafe stays 0; no
false positive on a safe answer.

## 16. FMEA / evidence / math proof
`fmea.test` (8) + `evidence-trace.test` (7) + `business-math-gate.test` (9): high-impact actions gated,
untraceable/over-confident claims fail, unsupported financial recommendations fail.

## 17. Contradiction / owner-burden proof
`contradiction.test` (15): 8 contradictions caught (no false positive); owner-burden enforced.

## 18. Learning-governance / adjudication proof
`learning-governance.test` (10) + `adjudication-queue.test` (7): promotion gated, revoked ignored, stale
downgraded, conflicts adjudicated, no leakage, rollback, unresolved-high-risk blocks MAX_READY.

## 19. Ratchet proof
`assurance.test` (19): forward-only ratchet — unsafe-never-up, no domain <floor (90 default / **95 EXPERT**),
browser ≥10 / mobile ≥5, regression 0, weak segment fails, assurance-coverage + source-validity +
contradiction tracking; real sweep passes vs the committed baseline.

## 20. Skipped tests
7 `[db]`-gated tests skip without `TEST_WITH_DB=true` (they are run green locally with it set, and CI runs
postgres:16). No other skips.

## 21. Known unrelated red checks
None introduced by this branch. (A stale prior-phase gate, if any, is unrelated to these changes; CI on this
branch is the authority.)

## 22. Final classification — **`MAX_RELIABILITY_EXPERT_READY`**
## 23. Merge recommendation — open PR; **do not merge until PR CI is green**. Not merged here.
