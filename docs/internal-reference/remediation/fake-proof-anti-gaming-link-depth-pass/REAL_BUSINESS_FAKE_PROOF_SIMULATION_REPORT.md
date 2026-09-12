# Real-Business Fake-Proof — SIMULATION REPORT

**Scenario:** Sparkle Laundry (workspace `wsL`). Operator `opWeak` submits two photo proofs; reviewer
`reviewer` ACCEPTS both. Later, each accepted proof is disputed as **SUSPECTED_FAKE_OR_REUSED_PROOF**
("photo appears reused from an earlier job") via the live governed dispute service. Plus a clean
workspace (`wsClean`) for isolation. DB-backed (`fake-proof-anti-gaming-simulation.db.test.ts`,
`TEST_WITH_DB=true`).

## Flow exercised
1. Two accepted proofs by `opWeak` (reviewed by `reviewer`).
2. Each disputed as `SUSPECTED_FAKE_OR_REUSED_PROOF` (governed `proof.disputed` audit written).
3. Read the live now-view.

## Result (real, from the governed dispute trail)
| Layer | Result |
|---|---|
| Anti-Gaming Analytics | **topGamingSignal = SUSPECTED_FAKE_OR_REUSED_PROOF_PATTERN**, `isRepeatedPattern=true`, attributed to `opWeak` |
| Signal transparency | reason code `REPEATED_SUSPECTED_FAKE_OR_REUSED_PROOF_DISPUTE` + proof/audit refs; `ownerActionRequired=true` |
| No accusation | serialized signal contains **no** `fraud`/`theft` label; no hidden numeric score |
| Business-Control SLO | `ANTI_GAMING_RISK` = **FAIL** |
| Evidence Credibility | a related credibility concern remains for the same operator (linked, not duplicated) |
| Profit/Constraint | the dispute already drives `WEAK_PROOF_REWORK_RISK` + `STAFF`; the signal links them |

## Honest missing-data + isolation (workspace wsClean)
- `getOwnerNowView(wsClean)` → `topGamingSignal` is **not** the fake-proof pattern (no suspicious data).
- No `wsL` dispute or proof bleeds into `wsClean`; a dispute whose proof is absent is never attributed.

## Interpretation for the owner
"Two of opWeak's accepted jobs were disputed because the photo looked reused. OpsIQ now shows this as
my top anti-gaming concern — a **repeated** suspected-fake/reused pattern tied to opWeak, with the exact
proofs and the dispute records behind it. It fails my anti-gaming control check and keeps the
credibility concern on opWeak's work. Crucially, OpsIQ does **not** call anyone a fraud — it flags a
pattern that needs my review and adjudication, and tells me to require fresh, independently verified
proof before assigning more work."
