# Per-Proof Evidence Lists for Risk Signals — REPORT

**Classification:** `PROOF_EVIDENCE_LISTS_FOR_RISK_SIGNALS_REAL_AND_OWNER_VISIBLE`
(+ `ANTI_GAMING_ANALYTICS_STRENGTHENED`, `EVIDENCE_CREDIBILITY_STRENGTHENED`, `OWNER_MODE_EXCELLENCE_DEEPENED`).

## A. Files created
- `src/__tests__/owner-mode/proof-evidence-lists.test.ts` — 7 unit tests.
- `src/__tests__/execution/proof-evidence-lists-simulation.db.test.ts` — 5 DB simulation tests.
- Docs under `docs/remediation/proof-evidence-lists-for-risk-signals-depth-pass/`.

## B. Files changed
- `src/domain/owner-mode/anti-gaming-analytics.ts` — proof-id arrays on `ActorProofStats`/`ReviewerStats`;
  `aggregateProofEvents` collects them; `id` on `ProofEventRow`; `sourceCompleteness` on `GamingSignal`;
  `withEvidence` helper attaches supportingProofIds + completeness to SELF_REVIEW, RUBBER_STAMP,
  WEAK/REJECTED, REUSED(dup), LATE, OWNER_REVIEW_BURDEN (fake/tamper/manager branches → COMPLETE).
- `src/domain/owner-mode/evidence-credibility-graph.ts` — proof-id arrays on the cred stats;
  `aggregateCredibility` collects them; `sourceCompleteness` on `CredibilityFinding`; `withEvidence`
  attaches to SELF_REVIEW, REVIEW_QUALITY_CONCERN, UNRELIABLE_SUBMITTER, REPEATED_OWNER_REVIEW_BURDEN,
  WEAK_PROOF_NEEDS_REVIEW(proof-type); reused-hash concern → COMPLETE.

## C. Schema changes
**None** — the proof rows already carry `id` on the live path (the now-view already selects it).

## D. Source evidence used
`Proof.id` per category (weak / rejected / duplicate / overdue / accepted-weak / self-review /
weak-or-rejected-by-type), collected during the existing aggregation from real proof rows.

## E. Signal types covered
- **Anti-gaming**: SELF_REVIEW_ATTEMPT, MANAGER_RUBBER_STAMP, REPEATED_WEAK_PROOF, REPEATED_REJECTED_PROOF,
  REUSED_PROOF_PATTERN (dup path), LATE_COMPLETION_PATTERN, OWNER_REVIEW_BURDEN_CREATED_BY_STAFF.
- **Credibility**: SELF_REVIEW_BLOCKED_OR_ATTEMPTED, REVIEW_QUALITY_CONCERN, UNRELIABLE_SUBMITTER_PATTERN,
  REPEATED_OWNER_REVIEW_BURDEN, WEAK_PROOF_NEEDS_REVIEW (proof-type).

## F. Signal types still blocked (honest)
- SUSPICIOUS_FAST_COMPLETION (no persisted completion timestamps + duration baselines) → BLOCKED_BY_DATA.
- MANAGER_IGNORES_ESCALATION (no persisted escalation ack/resolution timing wired here) → BLOCKED_BY_DATA.
- Contradiction-count-only concerns (ACCEPTED_PROOF_WITH_BAD_OUTCOME/COMPLAINT/REWORK) — attributed per
  submitter but not per-proof, so they stay fail-visible (not suppressible) until per-proof linkage exists.

## G. Acceptance criteria
- Self-review + reviewer-quality/weak-proof signals carry proof evidence where data exists. ✓
- Proof-backed signals become adjudication-suppressible (existing per-source suppression applies). ✓
- Unsupported signals stay fail-visible with a missing-source explanation (BLOCKED_BY_DATA). ✓
- New proof after clearing re-surfaces. ✓
- Now-view reflects proof evidence (count + representative refs + completeness). ✓
- SLOs ease on proof-backed clearance, stay on confirm/new evidence. ✓
- Cross-workspace isolation; no hidden score; no fraud/theft label. ✓

## H. Known limitations
- `PARTIAL` completeness is modelled but not currently produced (signals are either COMPLETE with the
  whole proof basis or BLOCKED_BY_DATA); a partial-evidence case would need a signal whose basis spans
  both proof-level and non-proof sources.
- No UI.

## I. Trigger map
proof rows (with id) → aggregation collects per-category proof IDs → signal carries supportingProofIds
+ sourceCompleteness=COMPLETE → owner adjudicates → per-source suppression applies → new proof re-surfaces.

## J. Failure modes covered
Fabricated ids (never — ids come from real rows; absent → BLOCKED_BY_DATA); over-suppression (all-cleared
required; new proof re-surfaces); cross-workspace (per-workspace rows); clean workspace (no evidence).

## K. Events emitted
None new (read-time evidence; adjudication audit unchanged).

## L. Automated tests
12 new (7 unit + 5 DB simulation). Changed-area suites green.
