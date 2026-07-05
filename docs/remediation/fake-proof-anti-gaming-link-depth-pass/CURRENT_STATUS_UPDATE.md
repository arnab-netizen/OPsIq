# Current Status Update — Fake-Proof → Anti-Gaming Link

- **Base:** `origin/main` @ `e70f5986` (Operational Event Resolution / Aging, PR #118, merged).
- **Branch:** `claude/fake-proof-anti-gaming-link-depth-pass`.
- **Classification:** `FAKE_PROOF_ANTI_GAMING_LINK_REAL_AND_OWNER_VISIBLE`
  (+ `ANTI_GAMING_ANALYTICS_STRENGTHENED`, `EVIDENCE_CREDIBILITY_STRENGTHENED`, `BUSINESS_CONTROL_SLO_STRENGTHENED`).

## Source signals used
- Governed `proof.disputed` trail categories: `SUSPECTED_FAKE_OR_REUSED_PROOF`,
  `WRONG_OR_INSUFFICIENT_PROOF`, `MANAGER_REVIEW_ERROR`.
- Persisted proof fields: `tamper_suspected`, `duplicateFlagged` (reused hash).
- Evidence Credibility Graph (linked as related concern, not duplicated).
- **No new schema, no new mutation, no new audit** — the signal is derived from existing data.

## What the owner can use now
`GET /api/owner/now-view` → `topGamingSignal` can surface a suspicious-proof **behaviour pattern**:
`SUSPECTED_FAKE_OR_REUSED_PROOF_PATTERN`, `TAMPER_SUSPECTED_PROOF_PATTERN`,
`WRONG_OR_INSUFFICIENT_PROOF_PATTERN`, `MANAGER_ACCEPTED_SUSPICIOUS_PROOF`, `REVIEW_QUALITY_CONCERN` —
attributed to the operator/reviewer, with reason codes, proof/audit refs, whether it is a repeated
pattern or a single warning, whether owner action is required, and the recommended (adjudicated) response.

## What became detectable
- A same-actor **repeated** suspected-fake/reused, wrong/insufficient, or tamper-suspected pattern.
- A manager/reviewer who **accepted** a proof later disputed as fake/suspicious, or accepted a
  tamper-suspected proof.
- A single severe event surfaces as a **warning** (never over-claimed as a pattern).

## SLO impact
- `ANTI_GAMING_RISK` FAILs on a high/critical fake-proof pattern (existing SLO now driven by the new signal).
- Now-view signal completeness unchanged; no new SLO added.

## What remains missing
- Dedicated hash-reuse precheck (reused detection uses the existing `duplicateFlagged` field).
- UI; owner adjudication remains a human process (by design).
- Browser E2E remains unproven.

## Remaining restrictions
No `fraud`/`theft` label and no hidden staff score — OpsIQ flags a pattern for owner review/adjudication,
never an accusation. Cross-workspace proof cannot influence a signal.

## Next safest implementation order
1. Dedicated reused-hash precheck to strengthen `REUSED_PROOF_PATTERN` evidence.
2. Owner adjudication surface (accept/dismiss a flagged pattern) with an audit trail.
3. Then Process Intelligence over the full proof → dispute → complaint/rework → anti-gaming chains.

## Out of scope (per instructions)
Process Intelligence; public SaaS / Product Hunt / billing; broad HR/performance scoring; hidden punitive
staff scores; any fraud/theft adjudication.
