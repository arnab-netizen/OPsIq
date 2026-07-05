# Fake-Proof → Anti-Gaming Link — REPORT

**Classification:** `FAKE_PROOF_ANTI_GAMING_LINK_REAL_AND_OWNER_VISIBLE`
(+ `ANTI_GAMING_ANALYTICS_STRENGTHENED`, `EVIDENCE_CREDIBILITY_STRENGTHENED`, `BUSINESS_CONTROL_SLO_STRENGTHENED`).

## A. Files created
- `src/__tests__/owner-mode/fake-proof-anti-gaming.test.ts` — 10 domain tests.
- `src/__tests__/owner-mode/fake-proof-anti-gaming-simulation.db.test.ts` — 2 DB simulation tests.
- Docs under `docs/remediation/fake-proof-anti-gaming-link-depth-pass/`.

## B. Files changed
- `src/domain/owner-mode/anti-gaming-analytics.ts` — 5 new conservative signal types; `isRepeatedPattern`
  + `relatedCredibilityConcern` on `GamingSignal`; `SuspiciousProofActorStats` / `SuspiciousReviewerStats`
  inputs; `aggregateSuspiciousProof` (join the dispute trail + tamper/duplicate to submitter/reviewer);
  detection section (single = warning, repeated = pattern).
- `src/domain/owner-mode/evidence-credibility-graph.ts` — optional `id` on `CredibilityProofRow` (used by
  the anti-gaming join; unused by credibility aggregation).
- `src/services/owner-guidance/owner-now-view.service.ts` — build suspicious aggregates from
  `disputeRisk.risks` + proof rows (now selecting `id`) and feed `identifyGamingSignals`.
- Existing test extended: `business-control-slo.test.ts` (fake-pattern ANTI_GAMING_RISK FAIL).

## C. Schema changes
**None.** The signal is derived entirely from existing data (the `proof.disputed` audit trail, the
persisted `tamper_suspected` / `duplicateFlagged` proof fields). No new mutation, no new audit.

## D. Backend logic
Governed dispute trail → per-actor/per-reviewer suspicious aggregates (with proof/audit refs) → pattern
detection (warning vs repeated) → top anti-gaming signal → SLO/credibility/profit/constraint links.

## E. Frontend logic
None (backend derivation; surfaced via the existing now-view payload).

## F. Acceptance criteria
- Fake/reused/suspicious proof disputes affect Anti-Gaming Analytics. ✓
- `topGamingSignal` can expose the pattern; owner now-view surfaces it. ✓
- Single severe event = warning; repetition = pattern (explicit `isRepeatedPattern`). ✓
- `ANTI_GAMING_RISK` SLO FAILs on a high/critical fake pattern. ✓
- Related credibility concern linked (not duplicated); profit-leak/constraint linked where available. ✓
- Clean workspace → `DATA_INSUFFICIENT`; cross-workspace proof cannot influence a signal. ✓
- No `fraud`/`theft` label; no hidden numeric punishment score. ✓

## G. Known limitations
- Reused-hash detection uses the existing `duplicateFlagged` field; a dedicated hash-reuse precheck is
  future work.
- `MANAGER_IGNORES_ESCALATION` and `SUSPICIOUS_FAST_COMPLETION` remain supported-but-unpopulated (no
  persisted source), reported honestly rather than fabricated.
- No UI; owner adjudication of any accusation remains a human process (by design).

## H. Manual verification
See `TEST_EVIDENCE_LEDGER.md`.

## I. Trigger map
proof accepted → `proof.disputed(SUSPECTED_FAKE_OR_REUSED_PROOF)` ×N by same operator → now-view
`aggregateSuspiciousProof` → `SUSPECTED_FAKE_OR_REUSED_PROOF_PATTERN` topGamingSignal → ANTI_GAMING_RISK
FAIL + related credibility concern + WEAK_PROOF_REWORK_RISK/STAFF link + reassessment trigger.

## J. Failure modes covered
Single event over-claimed as a pattern (prevented — warning only); cross-workspace proof attribution
(skipped); fabricated fraud label (never emitted — asserted); hidden score (none — reason codes + refs);
clean workspace (DATA_INSUFFICIENT).

## K. Events emitted
None (derived signal; no new governed mutation).

## L. Automated tests
13 new (10 domain + 1 SLO + 2 DB simulation). Changed-area suites green.
