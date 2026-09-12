# Current Status Update — Adjudication Suppression Across All Sources

- **Base:** `origin/main` @ `428e18e6` (Owner Proof-Risk Adjudication, PR #121, merged).
- **Branch:** `claude/adjudication-suppression-all-sources-depth-pass`.
- **Classification:** `ADJUDICATION_SUPPRESSION_ALL_SOURCES_REAL_AND_OWNER_VISIBLE`
  (+ `ANTI_GAMING_ANALYTICS_STRENGTHENED`, `EVIDENCE_CREDIBILITY_STRENGTHENED`, `BUSINESS_CONTROL_SLO_STRENGTHENED`, `OWNER_MODE_EXCELLENCE_DEEPENED`).

## Source types covered
`REUSED_HASH_FINDING`, `ANTI_GAMING_SIGNAL`, `CREDIBILITY_CONCERN`, `PROOF_DISPUTE` — all four now
respect owner adjudication suppression consistently. **No schema change** (pure logic).

## What the owner can use now
Adjudicate any proof-risk source (via `POST /api/proof-risk/adjudicate`) and the now-view responds
consistently:
- **accept / dismiss** suppress that EXACT source signal (owner noise drops) — evidence + audit retained;
- **require-fresh / confirm / training / owner-review / inconclusive** keep the risk visible;
- a **new supporting proof** (new evidence) re-surfaces the risk — a cleared decision never permanently
  hides future risk;
- clearing one source never eases a different source.
The now-view adds a `proofRiskAdjudicationSummary` (active / cleared / inconclusive counts, latest
decisions, top active action).

## SLO impact
- `ANTI_GAMING_RISK` / `EVIDENCE_CREDIBILITY_RISK` ease only when the active top signal was cleared and
  no other evidence remains; they stay FAIL/WARN on confirm or on new evidence.
- `PROOF_OUTCOME_INTEGRITY` stays audit-derived — a dispute adjudication never erases it (bad proof is
  never marked good).

## What remains missing
- Gaming/credibility signals with **no** per-proof evidence list (e.g. self-review, rubber-stamp) are
  not adjudication-suppressible yet (fail visible).
- Owner UI for the adjudication queue.
- Browser E2E.

## Remaining restrictions
No fraud/theft label; no hidden score; no evidence deleted; proof status never rewritten (dispute flow
only); cross-workspace adjudications cannot suppress another workspace's risk.

## Next safest implementation order
1. Attach per-proof evidence lists to the remaining gaming/credibility signal types so they too can be
   adjudication-suppressed.
2. A minimal owner UI for the adjudication queue.
3. Then Process Intelligence over the full proof → precheck → dispute → adjudication chains.

## Out of scope (per instructions)
Owner UI; Process Intelligence; public SaaS / Product Hunt / billing; hidden staff scores.
