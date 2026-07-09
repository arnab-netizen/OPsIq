# Phase 6A — Owner-facing raw-500 fixes (F1 fixed, F2 cleared as false positive)

**Date:** 2026-07-09
**Branch:** `claude/phase-6a-owner-facing-raw-500-fixes`
**Scope (governing prompt):** fix the two owner-facing raw-500 defects surfaced by the Phase 5D hostile
audit — **F1** (`findings.ts` invalid-select cluster) and **F2** (`owner/dashboard` `db.KPI`) — with REAL
required-lane DB tests, **no schema change, no fake fields**. F3/F4/F8/F10/F11/F12 and quarantine Wave 2 are
explicitly **out of scope** and untouched.

---

## Summary

| Finding | Audit claim | Phase 6A outcome |
|---|---|---|
| **F1** — `findings.ts` invalid-select cluster | Raw 500 on `GET /api/engagements/[id]/findings`, `GET /api/findings/[id]`, and evidence link/unlink | **CONFIRMED and FIXED.** Real defect reproduced against a real DB, fixed with real columns + `Finding.metadata`, proven green. |
| **F2** — `owner/dashboard` `db.KPI` typo | `db.KPI` is `undefined` → 500 on every `GET /api/owner/dashboard` | **DISPROVEN — false positive.** Adversarial DB testing shows the extended Prisma client exposes BOTH `KPI` and `kPI` as working delegates. No 500 exists. Product left unchanged. |

Net product change in this PR: **one file** (`src/services/findings.ts`). No schema change, no fake fields,
no new columns. F2 required no product change — the honest outcome of adversarial verification.

---

## F1 — findings.ts invalid-select cluster (CONFIRMED, FIXED)

### Root cause
The `Finding` model has **no** `linkedEvidence`, `description`, `findingType`, or `provisionalFlag`
columns, and `Evidence` has **no** `relatedFindingId` or `visibility` column. Finding↔Evidence is only
`Finding.primaryEvidenceId → Evidence`. The service selected those phantom fields, so Prisma threw
`PrismaClientValidationError` → **raw 500** on:
- `listFindingsForEngagement` (`GET /api/engagements/[engagementId]/findings`)
- `getFindingDetail` (`GET /api/findings/[findingId]` + PATCH re-read)
- `linkEvidenceToFinding` / `unlinkEvidenceFromFinding` (`.../findings/[id]/evidence`)
- `validateFinding`, `supersedeFinding` (phantom-column reads/writes)

### Fix (no schema change, no fake fields)
All phantom selects/writes replaced with **real** columns; linked evidence persisted in the real
`Finding.metadata` JSON column; the API DTO's `description` / `findingType` / `linkedEvidence` /
`provisionalFlag` are **derived from real columns** so the public contract is unchanged:
- `description ← summary`
- `findingType ← deriveFindingType(impactArea)` (real `impactArea` → stable type map)
- `linkedEvidence ← readLinkedEvidenceIds(metadata)` (real `Finding.metadata.linkedEvidenceIds`)
- `provisionalFlag ← status === "provisional"`
- link/unlink now write `Finding.metadata.linkedEvidenceIds` via a single concurrency-safe
  `finding.update` (dropped the phantom `Evidence.relatedFindingId` write) and keep the audit event.
- `supersedeFinding.create` now writes only required real columns (`id`, `engagementId`,
  `primaryEvidenceId` [required — throws if absent], `title`, `summary`, `impactArea`, `severity`,
  `rootCause`, optional `metadata.linkedEvidenceIds`, `updatedAt`); dropped 5 phantom columns.

### Proof (real DB, no Prisma mocks)
`src/services/__tests__/findings-invalid-select.db.test.ts` — 5 tests, gated by `TEST_WITH_DB=true`:
1. the OLD phantom `linkedEvidence` select **throws** on a real DB (defect-class proof);
2. `listFindingsForEngagement` returns findings, **no raw 500**;
3. `getFindingDetail` returns the mapped DTO (`description===summary`, `findingType` string,
   `linkedEvidence` array, `provisionalFlag` false), **no raw 500**;
4. `linkEvidenceToFinding` then `unlinkEvidenceFromFinding` persist via `metadata`, **no raw 500**
   (emits real audit events against a real `users` row — FK `audit_events_actor_id_fkey` satisfied);
5. a foreign workspace gets `NotFoundError` (tenant isolation preserved).

---

## F2 — owner/dashboard `db.KPI` (DISPROVEN — false positive, product unchanged)

### Audit theory
`owner/dashboard/route.ts:125` calls `db.KPI.findMany(...)`. The audit claimed the generated Prisma
delegate is `db.kPI`, so `db.KPI` is `undefined` → `undefined.findMany()` throws a 500 on every
`GET /api/owner/dashboard`.

### Why it is false
`db` (`src/lib/db.ts`) is a `$extends`-ed Prisma client behind a lazy Proxy. Adversarial runtime testing
against a real database proves the extended client exposes **both** `KPI` and `kPI` as working delegates,
on **both** Proxy paths:

| path (matches) | `db.KPI` | `db.KPI.findMany()` |
|---|---|---|
| cold / deferred (pre-init) | defined (object) | ✅ returns rows, no throw |
| hot / fast (post-init — **production**) | defined (object) | ✅ returns rows, no throw |

`getDbInstance()` (which sets `globalForPrisma.prisma`, forcing the production fast path) followed by
`db.KPI.findMany({ take: 1 })` returns rows with no error. So `db.KPI.findMany(...)` **never throws** and
there is **no owner-dashboard 500**.

### Why the audit got it wrong
The earlier "[V] verified" tag rested on static signals only — grep casing counts (13 `db.kPI` vs 1
`db.KPI`) and reading generated `class.ts` — and was **never runtime-tested**. The Proxy + `$extends`
tolerance of the exact model name (`KPI`) was missed. This is logged as a verification-method gap, not a
product bug.

### Action taken
Per the mission rule *"keep product changes minimal and only fix if active tests prove a real defect,"* the
speculative `db.KPI → db.kPI` edit was **reverted** — `route.ts` has **zero net diff**. F2 is reclassified
**CLEARED FALSE POSITIVE**. The DB test
`src/services/__tests__/owner-dashboard-kpi-delegate.db.test.ts` now asserts the **verified truth** (both
delegates resolve on the fast path; the exact dashboard KPI query returns the workspace KPI), locking the
false positive so it cannot be re-opened while keeping real DB coverage of the dashboard KPI query.

---

## Gates (local, this branch)

- **DB tests:** `findings-invalid-select.db.test.ts` + `owner-dashboard-kpi-delegate.db.test.ts` →
  **7 passed / 7** (`TEST_WITH_DB=true`, local Postgres :5433).
- **Regression:** `diagnosis-value-path.test.ts` (imports `@/services/findings`) → **20 passed / 20**.
- **tsc:** `tsc --noEmit` → **exit 0**.
- **lint:ratchet:** **PASS** — errors 2081 < baseline 2155; `changed_file_lint_errors: 0`.
- **governance:scan:strict:** **exit 0** — 0 NEW findings (30 pre-existing frozen by baseline).

---

## Explicitly NOT done (out of scope, untouched)
- No Prisma schema change; no fake fields/columns.
- F3 / F4 / F8 / F10 / F11 / F12 (and F5/F6/F7/F9/F13) — remain in the hostile-audit backlog for later phases.
- No quarantine Wave 2 reactivation.
- No production migration, no production DB access, no secret changes.
  (The only authorizing phrase — "I approve running the production migration." — has not been given.)

## Known limitations
- F1's linked-evidence set now lives in `Finding.metadata.linkedEvidenceIds` (JSON), not a relational
  column. This is the correct minimal fix given the schema and the "no schema change" constraint; a future
  slice may promote it to a first-class relation if relational querying is required.
- F2's clearance is proven for the current `$extends` client; if the Prisma model is ever renamed the
  regression test will re-flag the delegate immediately.
