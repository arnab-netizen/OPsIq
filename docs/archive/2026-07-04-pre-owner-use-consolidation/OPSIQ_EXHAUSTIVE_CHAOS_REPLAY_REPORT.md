# OpsIQ Exhaustive Real-World Chaos Replay — Report

> All **180 counted chaos scenarios** (165 source-backed corpus + 15 independent gold) lifted from
> runtime/in-memory proof up to **DB-backed + dashboard + real-browser** proof, with an exact per-scenario
> proof ledger. Additive and conservative; no existing gate weakened; no synthetic/unsourced scenario counted.

## 1. Branch
`claude/exhaustive-real-world-chaos-replay`

## 2. Base HEAD
`cbcb9519c07dc1083f5ad7e2b7195ed6050f7b82` (main, includes PR #63 merge `cbcb951`)

## 3. Final HEAD
`01f8ba74c159440b3bc791dd8b0da0cf5eec6144`

## 4. Working tree status
Clean (all work committed).

## 5. Total counted scenarios
**180** = 165 chaos corpus (15 categories × 11 source-backed patterns) + 15 independent gold (1 per category).

## 6. Exact scenario count per proof layer
| Layer | Proven | Basis |
|---|---|---|
| Ledger integrity (exactly 180, unique, source-backed) | 180 | `ledger-integrity.test.ts` (10 tests) |
| arbitrate() + owner runtime + supervisor (in-memory) | 180 | existing `chaos-run.test.ts` (165) + `independent-gold.test.ts` (15) |
| **DB-backed owner plan** | **180 / 180** | `exhaustive-db.db.test.ts` → `OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_LEDGER.run.json` |
| **Supervisor summary (DB path)** | **180 / 180** | same |
| **Dashboard render, real browser desktop** | **180 / 180** | `21-chaos-exhaustive-desktop.spec.ts` → `…DESKTOP.run.json` |
| **Real browser mobile (representative)** | **45 / 180** | `22-chaos-exhaustive-mobile.spec.ts` → `…MOBILE.run.json` |
| jsdom-only | 0 | not used as a substitute for browser proof (Playwright desktop is the dashboard proof) |

## 7. Unique sources
**26** (11 corpus patterns + 15 `SRC-IND-*` independent gold).

## 8. Independent gold cases
**15** (`INDEPENDENT_GOLD_CASES`), each hand-authored (expectation written from business reasoning, not copied from `arbitrate()`) with a distinct privacy-clean source.

## 9. Circularity risk
Reduced: 165 corpus cases carry an engineered `goldSkeleton`; the 15 independent-gold cases have expectations authored FIRST and the engine is asserted to agree independently. All 180 additionally verified through the **DB-backed runtime** (real persisted rows, not fixtures), which the derivation cannot pre-satisfy.

## 10. Action-status distribution (DB-backed, all 180)
`owner_decision_required` **116**, `blocked` **64**. This is the genuine, complete distribution for the adversarial chaos corpus. **No chaos scenario proceeds or cautious-proceeds** — that is the safety property (a chaos case that proceeded would be a failure). `proceed` / `cautious_proceed` / `need_more_data` are exercised by the dedicated PR #63 safe-action scenarios (browser specs 18/20, re-run green in no-regression), never by a chaos case.

Dominant-constraint distribution (all 180): proof_fraud_block 47, cash_survival 33, owner_workload 33, below_margin 17, compliance_block 17, capacity_feasibility 16, customer_quality 16, profitable_growth 1. good/bad/ugly: 16 / 65 / 99.

## 11. DB-backed scenario count
**180 / 180** — each seeded into its own isolated workspace+business and resolved through the real `getOwnerWholeBusinessPlan` to its locked dominant + policy status. Cross-business and cross-workspace isolation asserted. `customer_quality` (16) enabled by an **additive** customer-reputation seam (optional `reputation` on `OwnerDomainRows`, read from the existing `OwnerMetricSnapshot.complaintCount/rewashCount`; absent ⇒ byte-for-byte unchanged).

## 12. Desktop Playwright scenario count
**180 / 180** — real Chromium, one login, 15 category groups × 12, each asserting runtime-fed dominant == ledger, action status == policy, proof + reassessment visible, advanced reasoning collapsed, never "Proceed". No fatal console errors.

## 13. Mobile Playwright scenario count
**45 / 180 (representative)** — 3 per category × 15 categories, spanning all good/bad/ugly classes and both chaos statuses, at 375×812, no horizontal scroll.

## 14. jsdom scenario count
0 (intentional — the real-browser desktop lane is the dashboard proof; jsdom is not used as a substitute).

## 15. Proof ledger path
`OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_LEDGER.json` (authoritative 180-row expectation ledger) + run-result artifacts `OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_LEDGER.run.json` (DB), `…DESKTOP.run.json`, `…MOBILE.run.json`.

## 16–21. Quality scores
- **Module routing:** 180/180 resolve the expected dominant + expected modules present in the plan.
- **Dominant constraint:** 180/180 match locked gold (DB + browser).
- **AI supervisor behaviour:** 180/180 supervisor summaries policy-correct (blocked vs owner-decision; proof/reassessment/impact present; no fake confidence). AI-supervisor suite green.
- **Dashboard usefulness:** 180/180 desktop panels render mainIssue/action-status/do-now/proof/reassessment/impact with advanced reasoning collapsed; mobile usable (45).
- **Owner comprehension:** each panel states the binding issue + owner-vs-delegate + proof; no wall of text; blocked/owner-decision never read as proceed.
- **Business outcome usefulness:** every scenario carries a real-world consequence-if-wrong and a proof/reassessment path.

## 22–26. Safety counters
- Unsafe output: **0** · Generic advice: **0** · Fake-confidence: **0** · Bad-outcome-if-followed: **0** · Unresolved high-risk failures: **0**.

## 27. Failures fixed
- **DB-test business-id collision:** the globally-stable `chaosBusinessId` (seeded under the E2E workspace by the browser lane) collided with the DB test's random workspace because `ownerBusiness.upsert` keys on the id PK alone. Fixed by deriving the DB test's ids from its workspace (globally unique).
- **Browser stale-read:** `networkidle` resolved before React re-rendered; fixed with polling `toHaveText` assertions.
- **Seed import side-effect:** importing `seed-owner-scenarios` for its row-writers ran its `main()`; fixed with a direct-invocation guard.

## 28. CI / sharding details
`.github/workflows/chaos-exhaustive.yml`: a DB job (`migrate deploy`, postgres:16, ledger integrity + all-180 DB replay + a 180/180 coverage assertion + ledger artifact) and a 3-shard browser matrix (build, seed all 180, desktop chaos shards + representative mobile on shard 1). Additive — does not modify/replace `owner-pilot-e2e`. Local desktop sharding validated (`CHAOS_SHARD_INDEX/TOTAL`).

## 29. Run durations (local)
- All-180 DB replay: **~16–17 s** (seed 180 + 180 plan runs).
- All-180 desktop browser: **~78 s** (15 groups, one login).
- Representative mobile (45): **~21 s**.

## 30. Retry counts
0 — every layer passed on first execution after the fixes above (fixes were code corrections, re-run cleanly; no flaky retries relied upon).

## 31. No-regression proof
`prisma validate` ✓ · `tsc --noEmit` ✓ · ESLint (changed files) ✓ · `lint:ratchet` PASS (errors 2155 = baseline). Vitest: behavioral-validation + services/owner-mode **597/597**; owner-mode + governance + max-reliability + source-privacy + isolation **733/733**; ledger integrity **10/10**. Existing Playwright chaos/status specs 19 + 20 **21/21**. No gate weakened.

## 32. Final classification
**`EXHAUSTIVE_DESKTOP_DB_WITH_REPRESENTATIVE_MOBILE`**

All 180 DB-backed + all 180 full Playwright desktop (dashboard rendered from runtime-fed DB data) + representative mobile (45, exact count reported). Not claiming `REAL_WORLD_CHAOS_REPLAY_FULL_MOBILE_READY` (mobile is representative, not all-180). Not overclaiming the "all-5-statuses within chaos" wording of `…EXHAUSTIVE_READY`: the adversarial corpus genuinely produces only `blocked` + `owner_decision_required` (a safety property); the other three statuses are proven by the dedicated safe-action scenarios, not by chaos cases.

## 33. Exact limitations
- Mobile is representative (45/180), not exhaustive — full-mobile would take all 180 at mobile viewport.
- The chaos corpus exercises 2 of 5 action statuses by design (it must never proceed); the full 5-status spectrum is proven separately (PR #63 safe-action scenarios, re-run green).
- The `customer_quality` binding uses an additive reputation seam over `OwnerMetricSnapshot`; it is inert unless a metric snapshot with complaints/rework is persisted.
- Local no-regression uses `prisma db push` schema; CI confirms under `migrate deploy`.

## Hostile self-audit (§12)
1. Exactly 180 counted scenarios ran? **Yes** (ledger asserts 180; DB + desktop each covered 180).
2. Any scenario skipped DB proof? **No** (180/180).
3. Any scenario skipped desktop Playwright? **No** (180/180).
4. Any browser result from jsdom only? **No** (real Chromium).
5. Any existing owner-pilot fixture counted as chaos proof? **No** (chaos businesses are distinct, ledger-driven).
6. Any static/fallback data rendered? **No** (`criticalDomainsRealProviderBacked` asserted true for all 180).
7. Any non-DB data counted as DB-backed? **No**.
8. Any scenario passed only by retry? **No**.
9. Any failures hidden? **No** (3 real failures found + fixed + documented above).
10. All five action statuses appear? **In chaos: 2 (by design).** The other 3 via the safe-action scenarios — classification reflects this honestly.
11. proceed/cautious obey PR #63? **Yes** (only via explicit SOP on a safe dominant — no chaos case qualifies).
12. Did high-risk action ever proceed? **No.**
13. Did missing critical data ever proceed? **No.**
14. Any source/privacy check fail? **No** (733 gate tests green).
15. Any business-scope isolation check fail? **No** (cross-business + cross-workspace proven).
16. max-reliability green? **Yes.**
17. owner-pilot green? **Yes.**
18. AI supervisor green? **Yes.**
19. action-status policy green? **Yes.**
20. Final classification supported by evidence? **Yes — `EXHAUSTIVE_DESKTOP_DB_WITH_REPRESENTATIVE_MOBILE`.**
