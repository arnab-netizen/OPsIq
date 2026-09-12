# Fake / Reused / Suspicious Proof Dispute → Anti-Gaming Link — PLAN

## Objective
Make fake/reused/suspicious proof **disputes** (and the persisted tamper/duplicate proof fields) feed
**Anti-Gaming Analytics**, so OpsIQ can answer: *"Is a staff member, manager, or operator repeatedly
submitting, accepting, or relying on suspicious proof?"* — using only real existing signals, with a
conservative vocabulary and **no fraud label, no hidden staff score, no unadjudicated accusation**.

## Conservative signal vocabulary (new)
- `SUSPECTED_FAKE_OR_REUSED_PROOF_PATTERN`
- `TAMPER_SUSPECTED_PROOF_PATTERN`
- `WRONG_OR_INSUFFICIENT_PROOF_PATTERN`
- `MANAGER_ACCEPTED_SUSPICIOUS_PROOF`
- `REVIEW_QUALITY_CONCERN`
(plus existing `REUSED_PROOF_PATTERN`, `DATA_INSUFFICIENT`).

## Source signals (all existing — no new mutation, no schema change)
1. **proof dispute category** (from the governed `proof.disputed` audit trail): `SUSPECTED_FAKE_OR_REUSED_PROOF`,
   `WRONG_OR_INSUFFICIENT_PROOF`, `MANAGER_REVIEW_ERROR`.
2. **persisted proof fields**: `tamper_suspected`, `duplicateFlagged` (reused hash).
3. **evidence credibility graph**: linked as `relatedCredibilityConcern` (not duplicated).
4. **audit events**: `proof.disputed` (category + audit ref), `proof.reviewed`.

## Design
- **Aggregation** (`aggregateSuspiciousProof`, pure): join dispute records (proofId + category + audit
  ref) to the proof's submitter/reviewer + tamper/duplicate fields → per-actor + per-reviewer
  suspicious aggregates carrying the supporting proof IDs + audit refs. A dispute whose proof is absent
  (cross-workspace) is skipped — never fabricated.
- **Detection** (`identifyGamingSignals`): a **single** severe event is a WARNING
  (`isRepeatedPattern=false`, reasonCode `SINGLE_SEVERE_WARNING`); **repetition** (≥2) is a repeated
  pattern. Every signal carries reason codes, proof/audit refs, a related credibility concern, and a
  related profit-leak/constraint where the dispute already drives one.
- **Threshold honesty**: fake ≥1 warns / ≥2 pattern; wrong-insufficient ≥2; tamper ≥2; a manager who
  accepted a now-disputed-fake proof gets its own signal at ≥1.

## Integration (existing flows)
- **Anti-Gaming** topSignal can be driven by the fake/reused/suspicious pattern (highest type priority).
- **Evidence Credibility** — linked via `relatedCredibilityConcern` (no duplication).
- **Profit-Leak / Constraint** — the fake/wrong dispute already drives `WEAK_PROOF_REWORK_RISK` + `STAFF`
  (dispute-risk pass); the signal references them.
- **Business-Control SLO** — `ANTI_GAMING_RISK` already grades on top-gaming severity → FAIL on a
  CRITICAL/HIGH fake pattern; now-view signal completeness unchanged.
- **Reassessment** — high-risk repeated pattern carries a reassessment trigger (derived; no new mutation).
- **Audit** — none added; the signal is derived from the existing dispute/proof/audit data.

## Owner-visible
`GET /api/owner/now-view` → `topGamingSignal` surfaces the suspicious-proof pattern with the operator,
the pattern type, proof/audit refs, whether it is repeated or a single warning, whether owner action is
required, and the recommended (owner-adjudicated) response.

## Out of scope
Full Process Intelligence; public SaaS / Product Hunt / billing; broad HR/performance scoring; hidden
punitive staff scores; any "fraud/theft" adjudication (that is a human owner process).
