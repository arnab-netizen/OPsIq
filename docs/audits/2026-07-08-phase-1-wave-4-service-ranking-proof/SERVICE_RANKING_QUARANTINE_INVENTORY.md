# Service-Ranking Quarantine Inventory — Phase 1 Wave 4 (SERVICE_LOGIC_ONLY)

- Branch: `claude/phase-1-wave-4-service-ranking-proof` · Base: `origin/main` (post-Wave-3)
- Date: 2026-07-08
- **This wave proves service-layer ranking/reranking logic with the DB boundary MOCKED. It is NOT real-DB proof** (real-DB recommendation persistence is proven separately by Wave 3's `recommendation.integration.test.ts`).
- Quarantine before Wave 4: 90 (post-Wave-3) · Reactivated: 1 · Remaining: 89.

## Candidate map

| # | Path | Source targeted | DB | Status / action |
|---|---|---|---|---|
| 1 | `services/__tests__/recommendation.reranking.test.ts` | `reRankRecommendationsInEngagement` | mocked (`vi.spyOn(db.recommendation, findMany/update)`) | **REACTIVATED** — self-contained; proves score→priority, reranking order, priority-update, audit, version bump |
| 2 | `services/__tests__/recommendation.priority.test.ts` | `mapScoreToPriority`, `createRecommendation`, `updateRecommendationPriorityFromScore` | mocked (partial) | **DEFERRED (documented)** — see below |
| 3 | `services/control/__tests__/recommendation.test.ts` | control-gate `isDataSufficient` etc. | none (pure-unit) | defer (not ranking/reranking) |

## Why #1 selected (clean SERVICE_LOGIC candidate)
`reRankRecommendationsInEngagement` is self-contained: `requireServiceContext(authContext)` → `db.recommendation.findMany` → per-rec pure `calculateRecommendationScore` → `mapScoreToPriority` → on change `db.recommendation.update` + `emitAuditEvent`. The test mocks exactly those db calls + audit, so with a single fixture fix (auth context) it exercises the real reranking/priority-mapping logic with persistence mocked. It covers the Wave-4 goals: score-to-priority mapping, deterministic ranking, priority update from score, reranking order within an engagement, no-op when priority already matches.

**Fixture fix applied (not an assertion change):** the prior `mockAuthContext` used the pre-refactor `{session, policy}` shape; the current service calls `requireServiceContext`, which reads `authContext.verifiedActorId`. Updated the fixture to the `CanonicalAuthContext`-style shape (`verifiedActorId` + related fields). No assertion weakened.

## Why #2 (`recommendation.priority.test.ts`) is DEFERRED
Its `createRecommendation`-based blocks are **stale against the heavily-evolved current `createRecommendation`**, which now (a) reads the `CanonicalAuthContext` (the test's `mockAuthContext` is the old `{session, policy}` shape), and (b) invokes multiple **unmocked side-effecting dependencies** the test does not stub — `EventEmitterService.emit`, `recordRecommendationUsage`, and evidence/KPI evaluation (`evaluateEngagementEvidence`/`evaluateEngagementKPIHealth`). Making these blocks pass reliably requires broad mock repair (or converting to real DB, which is out of this wave's scope). Deferring avoids a fragile, low-confidence reactivation. Note the score→priority mapping is already exercised in #1 (reRank calls `mapScoreToPriority`). A focused follow-up wave can repair `recommendation.priority.test.ts`'s mocks.

## Rules honored
- No quarantined test deleted (reactivation is `git mv`; history preserved). No assertion weakened.
- Labelled **SERVICE_LOGIC_ONLY** — mocked db calls are NOT counted as DB proof.
- 89 tests remain quarantined, each with a documented action.
