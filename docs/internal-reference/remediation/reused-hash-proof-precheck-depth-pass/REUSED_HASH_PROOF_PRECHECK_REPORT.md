# Reused-Hash Proof Precheck — REPORT

**Classification:** `REUSED_HASH_PROOF_PRECHECK_REAL_AND_OWNER_VISIBLE`
(+ `ANTI_GAMING_ANALYTICS_STRENGTHENED`, `EVIDENCE_CREDIBILITY_STRENGTHENED`).

## A. Files created
- `src/domain/execution/reused-hash-precheck.ts` — pure policy + finding + workspace analysis.
- `src/services/execution/reused-hash-precheck.service.ts` — DB-backed, workspace-scoped, read-only.
- `src/__tests__/execution/reused-hash-precheck.test.ts` — 11 unit tests.
- `src/__tests__/execution/reused-hash-proof-simulation.db.test.ts` — 3 DB simulation tests.
- Docs under `docs/remediation/reused-hash-proof-precheck-depth-pass/`.

## B. Files changed
- `src/domain/owner-mode/anti-gaming-analytics.ts` — `reusedHashActors` input → deterministic
  `REUSED_PROOF_PATTERN` (excludes same-task reuse); coarse duplicate-flag path gated when present.
- `src/domain/owner-mode/evidence-credibility-graph.ts` — `submitterReusedHash` input → attributed
  `REUSED_PROOF` concern; workspace-level duplicate concern gated when the attributed source is present.
- `src/services/owner-guidance/owner-now-view.service.ts` — `reusedHash` dep; feed the two inputs;
  expose `reusedProofFindings` in the payload.

## C. Schema changes
**None.** `Proof.fileHash` / `taskId` / `submittedByUserId` / `workspaceId` / `id` all already exist
(with `@@index([workspaceId, fileHash])`). No new mutation, no new audit — the finding is derived.

## D. Source fields used
`Proof.fileHash` (exact content hash), `Proof.taskId` (task policy), `Proof.submittedByUserId` (actor
attribution), `Proof.workspaceId` + `Proof.id` (scoping + matched IDs).

## E. Backend logic
Workspace-scoped proof query → pure reused-hash policy (same-task allowed / cross-task needs-review /
cross-workspace blocked / no-hash data-insufficient) → structured findings + per-submitter reuse →
deterministic feed into credibility + anti-gaming → now-view exposure.

## F. Frontend logic
None (backend + queryable read; surfaced via the now-view payload).

## G. Acceptance criteria
- Deterministic duplicate/reused check exists, from real persisted proof/evidence data. ✓
- Workspace-scoped; cross-workspace matches blocked/ignored, no IDs leaked. ✓
- Same-task reuse allowed (no false warning); missing hash → DATA_INSUFFICIENT. ✓
- Result can feed credibility + anti-gaming; owner now-view surfaces the effect. ✓
- No fraud/theft label; no hidden score. ✓

## H. Known limitations
- Only exact content-hash matching (no artifact-reference/signature source yet → those enum values
  reserved but unproduced; no perceptual/OCR matching by design).
- Owner adjudication surface + UI remain future work.
- Detection strengthens the existing `duplicateFlagged` path (set at intake); it does not re-persist a
  flag (derived, queryable) — a governed re-persist is deferred to the adjudication pass.

## I. Trigger map
proof submitted with a fileHash → `getReusedHashFindings` (now-view) → cross-task reuse →
`submitterReuse` → `REUSED_PROOF_PATTERN` (anti-gaming) + `REUSED_PROOF` (credibility) → surfaced as
top signal/concern; `ANTI_GAMING_RISK` / `EVIDENCE_CREDIBILITY_RISK` reflect it.

## J. Failure modes covered
Same-task false positive (prevented → ALLOWED); cross-workspace leak (blocked, no IDs); malformed/absent
hash (DATA_INSUFFICIENT); fabricated duplicate (exact match required); fraud label (never emitted);
clean workspace (no finding).

## K. Events emitted
None (derived, read-only).

## L. Automated tests
14 new (11 domain incl. anti-gaming/credibility deterministic feed + 3 DB simulation). Changed-area
suites green.
