# OpsIQ Exhaustive Chaos Replay — PR Report

Final classification: **`EXHAUSTIVE_DESKTOP_DB_WITH_REPRESENTATIVE_MOBILE`**

## 1. Branch
`claude/exhaustive-real-world-chaos-replay`

## 2. Base `main` HEAD
`cbcb9519c07dc1083f5ad7e2b7195ed6050f7b82` (includes PR #63 merge `cbcb951`). The branch merge-base equals this commit — cleanly ahead of `main`.

## 3. Final branch HEAD
`33ab6b6f8c08d1e0b65a07de264e27a99e9ad595` (before this PR-report commit; this report adds one commit on top).

## 4. Working tree status
Clean; synced with `origin/claude/exhaustive-real-world-chaos-replay` before this report.

## 5. Implementation summary
Lifts all **180 counted chaos scenarios** (165 source-backed corpus + 15 independent gold) from runtime/in-memory proof up to **DB-backed + dashboard + real-browser** proof, tied to a single authoritative proof ledger.
- `chaos-ledger.ts` (pure) — authoritative 180-row ledger + integrity tests (exactly 180, unique, source-backed, anti-skip).
- `seed-chaos-scenarios.ts` — `chaosScenarioToKnobs` maps each locked dominant → seed knobs; `seedChaosScenario` seeds one isolated business (+ reputation metric for customer_quality); `seedAllChaosScenarios` for the browser.
- Additive customer-reputation seam (optional `reputation` on `OwnerDomainRows`, read from the existing `OwnerMetricSnapshot`; inert when absent).
- `exhaustive-db.db.test.ts` — all-180 DB replay through the real `getOwnerWholeBusinessPlan`.
- `21-chaos-exhaustive-desktop.spec.ts` (all 180, sharded) + `22-chaos-exhaustive-mobile.spec.ts` (representative 45).
- `chaos-exhaustive.yml` CI lane (DB job + 3-shard browser matrix).

## 6. Exact scenario count
**180** = 165 corpus (15 categories × 11 patterns) + 15 independent gold. 26 unique sources.

## 7. Exact DB-backed count
**180 / 180** — each seeded into its own isolated workspace+business, resolved to its locked dominant + policy status (compliance/proof → blocked; every other binding constraint → owner_decision_required). Cross-business + cross-workspace isolation asserted. Zero failures.

## 8. Exact desktop Playwright count
**180 / 180** — real Chromium, runtime-fed dominant == ledger, action status == policy, proof + reassessment visible, advanced reasoning collapsed, never "Proceed". No fatal console errors.

## 9. Exact mobile Playwright count
**45 / 180 (representative)** — 3 per category × 15 categories, all good/bad/ugly, both chaos statuses, 375×812, no horizontal scroll.

## 10. Proof ledger summary
`OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_LEDGER.json` — 180 rows, unique ids, every row source-backed, per-layer status slots. Run-result artifacts: `…LEDGER.run.json` (DB 180/180), `…DESKTOP.run.json` (180/180), `…MOBILE.run.json` (45/45). Dominant dist: proof_fraud_block 47, cash_survival 33, owner_workload 33, below_margin 17, compliance_block 17, capacity_feasibility 16, customer_quality 16, profitable_growth 1. Status dist: owner_decision_required 116, blocked 64.

## 11. CI sharding summary
`chaos-exhaustive.yml`: **DB job** (`migrate deploy`, postgres:16, ledger integrity + all-180 DB replay + a 180/180 coverage assertion + ledger artifact) and a **3-shard browser matrix** (build, seed all 180, desktop chaos shards + representative mobile on shard 1, upload artifacts). Additive — does not modify/replace `owner-pilot-e2e`. Sharding validated locally via `CHAOS_SHARD_INDEX/TOTAL`.

## 12. Bug fixes found during exhaustive replay
1. **DB business-id PK collision** — the globally-stable `chaosBusinessId` (seeded under the E2E workspace by the browser lane) collided with the DB test's random workspace because `ownerBusiness.upsert` keys on the id PK alone; the upsert updated the E2E row instead of creating one in the test ws. Fixed by deriving the DB test's ids from its workspace.
2. **Browser stale-read** — `networkidle` resolved before React re-rendered; fixed with polling `toHaveText` assertions.
3. **Seed import side-effect** — importing `seed-owner-scenarios` for its row-writers ran its `main()`; fixed with a direct-invocation guard.

## 13. No-regression proof (local)
`prisma validate` ✓ · `tsc --noEmit` ✓ · ESLint (11 changed files) ✓ · `lint:ratchet` PASS (errors 2155 = baseline; changed-file errors 0). Vitest: ledger integrity + action-status policy + exhaustive DB **30/30**; behavioral-validation + services/owner-mode **597/597**; owner-mode + governance + max-reliability + source-privacy + isolation **733/733**. Browser: exhaustive desktop 180 + mobile 45 + specs 19 + 20 = **53/53**. No gate weakened. max-reliability / owner-pilot / AI-supervisor / action-status policy / source-privacy / business-scope isolation all green.

## 14. Honest limitations
1. **Not `FULL_MOBILE_READY`** — only **45/180** mobile scenarios were run (representative). Full mobile requires all 180 at mobile viewport.
2. The chaos corpus exercises **2 of 5** action statuses by design (`owner_decision_required`, `blocked`) — a chaos case that proceeded would be a safety failure.
3. The other 3 statuses (`need_more_data`, `cautious_proceed`, `proceed`) are proven by the dedicated safe-action scenarios (PR #63, browser spec 20), re-run green — never by a chaos case.
4. `customer_quality` (16) binds via an additive reputation seam over `OwnerMetricSnapshot`; inert unless a complaints/rework metric is persisted (733 gate tests confirm no regression).
5. Local no-regression uses `prisma db push`; CI confirms under `migrate deploy`.

## 15. Final classification
**`EXHAUSTIVE_DESKTOP_DB_WITH_REPRESENTATIVE_MOBILE`** — all 180 DB-backed + all 180 full Playwright desktop (dashboard from runtime-fed DB data) + representative mobile (45, exact count reported).

## 16. CI expectations
`chaos-exhaustive.yml` must run in PR CI (DB job green + 3 browser shards green). `owner-pilot-e2e`, `owner-pilot-db`, and the standard build/type/prisma/lint/security/readiness gates must remain green. The exhaustive DB lane runs under `migrate deploy` (no local `db push` artifact).

## 17. Merge recommendation
Recommend merge **only once PR CI is green** (chaos-exhaustive DB + browser shards + all existing gates). **Do not merge** before CI confirms. No product/runtime change beyond the additive reputation seam; no gate weakened.
