# OpsIQ Known-to-Unknown Business Reality Hardening — Plan

> Consolidate the real-world hardening work and lay the credible path from the 180-scenario baseline to a
> broad known-to-unknown corpus (1,250 + 50 sequential), WITHOUT fabricating volume. Owner Mode only.
> Minimum-code: audits, plans, a typed scenario/ledger contract with tests, and reuse of proven systems.
>
> **Selected scope (§15): Scope A** — Audit + Contracts + Full-Mobile consolidation. Ceiling classification:
> `REAL_WORLD_READINESS_HARDENED_FULL_MOBILE_WITH_CORPUS_PLAN`. (Scope C / 1,250 not attempted this slice — it
> cannot be done honestly in one PR without weak filler.)

## 1. Base HEAD
`20018031` (branch `claude/real-world-readiness-hardening-full-mobile`, owner-authorized base) — which sits on
`243cabfa` (main, merged PR #64 exhaustive chaos replay). This preserves the full-mobile 180 + pilot-reality
guardrail + shadow-pilot built last turn (no duplication).

## 2. Confirmed shipped classifications
On main: OWNER_PILOT_READY · AI_SUPERVISOR_(DOMAIN_COLLECTIVE)_TRAINED · CHAOS_REPLAY_DB_BROWSER_REPRESENTATIVE_PROVEN · CAUTIOUS_PROCEED_POLICY_READY · EXHAUSTIVE_DESKTOP_DB_WITH_REPRESENTATIVE_MOBILE (PR #64).
On the base branch (unmerged): full-mobile 180 + pilot-reality guardrail + shadow-pilot.

## 3. Current proven capabilities
- 180 counted chaos scenarios: DB-backed 180/180, desktop 180/180, **full mobile 180/180**.
- Deterministic owner runtime: arbitration → whole-business plan → supervisor summary → action-status policy.
- Input-quality gate (default-on), confidence bands, ranked next-best data requests, compliance-boundary 4-tier classifier, novelty-as-missing-critical suppression, outcome verification/self-evaluation, causal adjudication + controlled-learning governance, readiness-score dimensions/blockers, pilot-reality guardrail (readiness-state ladder), shadow-pilot mode.

## 4. Current UNPROVEN claims (explicitly not claimed)
- Live business outcome / profit improvement (no live data) → guardrail forbids.
- Broad "day-to-day-to-extreme" business reality coverage beyond the 180 baseline → this is what the corpus expansion plan addresses; NOT claimed yet.
- Unknown-unknowns handled directly → only SAFE handling of unknowns (novelty → confidence↓ → escalate/block/proof/reassess/local-adjudicated-learning) is claimed.

## 5. What OpsIQ already does per target area (§8–14)
Input quality, weak/stale/conflicting behaviour, ranked next-best requests, owner/staff responsibility, local/legal/professional boundary, novelty/OOD, expected-vs-actual outcome loop, 5-second dashboard (desktop+mobile), pilot-reality guardrail, shadow-pilot — ALL present at runtime (see `OPSIQ_REAL_WORLD_READINESS_LACKING_AUDIT.md` file:line map). Reused, not rebuilt.

## 6. Already proven by tests
recommendation-input-quality(.gate), input-guidance, compliance-boundary, novelty-training, outcome-verification, self-evaluation-loop, g4-outcome-tracker, readiness-score, pilot-readiness-policy (9), shadow-pilot (10), exhaustive-db (180), ledger-integrity (10), gate-protection (5), full-mobile (180), action-status policy, AI-supervisor, governance/adjudication.

## 7. What is still lacking (real gaps this slice)
1. **Scenario coverage breadth** — 180 is a narrow slice (15 categories × 11 patterns + 15 gold). No daily-ops / weekly-trend / sequential-simulation / OOD-explicit / adversarial packs at scale. → coverage audit + expansion plan (no fake volume).
2. **A typed scenario/ledger CONTRACT** general enough for the 1,250+50 expansion, with the known→unknown tagging and per-scenario proof-layer ledger, enforced by tests. → new `business-reality-scenario.ts` schema + `business-reality-ledger.ts` + tests.
3. (Everything else in §8–14 is already closed on the base branch — cited, not rebuilt.)

## 8. What is NOT missing / must NOT be rebuilt
Runtime engines (arbitration, supervisor, action-status, input-quality, boundary, novelty, outcome, adjudication, readiness), the 180 chaos corpus, the guardrail, the shadow-pilot, the full-mobile proof. The new schema WRAPS the existing 180 (does not replace `chaos-ledger.ts`).

## 9. Minimum-code closure plan
- **Docs:** lacking audit (30 areas), coverage audit (19 dims), corpus expansion plan (1,250+50).
- **Contract:** `src/domain/scenarios/business-reality-scenario.ts` — a zod schema with the 32 required fields + the known/known_unknown/pattern_adjacent_unknown/unknown_unknown_guardrail tag; `sequential-simulation.ts` schema (simulationId, 7–30 events, expected per-event decision/proof/reassessment/outcome); `business-reality-ledger.ts` — the per-scenario proof-layer ledger contract. A `liftChaosEntry()` maps each existing chaos-ledger entry into the new schema so the schema is PROVEN against the real 180, not vaporware.
- **Tests:** the 11 §6 schema/ledger tests.
- No new runtime service, no new engine, no scenario fabrication.

## 10. Exact files likely to change / add
- Add: `src/domain/scenarios/business-reality-scenario.ts`, `sequential-simulation.ts`, `business-reality-ledger.ts`.
- Add tests: `src/__tests__/scenarios/business-reality-schema.test.ts`.
- Add docs: the 3 audit/plan md files + this plan + the final report.
- No change to runtime services, the 180 chaos corpus, or gates.

## 11. Exact tests to add
The 11 §6 tests (duplicate id fails; counted needs sourceRef; synthetic counted fails unless labeled non-counted; missing expectedActionStatus/expectedDominantConstraint/expectedProofRequired/expectedMobileFields fails; highRisk without mobile proof fails risk-ready; professionalReviewRequired + proceed fails; liveOutcomeClaimAllowed true without live data fails; skipped-as-pass fails) + a test proving the existing 180 all lift into the schema validly.

## 12. Exact DB proof required
Reuse the merged/base all-180 DB lane (no change). The new schema is a contract layer — no new DB seeding.

## 13. Exact desktop proof required
Reuse the base 180/180 desktop lane (no change).

## 14. Exact full mobile proof required
Reuse the base full-mobile 180/180 (already built). No new mobile work this slice beyond keeping it green.

## 15. Scenario expansion strategy
Baseline = `BASELINE_CHAOS_CORPUS_V1` (180, preserved). Grow to 1,250 counted single-scenario + 50 sequential across 10 packs, each sourced + gold-anchored + ledgered, added in future incremental PRs (one pack per PR). The schema/ledger contract shipped here is the foundation; no scenarios are fabricated now.

## 16. CI sharding strategy
Reuse `chaos-exhaustive.yml` (DB + 3 browser shards incl. full mobile). Future packs extend the matrix; the schema tests run in the standard vitest lane.

## 17. Anti-skip strategy
Schema tests forbid: duplicate ids, missing sourceRef on counted, synthetic-as-counted, missing required expectations, highRisk-without-mobile, professionalReview+proceed, live-claim-without-live-data, skipped-as-pass. The gate-protection test (base branch) already enforces count≥180, mobile 180, ledger completeness, no-skip-as-pass, no-over-evidence.

## 18. Proof-ledger strategy
`business-reality-ledger.ts` defines the per-scenario proof-layer record (16 fields: ownerRuntime/DB/desktop/mobile/inputQuality/boundary/novelty/outcomeLoop/sourcePrivacy/businessScope/actionStatusPolicy/dashboard status + skipped + failureReason + evidenceArtifactRef). The existing chaos run-ledgers remain the evidence for the 180.

## 19. What will explicitly NOT be claimed
- No 1,250 corpus, no BUSINESS_REALITY_KNOWN_TO_UNKNOWN_READY (Scope A only).
- No live outcome / profit / public-SaaS (no live data).
- No unknown-unknown direct handling — only safe managed handling.

## 20. Final classification gates
- `SCENARIO_COVERAGE_AUDITED` — coverage audit committed.
- `REAL_WORLD_READINESS_HARDENED_FULL_MOBILE_WITH_CORPUS_PLAN` — all of: lacking + coverage audits, 1,250+50 expansion plan, schema/ledger contract with passing tests, existing 180 full-mobile green, all §8–14 gaps closed (reused), no-regression green, no overclaim. **This slice's target.**
