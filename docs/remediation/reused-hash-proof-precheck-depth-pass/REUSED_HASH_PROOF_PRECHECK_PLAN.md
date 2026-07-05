# Dedicated Reused-Hash / Duplicate-Proof Precheck — PLAN

## Objective
Build a **deterministic, queryable, workspace-scoped** reused-hash / duplicate-proof check so reused
proof is real evidence — feeding the existing Evidence Credibility Graph + Anti-Gaming Analytics — with
a conservative vocabulary, **no fraud label, no hidden staff score, no cross-workspace leakage**.

OpsIQ answers: *"Has this proof artifact (file hash) been reused in a way that should reduce credibility
or trigger anti-gaming review?"*

## Source data (all persisted — no schema change)
`Proof.fileHash`, `Proof.taskId`, `Proof.submittedByUserId`, `Proof.workspaceId`, `Proof.id`
(with the existing `@@index([workspaceId, fileHash])`). No OCR, no image similarity, no perceptual
matching — exact content-hash matching only.

## Conservative classification
- **Statuses:** `PASS_NO_DUPLICATE`, `NEEDS_REVIEW_DUPLICATE`, `ALLOWED_DUPLICATE`,
  `BLOCKED_CROSS_WORKSPACE`, `DATA_INSUFFICIENT`.
- **Signal types:** `EXACT_REUSED_HASH`, `REUSED_ARTIFACT_REFERENCE`, `POSSIBLE_DUPLICATE_NEEDS_REVIEW`,
  `SAME_TASK_ALLOWED_DUPLICATE`, `CROSS_WORKSPACE_REUSE_BLOCKED_OR_IGNORED`, `DATA_INSUFFICIENT`.
- **Match types:** `HASH` (produced), `ARTIFACT_REFERENCE` / `SIGNATURE` (reserved).

## Policy (`evaluateReusedHash`, pure)
1. No / malformed hash → `DATA_INSUFFICIENT` (never a pass).
2. Same hash, **different task**, same workspace → `NEEDS_REVIEW_DUPLICATE` (`EXACT_REUSED_HASH`):
   same operator = **HIGH** severity; different operator = **MEDIUM** with lower attribution confidence.
3. Same hash, **same task** (e.g. resubmission) → `ALLOWED_DUPLICATE` (no false warning).
4. Same hash only in **another workspace** → `BLOCKED_CROSS_WORKSPACE` — **no IDs exposed**.
5. No match → `PASS_NO_DUPLICATE`.
A cross-workspace match alongside a same-workspace one is ignored (only same-workspace IDs surface).

## Service (read-only, derived — no mutation, no new audit)
- `getReusedHashFindings(workspaceId)` — workspace-scoped batch analysis + per-submitter reuse counts.
- `getReusedHashFindingForProof(workspaceId, proofId)` — one proof (dispute drill-down).

## Integration
- **Evidence Credibility Graph**: `submitterReusedHash` → attributed `REUSED_PROOF` concern
  (supersedes the coarse workspace duplicate-flag count when present — no duplication).
- **Anti-Gaming Analytics**: `reusedHashActors` → deterministic `REUSED_PROOF_PATTERN`
  (excludes same-task reuse; supersedes the coarse duplicate-flag heuristic when present).
- **Owner Now View**: exposes a `reusedProofFindings` block; the reuse can surface as
  `topGamingSignal` / `topCredibilityConcern` when highest-risk.
- **Business-Control SLO**: `ANTI_GAMING_RISK` / `EVIDENCE_CREDIBILITY_RISK` reflect the reused pattern.
- **Proof Dispute**: `getReusedHashFindingForProof` lets a `SUSPECTED_FAKE_OR_REUSED_PROOF` dispute
  reference the deterministic duplicate reason.

## Out of scope
Owner adjudication surface; Process Intelligence; public SaaS / Product Hunt / billing; hidden staff
scoring; file forensics / OCR / perceptual matching.
