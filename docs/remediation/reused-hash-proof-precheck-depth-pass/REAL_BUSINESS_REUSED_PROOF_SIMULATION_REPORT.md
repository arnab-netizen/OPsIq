# Real-Business Reused-Proof — SIMULATION REPORT

**Scenario:** Sparkle Laundry (workspace `wsL`). Operator `opWeak` submits the **same photo**
(identical `fileHash`) as proof for **two different jobs** (`taskA`, `taskB`). A same-hash proof also
exists in another workspace (`wsOther`) and must never be exposed. DB-backed
(`reused-hash-proof-simulation.db.test.ts`, `TEST_WITH_DB=true`).

## Flow exercised
1. `proofA` (taskA) and `proofB` (taskB) share one `fileHash` — reuse across different jobs.
2. `proofOther` in `wsOther` shares the same hash (cross-tenant decoy).
3. Read the deterministic precheck + the live now-view.

## Result (real, from persisted fileHash + taskId + submitter)
| Layer | Result |
|---|---|
| Reused-hash precheck | `needsReviewCount = 2` (proofA & proofB flag each other); per-submitter reuse for `opWeak` = 2 |
| Policy | `NEEDS_REVIEW_DUPLICATE`, `EXACT_REUSED_HASH`, `HASH` match, same operator → **HIGH** |
| Workspace scope | matched IDs contain only same-workspace proofs; **`proofOther` never appears** |
| Per-proof drill-down | `getReusedHashFindingForProof(wsL, proofA)` → matched `proofB`, not `proofOther` |
| Owner Now View | `reusedProofFindings.needsReviewCount = 2`; surfaces `REUSED_PROOF_PATTERN` (anti-gaming) / `REUSED_PROOF` (credibility) |
| No accusation | serialized findings contain **no** `fraud`/`theft` label |

## Honest missing-data + isolation (workspace wsOther)
- `getReusedHashFindings(wsOther)` → `needsReviewCount = 0` (only one proof with that hash in `wsOther`).
- The now-view for `wsOther` shows no reused-proof finding; the `wsL` reuse never leaks in.

## Interpretation for the owner
"opWeak used the same photo to close two different jobs. OpsIQ now flags this deterministically — exact
hash, same operator, across different jobs — as a reuse that needs my review, with the exact proofs
listed. It shows up as a reused-proof pattern and a credibility concern. It never exposes anything from
another business that happens to share a file, and it never calls anyone a fraud — it gives me fair,
explainable evidence to decide whether to require fresh proof."
