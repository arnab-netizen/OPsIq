# OpsIQ Real-World Chaos Replay — DB + Browser Representative Proof (PR Report)

> **Final classification: `CHAOS_REPLAY_DB_BROWSER_REPRESENTATIVE_PROVEN`.** Explicitly **not** claiming
> `REAL_WORLD_CHAOS_REPLAY_READY`. **Do not merge until PR CI is green.**

## 1. Branch
`claude/real-world-chaos-replay-audit`

## 2. Base main HEAD (PR #61 merged)
`8684fc09c641a4c22223f2686d183dc1c7a3c8e9`

## 3. Final branch HEAD
`f30b26495b2fa166d0df5bd54c864208ad721295`

## 4. Working tree status
Clean. The diff is **test / fixture / spec / report + one CI-workflow line** only. **No production / runtime /
UI / service code was modified** — the chaos modules import and replay the existing runtime; nothing in
`src/app` or `src/components` imports them.

## 5. Scenario count
**180** counted real-world scenarios: **165** chaos-corpus (15 categories × 11 sourced patterns) + **15**
independent hand-authored gold cases.

## 6. Unique source count
**26** unique `sourceRef`s (11 chaos-pattern + 15 new independent-gold sources; all schema-valid, privacy-
clean, no PII / long-copied-text / hallucinated refs).

## 7. Independent gold count
**15** hand-authored gold cases (one per category). Expected dominant / modules / do-not-do / safe action /
rationale were authored from business reasoning **before** replay, **not** from `arbitrate()` or runtime
output. The real engine ran each with **no expected-constraint hint** and **independently agreed on all 15**
→ circularity **LOW** for these (vs **MEDIUM** for the 165 derived corpus, documented honestly).

## 8. DB-backed chaos proof
`chaos-db-replay.db.test.ts` (TEST_WITH_DB, local Postgres 16): **10 chaos themes** run through the real
DB-backed `getOwnerWholeBusinessPlan` from seeded scoped rows — each resolves its expected dominant + action
status (`blocked` / `owner_decision_required`) from real data, with isolation and **no cross-workspace /
cross-business leakage**. Plus `chaos-db-isolation.db.test.ts` (3) and the owner isolation/whole-plan DB
suites remain green.

## 9. Playwright chaos proof
`tests/browser/19-chaos-replay.spec.ts` renders **6 chaos scenarios on desktop + 3 on mobile** in a **real
browser** (Chromium). Ran locally (Next prod build + seeded Postgres + real server): **11 passed**. Wired into
the `owner-pilot-e2e` CI lane (runs on PRs to main). Asserts: runtime-fed dominant / action status / do-not-do
/ missing-data / confidence / impact / proof-reassessment / owner-delegate, advanced reasoning collapsed,
blocked never reads "Proceed", mobile-bounded, no fatal console errors.

## 10. Action-status limitation (honest)
Real-data dispositions observed: `blocked` + `owner_decision_required` (DB) and `need_more_data` + `blocked`
(in-memory). **`proceed` / `cautious_proceed` are NOT exercised** — the current supervisor policy is
conservative by design: any binding constraint routes to an owner decision or a block. This is a safety
property, not a faked gap; reaching the full action-status spectrum requires a **product-policy decision**,
out of scope here.

## 11. Representative vs exhaustive limitation (honest)
DB-backed (10 themes) and real-browser (6 desktop + 3 mobile) proofs are **representative**, not exhaustive
across all 180 counted scenarios. The 165 corpus scenarios remain proven at the runtime level (in-memory).
Exhaustive all-180 DB/browser replay is future work.

## 12. No-regression proof
- `prisma validate` valid ✅ · `tsc` 0 ✅ · `eslint` (changed) 0 ✅ · `lint:ratchet` PASS (baseline 2155→2155) ✅
- chaos replay + AI supervisor + pilot-readiness (DB on): **29 files / 311 passed** ✅
- DB gates (chaos-db-replay + chaos-db-isolation + owner-business-isolation + owner-whole-business-plan): **15 passed** ✅
- Non-DB gates (owner-mode + behavioral-validation + components): **987 passed / 26 skipped** ✅
- Real-browser chaos Playwright (spec 19): **11 passed** locally; re-runs on PR CI.
- Max-reliability, owner-pilot, AI supervisor: green.

## 13. Final classification
**`CHAOS_REPLAY_DB_BROWSER_REPRESENTATIVE_PROVEN`** — runtime replay (180) + representative DB-of-chaos (10) +
representative real-browser chaos (6 + 3) + independent gold lowering circularity to LOW (15) + source breadth
(26). **Not** `REAL_WORLD_CHAOS_REPLAY_READY`.

## 14. Merge recommendation
Mergeable **after PR CI is green** (especially `owner-pilot-e2e` running spec 19 and the DB lanes). Additive
test/spec/report-only diff, all local gates green. **Do not merge until CI is green.** Reaching full
`REAL_WORLD_CHAOS_REPLAY_READY` is deferred pending a product-policy decision (proceed/cautious_proceed) and
exhaustive all-180 DB/browser replay.
