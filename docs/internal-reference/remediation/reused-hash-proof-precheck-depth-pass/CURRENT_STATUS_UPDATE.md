# Current Status Update — Reused-Hash Proof Precheck

- **Base:** `origin/main` @ `c0186f3f` (Fake-Proof → Anti-Gaming Link, PR #119, merged).
- **Branch:** `claude/reused-hash-proof-precheck-depth-pass`.
- **Classification:** `REUSED_HASH_PROOF_PRECHECK_REAL_AND_OWNER_VISIBLE`
  (+ `ANTI_GAMING_ANALYTICS_STRENGTHENED`, `EVIDENCE_CREDIBILITY_STRENGTHENED`).

## Source fields used
`Proof.fileHash` (exact content hash), `Proof.taskId` (task policy), `Proof.submittedByUserId` (attribution),
`Proof.workspaceId` + `Proof.id` (scoping + matched IDs). **No schema change** — the
`@@index([workspaceId, fileHash])` already exists; the finding is derived (no new mutation/audit).

## What the owner can use now
A deterministic, workspace-scoped reused-hash / duplicate-proof precheck:
- `getReusedHashFindings(workspaceId)` and `getReusedHashFindingForProof(workspaceId, proofId)`;
- results on `/api/owner/now-view` as `reusedProofFindings` (which proof is reused, exact-vs-possible,
  which jobs, whether the same operator repeated it, whether fresh proof is needed, review-not-fraud,
  and missing data when confidence is low).

## What became deterministic
- Exact same-hash reuse **across different jobs** → `NEEDS_REVIEW_DUPLICATE` (same operator = HIGH).
- Same-job reuse (resubmission) → `ALLOWED_DUPLICATE` (no false warning — a real improvement over the
  coarse duplicate flag).
- Cross-workspace same-hash → `BLOCKED_CROSS_WORKSPACE`, **no IDs leaked**.
- Missing/malformed hash → `DATA_INSUFFICIENT`.

## Credibility / anti-gaming / SLO impact
- Evidence Credibility: attributed `REUSED_PROOF` concern per operator (supersedes the coarse count).
- Anti-Gaming: deterministic `REUSED_PROOF_PATTERN` (excludes same-task reuse).
- Business-Control SLO: `ANTI_GAMING_RISK` / `EVIDENCE_CREDIBILITY_RISK` reflect the reused pattern.

## What remains missing
- Owner adjudication surface (accept/dismiss a flagged reuse) + UI.
- Artifact-reference / signature match sources (only exact content-hash today).
- Browser E2E.

## Remaining restrictions
Exact content-hash matching only (no perceptual/OCR by design); no fraud/theft label; no hidden score;
cross-workspace data never exposed.

## Next safest implementation order
1. Owner adjudication surface: accept/dismiss a flagged reuse/fake pattern with an audit trail.
2. Governed re-persist of the deterministic duplicate flag from the precheck (audited).
3. Then Process Intelligence over the full proof → precheck → dispute → anti-gaming chains.

## Out of scope (per instructions)
Owner adjudication; Process Intelligence; public SaaS / Product Hunt / billing; hidden staff scoring;
file forensics / OCR / image similarity.
