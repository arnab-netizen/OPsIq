# Evidence Bundle (DEC-EVID-01) & Precheck (EVID-01) Closure — plus Tenancy finalization

## DEC-EVID-01 — Evidence bundles: SAFELY_DISABLED_FOR_OWNER_USE
**Commit:** `01a86406` · **Test:** `src/__tests__/security/dec-evid-01-bundle-isolation.db.test.ts`

### What was found
- `EvidenceBundle` / `EvidenceBundleItem` group **`EvidenceItem`** rows. `EvidenceItem` is a *separate*
  model from the canonical **`Evidence`** entity that the whole intake → verification → recommendation
  pipeline writes (`db.evidence`). No active service writes `EvidenceItem` (only the generated client
  and ignored tests reference `db.evidenceItem`).
- No verification / recommendation / scoring service reads `EvidenceBundle`. So bundles are **not**,
  and must not become, a parallel/competing proof truth — which is exactly the DEC-EVID-01 concern.
- The bundle service also carried irreconcilable schema drift: it referenced a non-existent
  `workspaceId` column on both bundle tables, used wrong relation/field names (`items`, `evidenceId`),
  and validated against `db.evidence` while writing an `evidenceItemId` FK that resolves against
  `EvidenceItem`. The three live routes (`/api/evidence-bundles*`) therefore threw opaque 500s. The
  subsystem never functioned against the current schema.

### Decision
Re-enabling requires a deliberate model reconciliation (merge `EvidenceItem` into canonical
`Evidence`, or vice-versa) with its own migration and proof tests — out of scope for owner-use. The
owner-safe action is to **fail closed at a single service-layer chokepoint**: all six bundle entry
points call `assertEvidenceBundlesEnabled()`, which throws `FeatureDisabledError` (501, non-retryable).
No route (present or future) can bypass the block or reach the broken code or expose a competing proof
surface. Canonical `Evidence`, verification, and proof are untouched. The drift-broken database code
was removed (functions are clean `Promise<never>` fail-closed entry points), so nothing half-working
remains.

### Proof
The DB test asserts every entry point rejects with `FeatureDisabledError` (code `FEATURE_DISABLED`,
status 501) for valid workspace inputs and that no bundle row is written.

## EVID-01 — Proof precheck wired into intake
**Commit:** `c666ea4d` · **Tests:** `proof-intake.service.db.test.ts`, `domain/execution/proof-precheck.test.ts`

### What was found
`runProofPrecheck` / `computeProofPrecheck` (Slice 11) were fully implemented but had **zero runtime
callers** — a submitted proof was never screened before a human saw it.

### What was done
`intakeProofSubmission` now runs the deterministic precheck immediately after `submitProof`, advancing
the proof to a screened status (`AI_PRECHECK_PASSED` / `AI_PRECHECK_FAILED` / `NEEDS_HUMAN_REVIEW`).
Signals are deterministic and typed-field-only (never free-text notes):
- **duplicate/reuse** — real workspace file-hash set → `POSSIBLE_DUPLICATE`;
- **artifact integrity** (new, `detectProofArtifactSignals`) — a present-but-malformed `fileHash`
  (not a well-formed sha1/256/512 digest) is a forged/garbled reference → `tamperRisk` →
  `POSSIBLE_TAMPER_RISK`. Absent hashes are not flagged (note-type proofs carry none; a missing
  required artifact is caught by required-field validation).

### Why weak evidence can never count as verified
- The precheck is a **SYSTEM-only** transition and can **never** reach `ACCEPTED` (proof FSM +
  `precheckCanFinalAccept()` structural guarantee).
- Task completion clears **only** on `ACCEPTED` (`evaluateProofClearance`), and `AI_PRECHECK_PASSED`
  does **not** clear. So screening routes weak/suspect proof to a human; it cannot verify anything.
- A precheck concurrency conflict never rolls back a valid submission (logged, `precheckOutcome=null`).

## Tenancy finalization — ClientAccount / LeadRecord
**Commits:** `f5d805ca`, `43a3e75b` · **Decision:** `OWNER_DATA_SAFE_BY_SERVICE_FAIL_CLOSED`

A **nullable transitional** `workspaceId` column (+ index) was added to `ClientAccount` and
`LeadRecord`; the services create with, and filter by, the verified workspace, and fail closed when a
workspace is absent (`enforceWorkspaceId` / `requireServiceContext`). Nullable (not NOT NULL) was
chosen because 28 existing seed/test paths create these rows without a workspace; forcing NOT NULL
would break historical data without a backfill. For a single owner running their own workspace this is
safe: every write path stamps the verified workspace and every read path scopes to it. The NOT-NULL
tightening + backfill is a documented pilot/SaaS follow-up, not an owner-tomorrow blocker.
